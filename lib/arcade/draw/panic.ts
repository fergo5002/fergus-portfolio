import { KERNEL_Y, targetOf, type PanicState } from "../games/panic";
import { screenCopy } from "@/content/arcade-collection";
import { box, line, text, type Pen } from "./kit";

/**
 * Kernel Panic's world, for the stub: falling process names, the kernel line,
 * and the letters typed so far lit inside the name they are aimed at. The
 * next agent replaces this with the real game's drawing.
 */
export function drawPanic(pen: Pen, s: PanicState, _hud: boolean) {
  const { c, p } = pen;
  line(c, { x: 20, y: KERNEL_Y }, { x: 880, y: KERNEL_Y }, s.flash > 0 ? p.accent : p.bright, 2, s.flash > 0 ? p.accentGlow : p.brightGlow);
  box(c, 20, KERNEL_Y + 6, 860, 22, p.inkSoft, null);
  text(pen, screenCopy.kernel, 450, KERNEL_Y + 23, 18, p.dim, "center", true);
  const target = targetOf(s);
  for (const proc of s.processes) {
    const danger = proc.y > KERNEL_Y - 90;
    const size = 28;
    c.font = `${size}px ${pen.theme.display}`;
    const w = Math.max(40, (c.measureText(proc.name).width || proc.name.length * 12) + 18);
    box(c, proc.x - w / 2, proc.y - size + 2, w, size + 8, p.panel, danger ? p.accent : p.dim, proc === target ? p.inkGlow : undefined, 1);
    const typed = proc === target ? s.buffer.length : 0;
    const typedPart = proc.name.slice(0, typed), rest = proc.name.slice(typed);
    const left = proc.x - (c.measureText(proc.name).width || proc.name.length * 12) / 2;
    text(pen, typedPart, left, proc.y + 2, size, p.bright, "left", true);
    const offset = c.measureText(typedPart).width || typedPart.length * 12;
    text(pen, rest, left + offset, proc.y + 2, size, danger ? p.accent : p.ink, "left", true);
  }
}
