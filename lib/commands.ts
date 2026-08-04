import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { formatUptime, isTheme } from "@/lib/system";
import type { Theme } from "@/lib/system";

/**
 * Side effects a command can ask the host page to perform. `runCommand` stays a
 * pure function of its inputs — it describes what should happen to the machine
 * and the Terminal component is the only thing that actually touches it. That is
 * what keeps commands like `theme` and `matrix`, which visibly rewrite the whole
 * site, unit-testable.
 */
export type SystemEffect =
  | { kind: "theme"; theme: Theme }
  | { kind: "crt"; on: boolean }
  | { kind: "scanlines"; value: number }
  | { kind: "matrix"; ms: number }
  | { kind: "degauss" }
  | { kind: "reboot" };

export type CommandResult =
  | { type: "output"; lines: string[] }
  | { type: "navigate"; href: string }
  | { type: "clear" }
  | { type: "effect"; effect: SystemEffect; lines: string[] };

/** Everything a command may need to know about the running machine. */
export type CommandContext = {
  history?: string[];
  now?: Date;
  uptimeMs?: number;
  theme?: Theme;
};

/** Sections reachable from the terminal. */
export const SECTIONS = ["about", "skills", "experience", "projects", "contact"] as const;

/** Every command name, for `help` and for tab completion. */
export const COMMANDS = [
  "help",
  "whoami",
  "ls",
  "cd",
  "cat",
  "contact",
  "resume",
  "open",
  "neofetch",
  "uptime",
  "top",
  "theme",
  "crt",
  "scanlines",
  "matrix",
  "degauss",
  "history",
  "echo",
  "date",
  "pwd",
  "clear",
  "sudo",
] as const;

export const HELP_LINES: string[] = [
  "FergusOS 4.0 · command reference",
  "",
  "  navigate",
  "    whoami            who is this",
  "    ls                list sections",
  "    cd <section>      jump to a section",
  "    open <project>    open a project by name",
  "    cat about.txt     read the bio",
  "    resume            print the short CV",
  "    contact           show contact details",
  "",
  "  system",
  "    neofetch          system summary",
  "    uptime            session uptime",
  "    top               running processes",
  "    theme <name>      green · amber · ice",
  "    crt <on|off>      toggle the tube",
  "    scanlines <0-100> set mask intensity",
  "    matrix            let it rain",
  "    degauss           thump the magnets",
  "",
  "  shell",
  "    history · echo · date · pwd · clear · help",
  "    tab completes · up/down recalls · ctrl+L clears",
  "",
  "  and one more thing",
  "    sudo hire-me      ;)",
];

const ok = (lines: string[]): CommandResult => ({ type: "output", lines });

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
    `OS       FergusOS 4.0 "Phosphor"`,
    `Host     Trinity College Dublin`,
    `Kernel   next-15 · react-19 · webgl`,
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
  return out;
}

