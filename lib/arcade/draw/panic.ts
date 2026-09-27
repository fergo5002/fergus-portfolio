import { screenCopy } from "@/content/arcade-collection";
import { captionOf, CHIP_TYPE, chipGeometry, DUMP_TIME, KERNEL_Y, multiplier, SPAWN_Y, targetOf, type ChipGeometry, type Dump, type PanicState, type Proc } from "../games/panic";
import type { Point } from "../games/types";
import type { StageKind } from "../layout";
import { box, circle, glowText, line, text, type Pen } from "./kit";

/**
 * Kernel Panic's world: a process table falling on to a kernel.
 *
 * Top to bottom: the rogue processes, each a name on a dark chip with its PID
 * in small print over it; the kernel, a double rule with its name in the
 * middle and a crack wherever something got through; and under it the
 * prompt, which echoes what is being typed and the combo. The turret on the
 * kernel turns to the locked process, and every right letter draws a shot
 * from it to that letter.
 *
 * The letters typed so far are drawn inverted, dark on phosphor, the way a
 * terminal shows a selection, so the half-typed word is legible at a glance
 * from across the room. The locked process carries corner brackets. A name in
 * its last stretch before the kernel turns amber; a sudo is amber all the way
 * down, on a lit chip, because it is the one thing on screen you want to hit.
 *
 * Every chip is drawn to `chipGeometry`, the box the spawner spaces chips
 * by, and every string is fitted into it (a name shrinks if the face is wider
 * than the model allows; the small print is squeezed with `maxWidth`), so what
 * is drawn never outgrows what was kept clear.
 *
 * When the kernel panics the screen halts on a panic dump typed out a line at
 * a time over the frozen processes. All colour comes from the palette.
 */

export { chipLeft } from "../games/panic";

type Sizes = { prompt: number; kernel: number; mult: number; pop: number; dump: number; dumpGap: number; pad: number };
const SIZES: Record<StageKind, Sizes> = {
  wide: { prompt: 26, kernel: 17, mult: 34, pop: 22, dump: 13, dumpGap: 17, pad: CHIP_TYPE.wide.pad },
  // A phone draws the 900-wide world about 360 pixels across: everything a thumb has to read goes up by two thirds.
  tall: { prompt: 40, kernel: 26, mult: 50, pop: 34, dump: 22, dumpGap: 28, pad: CHIP_TYPE.tall.pad },
};

/** Where a process's amber stretch begins, in world pixels above the kernel. */
const DANGER = 110;
const PROMPT_Y = KERNEL_Y + 62;
const CANNON: Point = { x: 450, y: KERNEL_Y - 4 };

/** A number as the kernel prints a pointer offset. */
const hex = (n: number) => `0x${(n >>> 0).toString(16)}`;

/**
 * The panic dump for a run, from the template in `content/arcade-collection.ts`.
 * The addresses come from the dump's own dice, so a run always halts on the
 * same text. `stamps` prefixes the kernel's timestamps where there is room.
 */
export function dumpLines(dump: Dump, template: readonly string[], stamps: boolean): string[] {
  let x = dump.code >>> 0 || 1;
  const next = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
  const fields: Record<string, string> = {
    pid: String(dump.pid),
    comm: dump.comm,
    a: hex(0x20 + (next() % 0x40)),
    b: hex(0x100 + (next() % 0x2a0)),
    c: hex(0x10 + (next() % 0x30)),
    d: hex(0x200 + (next() % 0x900)),
    offset: hex((next() & 0x3f) << 24),
  };
  return template.map((raw, i) => {
    const body = raw.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? "");
    if (!stamps) return body.trimStart() === body ? body : ` ${body.trimStart()}`;
    const stamp = (dump.at + i * 0.000003).toFixed(6).padStart(12);
    return `[${stamp}] ${body}`;
  });
}

function font(pen: Pen, size: number) {
  pen.c.font = `${size}px ${pen.theme.display}`;
}

function measure(pen: Pen, value: string, size: number): number {
  font(pen, size);
  return pen.c.measureText(value).width || value.length * size * 0.45;
}

/** A chip as drawn: the model's geometry, and the name's fitted size and start. */
type Chip = ChipGeometry & { fit: number; x0: number; baseline: number };

