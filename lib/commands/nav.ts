import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { defineCommand, findCommand, helpLines, listCommands } from "./registry";
import { SECTIONS, argOf, ok } from "./shared";

/** Getting around: the sections, the projects, the bio, and `help` itself. */
export const nav = [
  defineCommand({
    name: "help",
    aliases: ["?", "man"],
    run: () => ok(helpLines(listCommands())),
  }),

  defineCommand({
    name: "whoami",
    help: "whoami            who is this",
    run: () => ok([profile.name, profile.tagline]),
  }),

  defineCommand({
    name: "ls",
    aliases: ["dir"],
    help: "ls                list sections",
    run: () => ok(["sections/", "  " + SECTIONS.join("   ")]),
  }),

  defineCommand({
    name: "cd",
    help: "cd <section>      jump to a section",
    argPool: [...SECTIONS],
    run: (args, ctx, raw) => {
      const dest = argOf(args).replace(/^\/+|\/+$/g, "");
      if (dest === "" || dest === "~" || dest === "home") return { type: "navigate", href: "/" };
      if (dest === "projects") return { type: "navigate", href: "/projects" };
      if (dest === "experience") return { type: "navigate", href: "/experience" };
      if (dest === "writing" || dest === "blog" || dest === "posts")
        return { type: "navigate", href: "/writing" };
      if (dest === "about" || dest === "skills" || dest === "contact")
        return { type: "navigate", href: `/#${dest}` };
      // Doors. A hidden command is reachable as `cd <name>` and listed nowhere:
      // not in help, not in completion, not in ls. Anything after the name goes
      // to the door, so `cd arcade pong` can mean something once G0 exists.
      const door = findCommand(dest);
      if (door?.hidden) return door.run(args.slice(1), ctx, raw);
      return ok([`cd: no such section: ${dest}`]);
    },
  }),

  defineCommand({
    name: "open",
    help: "open <project>    open a project by name",
    argPool: projects.map((p) => p.slug),
    run: (args) => {
      const arg = argOf(args);
      if (!arg) return ok(["open: name a project", "  " + projects.map((p) => p.slug).join("  ")]);
      const match = projects.find(
        (p) => p.slug === arg || p.title.toLowerCase() === arg || p.slug.startsWith(arg),
      );
      if (!match) return ok([`open: no project matching '${arg}'`]);
      return { type: "navigate", href: `/projects#${match.slug}` };
    },
  }),

  defineCommand({
    name: "cat",
    help: "cat about.txt     read the bio",
    argPool: ["about.txt"],
    run: (args) => {
      const arg = argOf(args);
      if (arg === "about.txt" || arg === "about") return ok(profile.bio);
      return ok([`cat: ${args[0] ?? ""}: No such file or directory`]);
    },
  }),

  defineCommand({
    name: "pwd",
    run: () => ok([`/home/${profile.user}`]),
  }),
];
