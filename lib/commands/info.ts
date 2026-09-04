import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { articles } from "@/content/articles";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";
import { formatBoards } from "@/lib/arcade/board";
import { formatUptime } from "@/lib/system";
import { defineCommand } from "./registry";
import { ok } from "./shared";
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
    `OS       FergusOS 5.0 "Mass"`,
    `Host     Trinity College Dublin`,
    `Kernel   next-15 · react-19 · webgl · webaudio`,
    `Uptime   ${formatUptime(ctx.uptimeMs ?? 0)}`,
    `Shell    fsh 4.0`,
    `Display  ${ctx.theme ?? "green"} phosphor · 4:3`,
    `Role     Co-Founder & CTO, Presterly`,
    `Repos    ${projects.length} shipped · ${experience.length} posts`,
    // By label, not by index: `contact` has grown before and index 0 only
    // happens to be the email.
    `Contact  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
  ];
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
    ["1", "fergus", "38.2", "12.4", "presterly-engine"],
    ["7", "fergus", "22.9", "18.1", "prediction-worker"],
    ["12", "fergus", "11.4", "6.2", "whatsapp-bridge"],
    ["19", "fergus", "8.7", "4.0", "trinity-coursework"],
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

function resume(): string[] {
  const out: string[] = [`${profile.name} · ${profile.tagline}`, profile.education, ""];
  for (const item of experience) {
    out.push(`${item.dates.padEnd(22)}${item.org} · ${item.role}`);
  }
  out.push("", "projects/");
  for (const p of projects) {
    out.push(`  ${p.slug.padEnd(22)}${p.tagline}`);
  }
  out.push("", "writing/");
  for (const a of articles) {
    out.push(`  ${a.date.padEnd(22)}${a.title}`);
  }
  out.push("", `contact: ${profile.contact.map((c) => c.value).join("  ·  ")}`);
  return out;
}

/** Things the machine can tell you about itself and its owner. */
export const info = [
  defineCommand({
    name: "contact",
    help: "contact           show contact details",
    group: "navigate",
    rank: 7,
    run: () => ok(profile.contact.map((c) => `${c.label}: ${c.value}`)),
  }),

  defineCommand({
    name: "resume",
    aliases: ["cv"],
    help: "resume            print the short CV",
    group: "navigate",
    rank: 6,
    run: () => ok(resume()),
  }),

  defineCommand({
    name: "neofetch",
    help: "neofetch          system summary",
    group: "system",
    rank: 1,
    run: (_args, ctx) => ok(neofetch(ctx)),
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
    run: (_args, ctx) => ok([(ctx.now ?? new Date()).toString()]),
  }),
];
