import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { musicCopy } from "@/content/studio/music-copy";
import { resonance } from "@/content/tools/resonance";

/**
 * A source-coupling check, not a render: vitest runs in a node environment
 * here, so nothing can mount the instrument. The behaviour it promises is
 * driven in a browser by `scripts/studio-check/resonance.mjs` and
 * `scripts/studio-boundaries/resonance.mjs`; this file pins the wiring those
 * checks cannot see, and `scripts/mutation-check.mjs` breaks each guard to
 * prove it bites.
 *
 * Line endings are normalised and comments stripped first, so a docblock
 * that mentions a call can never stand in for the call.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const tool = read("components", "studio", "Resonance.tsx");
const css = read("app", "tools", "resonance", "tool.css");
const jsx = tool.slice(tool.indexOf("return (\n    <div\n      className=\"lab-work studio studio-music reso\""));
/** The body of a named function or handler, up to its closing brace at that indent. */
const body = (name: string, indent = 2) =>
  tool.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n {${indent}}\\}`))?.[0] ?? "";

describe("the face", () => {
  it("is a client component that found the JSX it means to check", () => {
    expect(tool.startsWith('"use client"')).toBe(true);
    expect(jsx.length).toBeGreaterThan(3000);
  });

  it("puts the instrument first: the scope, then the play key, before any control or sentence", () => {
    const scope = jsx.indexOf('className="reso__scope"');
    const play = jsx.indexOf('className="reso-play"');
    expect(scope).toBeGreaterThan(0);
    expect(play).toBeGreaterThan(scope);
    for (const tag of ["<p", "<Segmented", "<Knob", "<ExportBar", "<FilePicker", "<h"]) {
      const at = jsx.indexOf(tag);
      if (at >= 0) expect(at, tag).toBeGreaterThan(play);
    }
  });

  it("has no heading, legend, fieldset or paragraph of instructions on the stage", () => {
    expect(jsx).not.toMatch(/<h[1-6][\s>]/);
    expect(jsx).not.toMatch(/<fieldset|<legend/);
    // One paragraph is allowed: the alert that names a failure.
    const paragraphs = [...jsx.matchAll(/<p\b[^>]*>/g)].map((m) => m[0]);
    expect(paragraphs).toEqual(['<p className="reso__error" role="alert">']);
  });

  it("leaves no stock control: every value is a kit Knob, every choice a Segmented, every button designed", () => {
    expect(tool).not.toMatch(/type="range"|<select|<input\b|<textarea/);
    expect(tool).not.toMatch(/import \{[^}]*\b(Button|Field|FileInput)\b[^}]*\} from "@\/components\/lab\/shared"/);
    expect(jsx).not.toMatch(/<Button\b|<Press\b/);
    const buttons = [...jsx.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const tag of buttons) expect(tag, tag).toMatch(/className=/);
  });

  it("turns tempo, key, scale, swing, output, brightness and echo on kit knobs, in one row", () => {
    const row = jsx.slice(jsx.indexOf('className="reso__dials"'), jsx.indexOf('className="reso__voice-dials"'));
    const labels = [...row.matchAll(/<Knob[\s\S]*?label=\{c\.(\w+)\}/g)].map((m) => m[1]);
    expect(labels).toEqual(["bpm", "root", "scale", "swing", "volume", "cutoff", "delay"]);
    expect(musicCopy.bpm).toBe("Tempo");
  });

  it("chooses the sound world with the kit's segmented control", () => {
    expect(jsx).toMatch(/<Segmented[\s\S]*?label=\{c\.preset\}/);
  });

  it("draws the four voices as four rows of sixteen pads in one grid, with mute and solo at each row's edge", () => {
    const grid = jsx.slice(jsx.indexOf('className="reso__matrix"'), jsx.indexOf('className="reso__dials"'));
    expect(grid).toContain("patch.voices.map(");
    expect(grid).toContain("v.steps.map(");
    expect(grid).toContain("toggleStep(");
    expect(grid.indexOf('className="reso-voice"')).toBeLessThan(grid.indexOf('className="reso-cell"'));
    expect(grid).toMatch(/aria-label=\{c\.mute\(i \+ 1\)\}/);
    expect(grid).toMatch(/aria-label=\{c\.solo\(i \+ 1\)\}/);
    expect(grid).toMatch(/aria-label=\{c\.cell\(i \+ 1, s \+ 1\)\}/);
    expect(musicCopy.cell(1, 2)).toBe("Voice 1, step 2");
    expect(musicCopy.voice(1)).toBe("Play voice 1");
  });

  it("keeps the WAV's honesty as one short line on the export row", () => {
    expect(jsx).toMatch(/<ExportBar[\s\S]*?note=\{c\.wavNote\}/);
    expect(musicCopy.wavNote.toLowerCase()).toContain("eight bars");
    expect(musicCopy.wavNote.toLowerCase()).toContain("release tail");
    expect(musicCopy.wavNote.length).toBeLessThanOrEqual(60);
  });
});

describe("silent until a deliberate press", () => {
  it("creates an AudioContext in exactly one place", () => {
    expect([...tool.matchAll(/new AudioContext\(/g)]).toHaveLength(1);
    expect(body("ready")).toContain("new AudioContext(");
  });

  it("starts audio only from the play key and a voice press", () => {
    const callers = [...tool.matchAll(/await ready\(\)/g)];
    expect(callers).toHaveLength(2);
    expect(body("pluck")).toContain("await ready()");
    expect(body("togglePlay")).toContain("await ready()");
    // A knob, the pad or a pad in the grid may sound a voice only through an
    // engine that already exists, never by starting one.
    expect(tool).toMatch(/const live = engine\.current;\n\s+if \(live\)/);
  });

  it("silences everything when the tab hides, the page goes, the route unmounts or Escape is pressed", () => {
    expect(tool).toMatch(/if \(document\.hidden\) stop\(\);/);
    expect(tool).toContain('window.addEventListener("pagehide", stop)');
    expect(tool).toMatch(/else if \(e\.key === "Escape"\) stop\(\);/);
    const unmount = tool.match(/return \(\) => \{\n\s+mounted\.current = false;[\s\S]*?\n {4}\};/)?.[0] ?? "";
    expect(unmount).toContain("silence()");
    expect(unmount).toContain("context.close()");
  });
});

describe("the one frame clock", () => {
  it("starts no loop of its own", () => {
    expect(tool).not.toMatch(/requestAnimationFrame|setInterval/);
    expect(tool).toContain("onFrame(");
  });

  it("subscribes to the clock only while the sequence plays, so the face costs nothing at rest", () => {
    const effect = tool.match(/useEffect\(\(\) => \{\n\s+if \(!playing\) return;[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? "";
    expect(effect).toContain("onFrame(");
    expect(effect).toMatch(/return onFrame\(|const off = onFrame\(/);
  });

  it("schedules off the audio clock through the tested sequencer, never off the frame's dt", () => {
    for (const call of ["advance(", "horizon(", "playheadAt("]) expect(tool, call).toContain(call);
    expect(tool).toContain("context.currentTime");
    expect(tool).not.toMatch(/\+= dt|60 \/ p\.bpm|60 \/ patch\.bpm/);
  });

  it("draws the scope and the playhead only while on screen, and never animates them under reduced motion", () => {
    expect(tool).toContain("new IntersectionObserver(");
    expect(tool).toMatch(/if \(!seen\.current\) return;/);
    expect(tool).toMatch(/const position = reducedMotion \? head\.column : head\.column \+ head\.phase;/);
    expect(tool).toMatch(/if \(!reducedMotion\) drawTrace\(/);
    expect(tool).toContain("stillTrace(");
  });

  it("draws the trace from what the analyser heard, through the tested scope module", () => {
    for (const call of ["getFloatTimeDomainData(", "trigger(", "autoGain(", "trace("]) expect(tool, call).toContain(call);
  });

  it("goes dark when the sound stops", () => {
    const stop = tool.match(/const stop = useCallback\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? "";
    expect(stop).toContain("sequence = false");
    expect(stop).toMatch(/darken\(\)/);
  });

  it("fades the pad's trail off the clock only while it has points, and not at all under reduced motion", () => {
    expect(tool).toMatch(/if \(reducedMotion\) return;[\s\S]{0,200}trail/);
    expect(tool).toMatch(/if \(!live\.length\) \{[\s\S]{0,80}off/);
  });
});

describe("colours and faces come from the machine", () => {
  it("holds no colour of its own and reads the phosphor off the canvas", () => {
    expect(tool).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(tool).not.toMatch(/rgba?\(/);
    expect(tool).toMatch(/getComputedStyle\(canvas\)/);
  });

  it("maps the pad through the tested module, so the knobs and the puck agree", () => {
    for (const call of ["padToSound(", "soundToPad(", "padPoint(", "extendTrail(", "liveTrail(", "trailAlpha("]) {
      expect(tool, call).toContain(call);
    }
    expect(tool).not.toMatch(/80 \*\* |Math\.log\(80\)/);
  });

  it("styles only its own classes, reading the shell's tokens", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    // Motion in the stylesheet only under no-preference.
    const motion = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(motion).not.toMatch(/transition:|animation:/);
  });
});

describe("the words", () => {
  it("moved the instructions off the face and into the shell's one disclosure", () => {
    const words = JSON.stringify(musicCopy);
    expect(words).not.toMatch(/pendulum/i);
    expect(musicCopy).not.toHaveProperty("stageHelp");
    expect(musicCopy).not.toHaveProperty("padHelp");
    expect(musicCopy).not.toHaveProperty("hint");
    const method = (resonance.method ?? []).join(" ");
    expect(method).toMatch(/A S D F/);
    expect(method).toMatch(/Escape/);
    expect(method).toMatch(/hide the tab|tab is hidden/);
    expect(method).toMatch(/release tail/);
  });

  it("says nothing on the page about pendulums the face no longer has", () => {
    expect(JSON.stringify(resonance)).not.toMatch(/pendulum/i);
  });
});
