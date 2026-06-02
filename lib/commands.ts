import { profile } from "@/content/profile";

export type CommandResult =
  | { type: "output"; lines: string[] }
  | { type: "navigate"; href: string }
  | { type: "clear" };

/** Sections reachable from the terminal. */
export const SECTIONS = ["about", "skills", "experience", "projects", "contact"] as const;

export const HELP_LINES: string[] = [
  "available commands:",
  "  whoami            who is this",
  "  ls                list sections",
  "  cd <section>      jump to a section (projects · experience · about · skills · contact)",
  "  cat about.txt     read the bio",
  "  contact           show contact details",
  "  clear             clear the screen",
  "  help              show this help",
  "  sudo hire-me      ;)",
];

/**
 * Pure terminal command parser. No DOM / router access — callers act on the
 * returned CommandResult. Kept side-effect free so it can be unit-tested.
 */
export function runCommand(input: string): CommandResult {
  const raw = input.trim();
  if (!raw) return { type: "output", lines: [] };

  const [rawCmd, ...args] = raw.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = args.join(" ").toLowerCase();

  switch (cmd) {
    case "help":
    case "?":
      return { type: "output", lines: HELP_LINES };

    case "whoami":
      return { type: "output", lines: [profile.name, profile.tagline] };

    case "ls":
    case "dir":
      return { type: "output", lines: ["sections/", "  " + SECTIONS.join("   ")] };

    case "cd": {
      const dest = arg.replace(/^\/+|\/+$/g, "");
      if (dest === "" || dest === "~" || dest === "home") return { type: "navigate", href: "/" };
      if (dest === "projects") return { type: "navigate", href: "/projects" };
      if (dest === "experience") return { type: "navigate", href: "/experience" };
      if (dest === "about" || dest === "skills" || dest === "contact")
        return { type: "navigate", href: `/#${dest}` };
      return { type: "output", lines: [`cd: no such section: ${dest}`] };
    }

    case "cat":
      if (arg === "about.txt" || arg === "about") return { type: "output", lines: profile.bio };
      return { type: "output", lines: [`cat: ${args[0] ?? ""}: No such file or directory`] };

    case "contact":
      return {
        type: "output",
        lines: profile.contact.map((c) => `${c.label}: ${c.value}`),
      };

    case "clear":
    case "cls":
      return { type: "clear" };

    case "sudo":
      if (arg === "hire-me" || arg === "hire me")
        return {
          type: "output",
          lines: [
            "[sudo] access granted ✓",
            "excellent choice. let's talk —",
            `  ${profile.contact.find((c) => c.label === "email")?.value ?? ""}`,
          ],
        };
      return {
        type: "output",
        lines: [`sudo: ${arg || "command"}: no permission theatrics needed here`],
      };

    default:
      return {
        type: "output",
        lines: [`command not found: ${cmd}`, "type 'help' to see what's available"],
      };
  }
}
