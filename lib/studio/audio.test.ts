import { describe, it, expect } from "vitest";
import { makePatch } from "./music";
import { createInstrument } from "./audio";

/**
 * The instrument's graph, against a stub context that records every
 * connection. Vitest runs in node here and has no Web Audio, so this checks
 * the wiring, not the sound: the browser half is `scripts/studio-check`.
 */
type Node = { kind: string; out: Node[]; connect: (to: Node) => Node; disconnect: () => void; [key: string]: unknown };

function stubContext() {
  const nodes: Node[] = [];
  const param = () => ({
    value: 0,
    setTargetAtTime() {},
    setValueAtTime() {},
    cancelScheduledValues() {},
    exponentialRampToValueAtTime() {},
  });
  const make = (kind: string, extra: Record<string, unknown> = {}): Node => {
    const node: Node = {
      kind,
      out: [],
      connect(to: Node) {
        node.out.push(to);
        return to;
      },
      disconnect() {},
      ...extra,
    };
    nodes.push(node);
    return node;
  };
  const destination = make("destination");
  const context = {
    currentTime: 0,
    destination,
    createGain: () => make("gain", { gain: param() }),
    createBiquadFilter: () => make("filter", { frequency: param(), Q: param(), type: "" }),
    createDelay: () => make("delay", { delayTime: param() }),
    createDynamicsCompressor: () => make("limiter"),
    createAnalyser: () => make("analyser", { fftSize: 0, smoothingTimeConstant: 0 }),
    createStereoPanner: () => make("panner", { pan: param() }),
    createOscillator: () => make("osc", { frequency: param(), type: "", start() {}, stop() {}, onended: null }),
  };
  return { context: context as unknown as BaseAudioContext, nodes, destination };
}

describe("the instrument's graph", () => {
  it("hands the scope an analyser that hears exactly what reaches the speakers", () => {
    const { context, nodes, destination } = stubContext();
    const synth = createInstrument(context, makePatch(0));
    const analyser = nodes.find((n) => n.kind === "analyser");
    const limiter = nodes.find((n) => n.kind === "limiter");
    expect(analyser).toBeDefined();
    expect(synth.scope).toBe(analyser);
    // In line after the limiter, so the trace is the output, not a guess at it.
    expect(limiter?.out).toEqual([analyser]);
    expect(analyser?.out).toEqual([destination]);
    // Nothing else reaches the speakers around it.
    expect(nodes.filter((n) => n.out.includes(destination))).toEqual([analyser]);
  });

  it("gives the scope a window long enough to hold a whole cycle of the lowest note", () => {
    const { context, nodes } = stubContext();
    createInstrument(context, makePatch(3));
    const analyser = nodes.find((n) => n.kind === "analyser");
    // C2 is about 65 Hz: 675 samples a cycle at 44.1 kHz. The trigger looks in
    // the first half of the buffer and draws a window after it.
    expect(analyser?.fftSize).toBeGreaterThanOrEqual(2048);
  });
});