function chipOf(pen: Pen, p: Proc, layout: StageKind): Chip {
  const g = chipGeometry(p, layout);
  const inner = g.chip.w - CHIP_TYPE[layout].pad * 2;
  const full = measure(pen, p.name, g.size);
  const fit = full > inner ? g.size * (inner / full) : g.size;
  const x0 = g.chip.x + (g.chip.w - measure(pen, p.name, fit)) / 2;
  return { ...g, fit, x0, baseline: p.y };
}

/** Small print in the mono, never wider than `max`. */
function print(pen: Pen, value: string, x: number, y: number, size: number, colour: string, max: number) {
  const { c } = pen;
  c.font = `${size}px ${pen.theme.mono}`;
  c.fillStyle = colour;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(value, x, y, max);
}

/** The middle of letter `index` of a process's name, for a shot to land on. */
function letterAt(pen: Pen, p: Proc, chip: Chip, index: number): Point {
  const before = measure(pen, p.name.slice(0, index), chip.fit);
  const own = measure(pen, p.name[index] ?? " ", chip.fit);
  return { x: chip.x0 + before + own / 2, y: chip.chip.y + chip.chip.h / 2 };
}

function brackets(pen: Pen, box: { x: number; y: number; w: number; h: number }, colour: string, glow: string) {
  const { c } = pen;
  const k = Math.min(12, box.h * 0.4), o = 5;
  const l = box.x - o, r = box.x + box.w + o, t = box.y - o, b = box.y + box.h + o;
  for (const [x, y, dx, dy] of [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]] as const) {
    c.beginPath();
    c.moveTo(x + dx * k, y);
    c.lineTo(x, y);
    c.lineTo(x, y + dy * k);
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = glow;
    c.lineWidth = 6;
    c.stroke();
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = colour;
    c.lineWidth = 2;
    c.stroke();
  }
}

/** A fork's mark, inside its box: the branch it is about to become. */
function forkMark(pen: Pen, r: { x: number; y: number; w: number; h: number }, colour: string) {
  const { c } = pen;
  const x = r.x + r.w / 2, arm = r.w * 0.45;
  c.beginPath();
  c.moveTo(x, r.y + r.h * 0.85);
  c.lineTo(x, r.y + r.h * 0.5);
  c.lineTo(x - arm, r.y + r.h * 0.15);
  c.moveTo(x, r.y + r.h * 0.5);
  c.lineTo(x + arm, r.y + r.h * 0.15);
  c.strokeStyle = colour;
  c.lineWidth = 2;
  c.stroke();
}

function drawProcess(pen: Pen, s: PanicState, p: Proc, locked: boolean, chip: Chip, layout: StageKind, hud: boolean): void {
  const { c, p: pal } = pen;
  const r = chip.chip;
  const sudo = p.kind === "sudo";
  const danger = !sudo && p.y > KERNEL_Y - DANGER;
  const ink = sudo ? pal.accentBright : danger ? pal.accent : p.kind === "child" ? pal.ink : pal.bright;
  const edge = sudo ? pal.accent : locked ? pal.bright : danger ? pal.accent : p.hit > 0 ? pal.bright : pal.dim;
  const pulse = sudo ? 0.5 + 0.5 * Math.sin(s.time * 6) : 0;
  const glow = sudo ? pal.accentGlow : p.hit > 0 || locked ? pal.brightGlow : undefined;
  box(c, r.x, r.y, r.w, r.h, pal.panel, edge, glow, locked || sudo ? 2 : 1);
  if (sudo) {
    c.globalAlpha = 0.5 + pulse * 0.5;
    box(c, r.x, r.y, r.w, r.h, pal.accentFill, null);
    c.globalAlpha = 1;
  }

  // The letters typed so far, inverted: dark on phosphor.
  const typed = locked ? s.buffer.length : 0;
  if (typed > 0) {
    const w = measure(pen, p.name.slice(0, typed), chip.fit);
    box(c, chip.x0 - 2, r.y + 3, w + 4, r.h - 6, sudo ? pal.accent : pal.bright, null);
    text(pen, p.name.slice(0, typed), chip.x0, chip.baseline, chip.fit, pal.bg, "left", true);
  }
  const rest = p.name.slice(typed);
  const restX = chip.x0 + (typed ? measure(pen, p.name.slice(0, typed), chip.fit) : 0);
  if (typed === 0 && !danger && !sudo && p.kind !== "child") glowText(pen, rest, restX, chip.baseline, chip.fit, ink, pal.inkGlow, "left");
  else text(pen, rest, restX, chip.baseline, chip.fit, ink, "left", true);

  if (hud) {
    const t = CHIP_TYPE[layout];
    print(pen, `${sudo ? "uid 0 " : ""}pid ${pidOf(p)}`, chip.label.x, r.y - 4, t.pid, sudo ? pal.accent : pal.dim, chip.label.w);
    if (chip.caption) print(pen, captionOf(p.kind), chip.caption.x, chip.caption.y + t.pid + 1, t.pid, sudo ? pal.accentBright : pal.ink, chip.caption.w);
  }
  if (chip.mark) forkMark(pen, chip.mark, danger ? pal.accent : pal.ink);
  if (locked) brackets(pen, r, sudo ? pal.accentBright : pal.bright, sudo ? pal.accentGlow : pal.brightGlow);
}

