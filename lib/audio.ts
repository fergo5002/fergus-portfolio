/**
 * The tube's voice.
 *
 * Every sound on this site is synthesised at runtime from oscillators and
 * shaped noise: there is not one audio file in the repo. That is partly taste
 * (a portfolio that ships a megabyte of WAVs to play a click has lost the plot)
 * and partly the only honest way to do it: the degauss sound has to sweep with
 * the same curve the shader's shockwave expands on, and the beam hiss has to
 * track scroll velocity continuously. Neither is a sample you trigger.
 *
 * Nothing here makes noise until `enable()` is called from a user gesture, and
 * every method is inert when the Web Audio API is missing, so an unsupported
 * browser gets a silent site rather than a broken one.
 */

/**
 * 625 lines x 25 frames: the line frequency of a European tube.
 *
 * The power-on ramp still sweeps up to it, which is the moment it is worth
 * hearing. It used to also run continuously, along with a 50 Hz mains hum, as an
 * ambient bed. That was removed: a nonstop tone plus a nonstop drone is a whirr,
 * and a whirr is what someone reaches for the mute button over. Nothing sounds
 * at rest now, only when something actually happens.
 */
export const FLYBACK_HZ = 15625;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Loudness of a collision. Silent below the threshold so a settling pile fades out. */
export function impactGain(energy: number): number {
  const e = clamp01(energy);
  if (e < 0.04) return 0;
  return Math.min(0.22, 0.02 + e * 0.2);
}

/**
 * Pitch of a collision. Harder hits are lower, the way a heavier object sounds,
 * and the seed spreads a pile of simultaneous impacts across a small band so
 * twelve words landing together read as gravel rather than one loud beep.
 */
export function impactFreq(energy: number, seed: number): number {
  const e = clamp01(energy);
  const base = 900 - e * 640;
  // Deterministic hash in [-1, 1].
  const h = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  const jitter = (h - Math.floor(h)) * 2 - 1;
  return Math.max(70, Math.min(1900, base * (1 + jitter * 0.28)));
}

/** Hiss from the beam being dragged across the phosphor. Silent at rest. */
export function beamNoiseGain(velocity: number): number {
  const v = Math.abs(velocity);
  if (!Number.isFinite(v) || v < 0.02) return 0;
  return Math.min(0.05, (v - 0.02) * 0.055);
}

type Ctor = { new (): AudioContext };

function audioContextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class TubeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private ui: GainNode | null = null;
  private fx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private beam: GainNode | null = null;
  private muted = false;
  private impactBudget = 0;
  private impactWindow = 0;
  private seed = 0;

  /** True once the graph is live and unmuted. */
  get running(): boolean {
    return this.ctx !== null && !this.muted;
  }

  /**
   * Build the graph. Should be called from a user gesture, since that is the
   * only moment a browser will let the context leave the suspended state.
   * Returns whether audio is available at all.
   *
   * The graph is built BEFORE resuming, and the resume is deliberately not
   * awaited. Under the autoplay policy `resume()` does not always reject when
   * it cannot proceed: it can simply stay pending indefinitely. Awaiting it
   * first therefore left the whole synth unbuilt and this method hung forever,
   * so no sound would play even once the context later unblocked. Building
   * first means everything is wired and ready the instant it does.
   */
  async enable(): Promise<boolean> {
    if (this.ctx) {
      void this.ctx.resume().catch(() => {});
      this.setMuted(false);
      return true;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return false;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return false;
    }
    this.ctx = ctx;

    // A compressor on the master bus, because a pile of words landing at once
    // can stack twenty impact voices in the same 50ms and clip hard without it.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    this.master = master;

    const mk = (gain: number) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(master);
      return g;
    };
    this.ambient = mk(1);
    this.ui = mk(1);
    this.fx = mk(1);

    // Two seconds of white noise, reused by every noise-based voice.
    const frames = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.startAmbient();
    void ctx.resume().catch(() => {});
    return true;
  }

  /**
   * The one continuous voice: beam noise, and it is silent until you scroll.
   *
   * There used to be an ambient bed under this (a 15.625 kHz flyback whine, a
   * 50 Hz mains hum with two harmonics, and a highpassed phosphor hiss). All
   * three are gone. Individually each was a defensible piece of CRT modelling;
   * together they were a nonstop drone, and a nonstop drone is the thing people
   * mute. The tube now makes no sound at all at rest, which also means enabling
   * audio costs nothing until the visitor does something.
   */
  private startAmbient(): void {
    const ctx = this.ctx;
    const bus = this.ambient;
    if (!ctx || !bus || !this.noise) return;

    // ── beam noise, driven per-frame by scroll velocity ──────────────────────
    const beamSrc = ctx.createBufferSource();
    beamSrc.buffer = this.noise;
    beamSrc.loop = true;
    const beamBp = ctx.createBiquadFilter();
    beamBp.type = "bandpass";
    beamBp.frequency.value = 1700;
    beamBp.Q.value = 0.7;
    const beamGain = ctx.createGain();
    beamGain.gain.value = 0;
    beamSrc.connect(beamBp).connect(beamGain).connect(bus);
    beamSrc.start();
    this.beam = beamGain;
  }

  /** Per-frame. `velocity` is the system frame's normalised scroll speed. */
  setBeam(velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.beam) return;
    // setTargetAtTime rather than a direct assignment: this is called sixty
    // times a second and a stepped gain is audible as zipper noise.
    this.beam.gain.setTargetAtTime(beamNoiseGain(velocity), ctx.currentTime, 0.05);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.08);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.beam = null;
    this.master = null;
    ctx?.close().catch(() => {});
  }

  /* ── one-shot voices ───────────────────────────────────────────────────── */

  /** A short burst of the shared noise buffer through a filter. */
  private burst(
    bus: GainNode,
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    dur: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    // Start at a random offset so repeated clicks are not bit-identical.
    const offset = Math.random() * 1.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, offset, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  /** A decaying tone, optionally sweeping. */
  private tone(
    bus: GainNode,
    type: OscillatorType,
    from: number,
    to: number,
    gain: number,
    dur: number,
    sweep = dur,
  ): OscillatorNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + sweep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** A keystroke on a membrane keyboard. */
  key(): void {
    if (!this.ui) return;
    this.burst(this.ui, "bandpass", 2400, 2.5, 0.06, 0.02);
    this.tone(this.ui, "square", 1500, 900, 0.012, 0.02);
  }

  /** Focus/hover tick. Deliberately almost subliminal. */
  hover(): void {
    if (!this.ui) return;
    this.tone(this.ui, "sine", 2400, 2400, 0.012, 0.03);
  }

  /** The electromechanical clunk of a relay throwing over. */
  relay(): void {
    if (!this.ui) return;
    this.burst(this.ui, "bandpass", 850, 5, 0.17, 0.018);
    this.tone(this.ui, "sine", 62, 44, 0.14, 0.09);
  }

  /**
   * The degauss coil: a decaying low sweep with a heavy tremolo on it. This is
   * the sound the whole feature is worth building for: everyone over about
   * twenty-five recognises it instantly and has no idea why.
   */
  degauss(): void {
    const ctx = this.ctx;
    const bus = this.fx;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    g.connect(bus);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 1.5);

    // The tremolo IS the degauss sound: the field is alternating at mains
    // frequency while its amplitude collapses. Without it this is just a sad
    // falling tone.
    const trem = ctx.createOscillator();
    trem.type = "sine";
    trem.frequency.setValueAtTime(23, t);
    trem.frequency.exponentialRampToValueAtTime(9, t + 1.4);
    const tremDepth = ctx.createGain();
    tremDepth.gain.setValueAtTime(0.75, t);
    tremDepth.gain.linearRampToValueAtTime(0.1, t + 1.4);
    const tremGain = ctx.createGain();
    tremGain.gain.value = 1;
    trem.connect(tremDepth).connect(tremGain.gain);

    o.connect(tremGain).connect(g);
    o.start(t);
    trem.start(t);
    o.stop(t + 1.8);
    trem.stop(t + 1.8);

    // The magnetic rush over the top of it.
    this.burst(bus, "lowpass", 2600, 0.8, 0.09, 0.45);
  }

  /** A dull knock on the case. */
  thud(): void {
    if (!this.fx) return;
    this.tone(this.fx, "sine", 78, 38, 0.3, 0.28);
    this.burst(this.fx, "lowpass", 300, 0.7, 0.13, 0.09);
  }

  /** Power-on: the thump, the tube spinning up, and the static settling. */
  powerOn(): void {
    const ctx = this.ctx;
    const bus = this.fx;
    if (!ctx || !bus) return;
    this.thud();

    // The tube coming up to line frequency.
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(FLYBACK_HZ, t + 1.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 2.2);

    this.burst(bus, "highpass", 3400, 0.6, 0.07, 0.6);
  }

  /** Collision tick. Rate limited: a collapsing pile can fire hundreds. */
  impact(energy: number): void {
    const ctx = this.ctx;
    const bus = this.ui;
    if (!ctx || !bus) return;
    const gain = impactGain(energy);
    if (gain <= 0) return;

    const now = ctx.currentTime;
    if (now - this.impactWindow > 0.05) {
      this.impactWindow = now;
      this.impactBudget = 5;
    }
    if (this.impactBudget-- <= 0) return;

    const freq = impactFreq(energy, this.seed++);
    this.tone(bus, "triangle", freq, freq * 0.6, gain, 0.05 + energy * 0.07);
    this.burst(bus, "bandpass", freq * 2.4, 1.6, gain * 0.5, 0.02);
  }

  /** The servo whirr of the assembly moving. `dir` is 1 out, -1 back in. */
  eject(dir: number): void {
    const bus = this.fx;
    if (!bus) return;
    const from = dir > 0 ? 90 : 190;
    const to = dir > 0 ? 190 : 90;
    this.tone(bus, "sawtooth", from, to, 0.045, 0.85, 0.8);
    this.burst(bus, "lowpass", 700, 0.5, 0.05, 0.8);
  }
}