function top(): string[] {
  const rows = [
    ["1", "fergus", "38.2", "12.4", "presterly-engine"],
    ["7", "fergus", "22.9", "18.1", "prediction-worker"],
    ["12", "fergus", "11.4", "6.2", "whatsapp-bridge"],
    ["19", "fergus", "8.7", "4.0", "trinity-coursework"],
    ["24", "root", "4.1", "2.2", "phosphor-shader"],
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
  out.push("", `contact: ${profile.contact.map((c) => c.value).join("  ·  ")}`);
  return out;
}

/**
 * Pure terminal command parser. No DOM, router or system access — callers act on
 * the returned CommandResult.
 */
export function runCommand(input: string, ctx: CommandContext = {}): CommandResult {
  const raw = input.trim();
  if (!raw) return ok([]);

  const [rawCmd, ...args] = raw.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = args.join(" ").toLowerCase();

  switch (cmd) {
    case "help":
    case "?":
    case "man":
      return ok(HELP_LINES);

    case "whoami":
      return ok([profile.name, profile.tagline]);

    case "ls":
    case "dir":
      return ok(["sections/", "  " + SECTIONS.join("   ")]);

    case "cd": {
      const dest = arg.replace(/^\/+|\/+$/g, "");
      if (dest === "" || dest === "~" || dest === "home") return { type: "navigate", href: "/" };
      if (dest === "projects") return { type: "navigate", href: "/projects" };
      if (dest === "experience") return { type: "navigate", href: "/experience" };
      if (dest === "about" || dest === "skills" || dest === "contact")
        return { type: "navigate", href: `/#${dest}` };
      return ok([`cd: no such section: ${dest}`]);
    }

    case "open": {
      if (!arg) return ok(["open: name a project", "  " + projects.map((p) => p.slug).join("  ")]);
      const match = projects.find(
        (p) => p.slug === arg || p.title.toLowerCase() === arg || p.slug.startsWith(arg),
      );
      if (!match) return ok([`open: no project matching '${arg}'`]);
      return { type: "navigate", href: `/projects#${match.slug}` };
    }

    case "cat":
      if (arg === "about.txt" || arg === "about") return ok(profile.bio);
      return ok([`cat: ${args[0] ?? ""}: No such file or directory`]);

    case "contact":
      return ok(profile.contact.map((c) => `${c.label}: ${c.value}`));

    case "resume":
    case "cv":
      return ok(resume());

    case "neofetch":
      return ok(neofetch(ctx));

    case "uptime":
      return ok([`up ${formatUptime(ctx.uptimeMs ?? 0)}  ·  1 user  ·  load average: 0.94`]);

    case "top":
    case "ps":
      return ok(top());

    case "theme": {
      if (!arg) return ok([`theme: ${ctx.theme ?? "green"}`, "usage: theme green|amber|ice"]);
      if (!isTheme(arg)) return ok([`theme: unknown phosphor '${arg}'`, "try: green · amber · ice"]);
      return { type: "effect", effect: { kind: "theme", theme: arg }, lines: [`phosphor -> ${arg}`] };
    }

    case "crt": {
      if (arg !== "on" && arg !== "off") return ok(["usage: crt on|off"]);
      return {
        type: "effect",
        effect: { kind: "crt", on: arg === "on" },
        lines: [arg === "on" ? "tube warming up..." : "tube off. flat pixels restored."],
      };
    }

    case "scanlines": {
      const n = Number(arg);
      if (!arg || !Number.isFinite(n) || n < 0 || n > 100) return ok(["usage: scanlines <0-100>"]);
      return {
        type: "effect",
        effect: { kind: "scanlines", value: n / 100 },
        lines: [`mask intensity -> ${Math.round(n)}%`],
      };
    }

    case "matrix":
      return {
        type: "effect",
        effect: { kind: "matrix", ms: 9000 },
        lines: ["wake up, neo...", "following the white rabbit for 9 seconds."],
      };

    case "degauss":
      return { type: "effect", effect: { kind: "degauss" }, lines: ["*THWOMP*"] };

    case "history": {
      const h = ctx.history ?? [];
      if (h.length === 0) return ok(["(no history yet)"]);
      return ok(h.map((line, i) => `${String(i + 1).padStart(4)}  ${line}`));
    }

    case "echo":
      return ok([args.join(" ")]);

    case "date":
      return ok([(ctx.now ?? new Date()).toString()]);

    case "pwd":
      return ok([`/home/${profile.user}`]);

    case "clear":
    case "cls":
      return { type: "clear" };

    case "sudo": {
      if (arg === "hire-me" || arg === "hire me")
        return ok([
          "[sudo] access granted ✓",
          "excellent choice. let's talk.",
          `  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
        ]);
      if (arg === "rm -rf /" || arg === "rm -rf /*")
        return {
          type: "effect",
          effect: { kind: "reboot" },
          lines: [
            "rm: descending into /",
            "removing /dev/ambition ... failed: resource busy",
            "removing /usr/bin/discipline ... failed: resource busy",
            "kernel panic. nothing left to delete.",
          ],
        };
      return ok([`sudo: ${arg || "command"}: no permission theatrics needed here`]);
    }

    default:
      return ok([`command not found: ${cmd}`, "type 'help' to see what's available"]);
  }
}

/**
 * Tab completion. Completes the command name on the first token, and the
 * argument (section, project, theme...) once a command that takes one is typed.
 * Returns the full replacement line, or null when there is nothing to add.
 */
export function complete(input: string): string | null {
  const hasTrailingSpace = /\s$/.test(input);
  const parts = input.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return null;

  // Completing the command itself.
  if (parts.length === 1 && !hasTrailingSpace) {
    const prefix = parts[0].toLowerCase();
    const hits = (COMMANDS as readonly string[]).filter((c) => c.startsWith(prefix));
    if (hits.length === 0) return null;
    return sharedPrefix(hits, prefix);
  }

  const cmd = parts[0].toLowerCase();
  const argPrefix = hasTrailingSpace ? "" : (parts[parts.length - 1]?.toLowerCase() ?? "");

  let pool: string[] = [];
  if (cmd === "cd") pool = [...SECTIONS];
  else if (cmd === "open") pool = projects.map((p) => p.slug);
  else if (cmd === "theme") pool = ["green", "amber", "ice"];
  else if (cmd === "crt") pool = ["on", "off"];
  else if (cmd === "cat") pool = ["about.txt"];
  else return null;

  const hits = pool.filter((p) => p.startsWith(argPrefix));
  if (hits.length === 0) return null;

  const completed = sharedPrefix(hits, argPrefix);
  const head = hasTrailingSpace ? parts : parts.slice(0, -1);
  return `${head.join(" ")} ${completed}`;
}

/** Longest common prefix of the candidates, never shorter than what was typed. */
function sharedPrefix(candidates: string[], typed: string): string {
  if (candidates.length === 1) return candidates[0];
  let prefix = candidates[0];
  for (const c of candidates.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < c.length && prefix[i] === c[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.length > typed.length ? prefix : typed;
}
