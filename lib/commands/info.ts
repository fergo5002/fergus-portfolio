import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { articles } from "@/content/articles";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { formatBoards } from "@/lib/arcade/board";
import { formatUptime } from "@/lib/system";
import { SYSTEM_VERSION } from "@/content/machine";
import { defineCommand } from "./registry";
import { columns, ok, promptPath } from "./shared";
import type { CommandContext } from "./shared";

function neofetch(ctx: CommandContext): string[] {
  const art = [
    "      ▄▄▄▄▄▄▄▄▄      ",
    "    ▄█████████████▄  ",
    "   ███▀  ▄▄▄  ▀███▄  ",
    "  ███   █████   ███  ",
    "  ███   ▀▀▀▀▀   ███  ",
    "   ▀███▄▄   ▄▄███▀   ",
    "     ▀█████████▀     ",
    "        ▀▀▀▀▀        ",
  ];
  const info = [
    `${profile.user}@${profile.host}`,
    "─────────────────────────",
    `OS       FergusOS ${SYSTEM_VERSION}`,
    `Host     ${profile.location}`,
    `Kernel   next-15 · react-19 · webgl · webaudio`,
    `Uptime   ${formatUptime(ctx.uptimeMs ?? 0)}`,
    `Shell    fsh ${SYSTEM_VERSION}`,
    `Display  ${ctx.theme ?? "green"} phosphor · 4:3`,
    // Derived, not typed: this line said "Co-Founder & CTO, Presterly" for a
    // month after that stopped being true.
    `Role     ${experience[0] ? `${experience[0].role} · ${experience[0].org}` : profile.jobTitle}`,
    `Work     ${projects.length} projects · ${articles.length} posts`,
    // By label, not by index: `contact` has grown before and index 0 only
    // happens to be the email.
    `Contact  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
  ];
  // The logo and the facts side by side need about 70 columns. A phone gets
  // the facts alone rather than a logo with every line wrapped through it.
  if ((ctx.cols ?? 80) < 70) return [...info, ...arcadeBlock(ctx)];
  const rows = Math.max(art.length, info.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    out.push(`${(art[i] ?? " ".repeat(21)).padEnd(23)}${info[i] ?? ""}`);
  }
  return [...out, ...arcadeBlock(ctx)];
}

/**
 * The boards, printed only to somebody who has been through the door this
 * session. The spec asks `neofetch` to print the boards and also asks `top` to
 * be the one hint; a permanent block of high scores in `neofetch` would be a
 * second hint and a louder one, so the session flag settles it. It is never
 * persisted, so a reload puts the machine back to one hint.
 */
function arcadeBlock(ctx: CommandContext): string[] {
  if (!ctx.arcade?.seen) return [];
  return ["", arcadeCopy.board.neofetchHeading, ...formatBoards(ctx.arcade.boards, 40, GAME_TITLES)];
}

function top(): string[] {
  const rows = [
    ["1", "fergus", "71.4", "38.0", "stealth"],
    ["7", "fergus", "9.8", "6.2", "side-projects"],
    ["12", "fergus", "6.1", "3.4", "tennis"],
    ["19", "fergus", "4.7", "2.9", "poker"],
    ["24", "root", "4.1", "2.2", "phosphor-shader"],
    // The one hint that `cd arcade` exists. Not in help, not in completion,
    // not in ls: a process in the table is all a visitor is given.
    ["28", "fergus", "0.1", "0.8", "arcade"],
    ["31", "fergus", "0.4", "0.9", "sleep"],
  ];
  return [
    "  PID  USER     %CPU  %MEM  COMMAND",
    ...rows.map(
      ([pid, user, cpu, mem, cmd]) =>
        `${pid.padStart(5)}  ${user.padEnd(7)}${cpu.padStart(5)} ${mem.padStart(5)}  ${cmd}`,
    ),
    "",
    "load average: 0.94, 1.12, 0.88",
  ];
}

function resume(cols?: number): string[] {
  return [
    `${profile.name} · ${profile.tagline}`,
    profile.education,
    "",
    "experience/",
    ...columns(experience.map((item) => [item.dates, `${item.org} · ${item.role}`]), cols),
    "",
    "projects/",
    ...columns(projects.map((p) => [p.slug, p.tagline]), cols),
    "",
    "writing/",
    ...columns(articles.map((a) => [a.date, a.title]), cols),
    "",
    "contact/",
    ...columns(profile.contact.map((c) => [c.label, c.value]), cols),
  ];
}

/**
 * What the status bar along the bottom used to show all the time, on request
 * (2026-11-25): where you are, how long the machine has been up, the frame
 * rate, the phosphor and the switches.
 */
function status(ctx: CommandContext): string[] {
  const on = (v: boolean | undefined) => (v ? "on" : "off");
  return [
    `FergusOS ${SYSTEM_VERSION} · up ${formatUptime(ctx.uptimeMs ?? 0)}`,
    "",
    ...columns(
      [
        ["where", promptPath(ctx.path)],
        ["phosphor", ctx.theme ?? "green"],
        ["crt", `${on(ctx.crt ?? true)} · scanlines ${Math.round((ctx.scanlines ?? 0.55) * 100)}`],
        ["sound", on(ctx.audio)],
        ["gravity", on(ctx.gravity)],
        ["eject", on(ctx.ejected)],
        ["frames", ctx.fps ? `${Math.round(ctx.fps)} fps` : "still"],
      ],
      ctx.cols,
      0,
    ),
  ];
}

/** The date the way a person in Dublin would say it, not the engine's toString. */
function dublinDate(now: Date): string {
  const day = new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Dublin",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Dublin",
  }).format(now);
  return `${day}, ${time} Irish time`;
}

/** Things the machine can tell you about itself and its owner. */
export const info = [
  defineCommand({
    name: "contact",
    help: "contact           show contact details",
    group: "navigate",
    rank: 7,
    run: (_args, ctx) => ok([...columns(profile.contact.map((c) => [c.label, c.value]), ctx.cols, 0), "", "or book a time: book coffee · book call"]),
  }),

  defineCommand({
    name: "resume",
    aliases: ["cv"],
    help: "resume            print the short CV",
    group: "navigate",
    rank: 6,
    run: (_args, ctx) => ok(resume(ctx.cols)),
  }),

  defineCommand({
    name: "neofetch",
    help: "neofetch          system summary",
    group: "system",
    rank: 1,
    run: (_args, ctx) => ok(neofetch(ctx)),
  }),

  defineCommand({
    name: "status",
    aliases: ["stat"],
    help: "status            what the machine is doing",
    group: "system",
    rank: 2,
    run: (_args, ctx) => ok(status(ctx)),
  }),

  defineCommand({
    name: "uptime",
    help: "uptime            session uptime",
    group: "system",
    rank: 2,
    run: (_args, ctx) => ok([`up ${formatUptime(ctx.uptimeMs ?? 0)}  ·  1 user  ·  load average: 0.94`]),
  }),

  defineCommand({
    name: "top",
    aliases: ["ps"],
    help: "top               running processes",
    group: "system",
    rank: 3,
    run: () => ok(top()),
  }),

  defineCommand({
    name: "history",
    run: (_args, ctx) => {
      const h = ctx.history ?? [];
      if (h.length === 0) return ok(["(no history yet)"]);
      return ok(h.map((line, i) => `${String(i + 1).padStart(4)}  ${line}`));
    },
  }),

  defineCommand({
    name: "echo",
    run: (args) => ok([args.join(" ")]),
  }),

  defineCommand({
    name: "date",
    run: (_args, ctx) => ok([dublinDate(ctx.now ?? new Date())]),
  }),
];
