import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { defineCommand, findCommand, helpLines, listCommands } from "./registry";
import { SECTIONS, SECTION_PATHS, UNLISTED_PATHS, argOf, flow, ok } from "./shared";
import type { CommandResult } from "./shared";

/** The files `cat` can read. One, for now. */
const FILES = ["about.txt"];

/** The links `open` knows by name, from the profile, so they never drift. */
function linkFor(name: string): { label: string; href: string; value: string } | undefined {
  const wanted = name === "mail" ? "email" : name;
  return profile.contact.find((c) => c.label === wanted);
}

/** The parent of a route, for `cd ..`. */
function parentOf(path: string | undefined): string {
  if (!path || path === "/") return "/";
  const up = path.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
  return up || "/";
}

/** Getting around: the sections, the projects, the bio, and `help` itself. */
export const nav = [
  defineCommand({
    name: "help",
    aliases: ["?", "man"],
    run: (_args, ctx) => ok(helpLines(listCommands(), { cols: ctx.cols })),
  }),

  defineCommand({
    name: "whoami",
    help: "whoami            who is this",
    group: "navigate",
    rank: 1,
    run: () => ok([profile.name, profile.tagline]),
  }),

  defineCommand({
    name: "ls",
    aliases: ["dir", "ll"],
    help: "ls                what's here",
    group: "navigate",
    rank: 2,
    run: (_args, ctx) => ok(flow([...FILES, ...SECTIONS.filter((s) => s !== "about").map((s) => `${s}/`)], ctx.cols)),
  }),

  defineCommand({
    name: "cd",
    help: "cd <section>      go to a page",
    group: "navigate",
    rank: 3,
    argPool: [...SECTIONS],
    run: (args, ctx, raw) => {
      const dest = argOf(args).replace(/^~\/?/, "").replace(/^\/+|\/+$/g, "");
      if (dest === "" || dest === "~") return { type: "navigate", href: "/" };
      if (dest === "..") return { type: "navigate", href: parentOf(ctx.path) };
      // Own keys only: `in` also finds `constructor` and `__proto__`, which
      // handed the router a function (2026-11-25 review).
      if (Object.hasOwn(SECTION_PATHS, dest)) return { type: "navigate", href: SECTION_PATHS[dest as keyof typeof SECTION_PATHS] };
      if (Object.hasOwn(UNLISTED_PATHS, dest)) return { type: "navigate", href: UNLISTED_PATHS[dest] };
      // Doors. A hidden command is reachable as `cd <name>` and listed nowhere:
      // not in help, not in completion, not in ls. Anything after the name goes
      // to the door, so `cd arcade poker` starts a game without the list.
      //
      // The door is looked up on the FIRST word, not on `dest`. `dest` is every
      // argument joined, which is what a section needs, and it meant
      // `cd arcade poker` asked the registry for a command called
      // "arcade poker" and got nothing. The refusal below still prints the
      // whole thing, because that is what the visitor typed.
      const doorName = (args[0] ?? "").toLowerCase().replace(/^\/+|\/+$/g, "");
      const door = findCommand(doorName);
      if (door?.hidden) return door.run(args.slice(1), ctx, raw);
      return ok([`cd: no such section: ${dest}`, `try: ${SECTIONS.join(" · ")}`]);
    },
  }),

  defineCommand({
    name: "open",
    help: "open <name>       a project, or github · linkedin · email",
    group: "navigate",
    rank: 4,
    argPool: [...projects.map((p) => p.slug), "github", "linkedin", "email"],
    run: (args): CommandResult => {
      const arg = argOf(args);
      if (!arg) {
        return ok([
          "open what?",
          `  projects:  ${projects.map((p) => p.slug).join("  ")}`,
          "  links:     github  linkedin  email",
        ]);
      }
      const link = linkFor(arg);
      if (link?.href.startsWith("https://")) {
        return { type: "navigate", href: link.href, lines: [`opening ${link.value} in a new tab`] };
      }
      // A `mailto:` does nothing at all on most machines, so the address is
      // printed (and linked) rather than fired off into the void.
      if (link) return ok([`${link.label}: ${link.value}`]);
      const match = projects.find(
        (p) => p.slug === arg || p.title.toLowerCase() === arg || p.slug.startsWith(arg),
      );
      if (!match) return ok([`open: nothing called '${arg}'`, "type 'open' to see what there is"]);
      return { type: "navigate", href: `/projects#${match.slug}` };
    },
  }),

  defineCommand({
    name: "cat",
    help: "cat about.txt     read the bio",
    group: "navigate",
    rank: 5,
    argPool: FILES,
    run: (args) => {
      const arg = argOf(args);
      if (!arg) return ok(["cat: which file? try: cat about.txt"]);
      if (arg === "about.txt" || arg === "about") return ok(profile.bio);
      return ok([`cat: ${args[0]}: No such file or directory`]);
    },
  }),

  defineCommand({
    name: "book",
    aliases: ["meet"],
    help: "book coffee|call  pick a time in my calendar",
    group: "navigate",
    rank: 8,
    argPool: ["coffee", "call"],
    run: (args) => {
      const arg = argOf(args);
      if (arg === "coffee" || arg === "call") return { type: "navigate", href: `/contact?meet=${arg}` };
      return ok(["usage: book coffee   (in Dublin, 30 minutes)", "       book call     (video, 30 minutes)"]);
    },
  }),

  defineCommand({
    name: "pwd",
    run: (_args, ctx) => ok([`/home/${profile.user}${!ctx.path || ctx.path === "/" ? "" : ctx.path}`]),
  }),

  defineCommand({
    name: "exit",
    aliases: ["quit", "logout"],
    run: () => ({ type: "effect", effect: { kind: "exit" }, lines: [] }),
  }),
];