const pidOf = (p: Proc) => 300 + ((p.id * 7919) % 9600);

function drawKernel(pen: Pen, s: PanicState, sz: Sizes) {
  const { c, p } = pen;
  const hit = s.flash > 0;
  const colour = hit ? p.accent : p.bright;
  const glow = hit ? p.accentGlow : p.brightGlow;
  line(c, { x: 16, y: KERNEL_Y }, { x: 884, y: KERNEL_Y }, colour, 2, glow);
  line(c, { x: 16, y: KERNEL_Y + 6 }, { x: 884, y: KERNEL_Y + 6 }, p.dim, 1);
  // Where something got through, the rule is cracked.
  for (const x of s.scars) {
    c.beginPath();
    c.moveTo(x - 10, KERNEL_Y - 7);
    c.lineTo(x - 2, KERNEL_Y + 1);
    c.lineTo(x + 5, KERNEL_Y - 3);
    c.lineTo(x + 11, KERNEL_Y + 11);
    c.strokeStyle = p.accent;
    c.lineWidth = 2;
    c.stroke();
    box(c, x - 3, KERNEL_Y - 2, 6, 10, p.bg, null);
  }
  const label = screenCopy.kernel;
  const w = measure(pen, label, sz.kernel) + sz.pad * 3;
  const top = KERNEL_Y + 11;
  box(c, 450 - w / 2, top, w, sz.kernel * 1.15, p.bg, colour, undefined, 1);
  text(pen, label, 450, top + sz.kernel * 0.88, sz.kernel, colour, "center", true);
}

function drawTurret(pen: Pen, s: PanicState, aim: Point | null) {
  const { c, p } = pen;
  const a = aim ? Math.atan2(aim.y - CANNON.y, aim.x - CANNON.x) : -Math.PI / 2;
  line(c, CANNON, { x: CANNON.x + Math.cos(a) * 26, y: CANNON.y + Math.sin(a) * 26 }, p.bright, 4, aim ? p.brightGlow : undefined);
  circle(c, CANNON.x, CANNON.y, 7, p.bright, true, s.shots.length ? p.brightGlow : undefined);
}

function drawPrompt(pen: Pen, s: PanicState, sz: Sizes) {
  const { c, p } = pen;
  const shake = s.miss > 0 ? Math.sin(s.time * 90) * 5 * (s.miss / 0.35) : 0;
  const x = 28 + shake;
  const colour = s.miss > 0 ? p.accent : p.bright;
  text(pen, ">", x, PROMPT_Y, sz.prompt, p.accent, "left", true);
  const gap = measure(pen, "> ", sz.prompt);
  const w = measure(pen, s.buffer, sz.prompt);
  if (s.buffer) glowText(pen, s.buffer, x + gap, PROMPT_Y, sz.prompt, colour, p.brightGlow, "left");
  if ((s.time * 2.2) % 1 < 0.6 && !s.dump) box(c, x + gap + w + 2, PROMPT_Y - sz.prompt * 0.68, sz.prompt * 0.45, sz.prompt * 0.74, colour, null);
  const mult = multiplier(s);
  glowText(pen, `x${mult}`, 872, PROMPT_Y + 2, sz.mult, mult > 1 ? p.bright : p.dim, mult > 1 ? p.brightGlow : p.inkSoft, "right");
}

