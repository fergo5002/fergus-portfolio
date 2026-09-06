import {
  audible,
  encodeWav,
  stepTime,
  type StudioPatch,
  type Voice,
} from "./music";
export function createInstrument(
  context: BaseAudioContext,
  p: StudioPatch,
  maxVoices = 128,
) {
  const input = context.createGain(),
    filter = context.createBiquadFilter(),
    delay = context.createDelay(2),
    feedback = context.createGain(),
    wet = context.createGain(),
    master = context.createGain(),
    limiter = context.createDynamicsCompressor();
  input.gain.value = 0.22;
  filter.type = "lowpass";
  filter.frequency.value = p.cutoff;
  filter.Q.value = 0.7;
  delay.delayTime.value = (60 / p.bpm) * 0.75;
  feedback.gain.value = p.delay;
  wet.gain.value = 0.4;
  master.gain.value = p.volume;
  input.connect(filter);
  filter.connect(master);
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
  let voices = 0;
  const active = new Set<OscillatorNode>();
  function pluck(v: Voice, when = context.currentTime, velocity = 1) {
    if (voices >= maxVoices) return;
    voices++;
    const osc = context.createOscillator(),
      gain = context.createGain(),
      pan = context.createStereoPanner();
    active.add(osc);
    osc.type = v.wave;
    osc.frequency.value = 440 * Math.pow(2, (v.note - 69) / 12);
    pan.pan.value = v.pan;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, 0.75 * velocity),
      when + 0.009,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + v.decay + 0.02);
    osc.connect(gain);
    gain.connect(pan);
    pan.connect(input);
    osc.start(when);
    osc.stop(when + v.decay + 0.04);
    osc.onended = () => {
      voices--;
      active.delete(osc);
      osc.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
  }
  function update(next: StudioPatch) {
    const t = context.currentTime;
    master.gain.setTargetAtTime(next.volume, t, 0.03);
    filter.frequency.setTargetAtTime(next.cutoff, t, 0.03);
    feedback.gain.setTargetAtTime(next.delay, t, 0.05);
    delay.delayTime.setTargetAtTime((60 / next.bpm) * 0.75, t, 0.1);
  }
  function silence() {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(0, context.currentTime);
    for (const osc of active)
      try {
        osc.stop();
      } catch {}
  }
  return { pluck, update, silence };
}
export async function renderWav(p: StudioPatch, bars = 8) {
  const duration = stepTime(16 * bars, p) + 3,
    context = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100),
    synth = createInstrument(context, p, Infinity);
  for (let s = 0; s < 16 * bars; s++)
    for (let i = 0; i < 4; i++)
      if (audible(p.voices, i) && p.voices[i].steps[s % 16])
        synth.pluck(p.voices[i], stepTime(s, p));
  const buffer = await context.startRendering();
  return new Blob(
    [encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], 44100)],
    { type: "audio/wav" },
  );
}