function drawDump(pen: Pen, s: PanicState, dump: Dump, layout: StageKind, sz: Sizes) {
  const { c, p } = pen;
  const lines = dumpLines(dump, screenCopy.panicDump, layout === "wide");
  const elapsed = s.time - dump.at;
  const top = layout === "wide" ? 58 : 20;
  box(c, 0, top - 14, 900, 560 - top + 14, p.scrim, null);
  // The longest line has to fit the width, whatever the face measures.
  c.font = `${sz.dump}px ${pen.theme.mono}`;
  const widest = Math.max(...lines.map((l) => c.measureText(l).width || l.length * sz.dump * 0.6));
  const size = Math.max(9, Math.min(sz.dump, sz.dump * (860 / Math.max(1, widest))));
  const gap = size * (sz.dumpGap / sz.dump);
  const shown = Math.min(lines.length, Math.floor(elapsed / (DUMP_TIME * 0.42 / lines.length)) + 1);
  for (let i = 0; i < shown; i++) {
    const y = top + 12 + i * gap;
    const first = i === 0 || i === lines.length - 1;
    text(pen, lines[i], 20, y, size, first ? p.accentBright : i < 3 ? p.ink : p.dim);
  }
  if ((s.time * 2) % 1 < 0.5) box(c, 20, top + 16 + (shown - 1) * gap + gap * 0.25, size * 0.6, size, p.accent, null);
}

/** Kernel Panic's world. `hud` off (an attract screen) keeps the play and drops the small print. */
export function drawPanic(pen: Pen, s: PanicState, hud: boolean, layout: StageKind = "wide") {
  const { c, p } = pen;
  const sz = SIZES[layout];

  // Sudo's sweep: a bright rule running up the screen from the kernel, leaving amber behind it.
  if (s.wipe > 0) {
    const k = 1 - s.wipe / 0.6;
    const y = KERNEL_Y - k * (KERNEL_Y - SPAWN_Y + 40);
    c.globalAlpha = s.wipe / 0.6;
    box(c, 0, y, 900, KERNEL_Y - y, p.accentSoft, null);
    c.globalAlpha = 1;
    line(c, { x: 0, y }, { x: 900, y }, p.accentBright, 3, p.accentGlow);
  }

  const lock = targetOf(s);
  const chips = new Map<number, Chip>();
  for (const proc of s.processes) chips.set(proc.id, chipOf(pen, proc, layout));

  // A shot for every right letter: the turret to the letter, fading fast, under the chips.
  for (const shot of s.shots) {
    const proc = s.processes.find((q) => q.id === shot.pid);
    const chip = proc ? chips.get(proc.id) : undefined;
    const to = proc && chip ? letterAt(pen, proc, chip, shot.index) : shot.to;
    c.globalAlpha = Math.min(1, shot.life / 0.1);
    line(c, CANNON, to, p.bright, 2, p.brightGlow);
    c.globalAlpha = 1;
  }

  for (const proc of s.processes) drawProcess(pen, s, proc, proc === lock, chips.get(proc.id)!, layout, hud);

  drawKernel(pen, s, sz);
  const lockChip = lock ? chips.get(lock.id) : undefined;
  const aim = lock && lockChip ? letterAt(pen, lock, lockChip, Math.min(lock.name.length - 1, s.buffer.length)) : null;
  drawTurret(pen, s, aim);

  for (const pop of s.pops) {
    c.globalAlpha = Math.min(1, pop.life * 2.5);
    glowText(pen, `+${pop.value}`, pop.x, pop.y, sz.pop, p.bright, p.brightGlow);
    c.globalAlpha = 1;
  }

  drawPrompt(pen, s, sz);
  if (s.dump) drawDump(pen, s, s.dump, layout, sz);
}
