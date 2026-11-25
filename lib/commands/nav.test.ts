import { describe, it, expect } from "vitest";
import { nav } from "./nav";
import type { CommandDef } from "./registry";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

const def = (name: string): CommandDef => {
  const d = nav.find((c) => c.name === name);
  if (!d) throw new Error(`nav has no ${name}`);
  return d;
};
const run = (name: string, ...args: string[]) => def(name).run(args, {}, [name, ...args].join(" "));

describe("the nav module", () => {
  it("carries exactly the navigation commands", () => {
    expect(nav.map((c) => c.name).sort()).toEqual(["book", "cat", "cd", "exit", "help", "ls", "open", "pwd", "whoami"]);
  });

  it("keeps the aliases the switch had", () => {
    expect(def("help").aliases).toEqual(["?", "man"]);
    expect(def("ls").aliases).toEqual(["dir", "ll"]);
    expect(def("exit").aliases).toEqual(["quit", "logout"]);
  });

  it("cd strips slashes, routes sections, and goes home on nothing", () => {
    expect(run("cd", "/projects/")).toEqual({ type: "navigate", href: "/projects" });
    expect(run("cd", "experience")).toEqual({ type: "navigate", href: "/experience" });
    expect(run("cd", "blog")).toEqual({ type: "navigate", href: "/writing" });
    expect(run("cd", "about")).toEqual({ type: "navigate", href: "/#about" });
    expect(run("cd", "~/tools")).toEqual({ type: "navigate", href: "/tools" });
    expect(run("cd")).toEqual({ type: "navigate", href: "/" });
    expect(run("cd", "~")).toEqual({ type: "navigate", href: "/" });
  });

  it("cd refuses a section that does not exist, and nothing hidden is registered here", () => {
    const tryLine = "try: about · experience · projects · writing · tools · contact";
    expect(run("cd", "nowhere")).toEqual({ type: "output", lines: ["cd: no such section: nowhere", tryLine] });
    expect(run("cd", "skills")).toEqual({ type: "output", lines: ["cd: no such section: skills", tryLine] });
    expect(run("cd", "arcade")).toEqual({ type: "output", lines: ["cd: no such section: arcade", tryLine] });
    // Names every object inherits are not sections (2026-11-25 review).
    for (const inherited of ["constructor", "__proto__"]) {
      expect(run("cd", inherited)).toEqual({ type: "output", lines: [`cd: no such section: ${inherited}`, tryLine] });
    }
  });

  it("cd completes sections and only sections", () => {
    expect(def("cd").argPool).toEqual(["about", "experience", "projects", "writing", "tools", "contact"]);
  });

  it("open matches slug, title and prefix, and lists on nothing", () => {
    const first = projects[0];
    expect(run("open", first.slug)).toEqual({ type: "navigate", href: `/projects#${first.slug}` });
    expect(run("open", first.slug.slice(0, 3))).toMatchObject({ type: "navigate" });
    const none = run("open");
    if (none.type !== "output") throw new Error("expected output");
    expect(none.lines.join(" ")).toContain(first.slug);
    expect(run("open", "zzzz")).toEqual({
      type: "output",
      lines: ["open: nothing called 'zzzz'", "type 'open' to see what there is"],
    });
    expect(def("open").argPool).toEqual([...projects.map((p) => p.slug), "github", "linkedin", "email"]);
  });

  it("open takes the profile links: a new tab for the web ones, the address for email", () => {
    const gh = profile.contact.find((c) => c.label === "github");
    expect(run("open", "github")).toEqual({ type: "navigate", href: gh?.href, lines: [`opening ${gh?.value} in a new tab`] });
    const mail = profile.contact.find((c) => c.label === "email");
    expect(run("open", "email")).toEqual({ type: "output", lines: [`email: ${mail?.value}`] });
  });

  it("cat reads the bio and keeps the typed case in its error", () => {
    expect(run("cat", "about.txt")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "About")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "Secrets.txt")).toEqual({
      type: "output",
      lines: ["cat: Secrets.txt: No such file or directory"],
    });
    expect(run("cat")).toEqual({ type: "output", lines: ["cat: which file? try: cat about.txt"] });
    expect(def("cat").argPool).toEqual(["about.txt"]);
  });

  it("whoami, ls and pwd read the profile and the sections", () => {
    expect(run("whoami")).toEqual({ type: "output", lines: [profile.name, profile.tagline] });
    expect(run("pwd")).toEqual({ type: "output", lines: [`/home/${profile.user}`] });
    expect(def("pwd").run([], { path: "/writing" }, "pwd")).toEqual({ type: "output", lines: [`/home/${profile.user}/writing`] });
    const ls = run("ls");
    if (ls.type !== "output") throw new Error("expected output");
    expect(ls.lines.join(" ")).toContain("about.txt");
    expect(ls.lines.join(" ")).toContain("projects/");
    expect(ls.lines.join(" ")).not.toContain("skills");
  });

  it("help reads the registry rather than carrying a list of its own", () => {
    const res = run("help");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines[0]).toBe("FergusOS 6.0 · command reference");
    expect(res.lines.at(-1)).toContain("tab completes");
  });

  it("book sends coffee and call to the calendar, and explains itself otherwise", () => {
    expect(run("book", "coffee")).toEqual({ type: "navigate", href: "/contact?meet=coffee" });
    expect(run("book", "call")).toEqual({ type: "navigate", href: "/contact?meet=call" });
    const usage = run("book");
    if (usage.type !== "output") throw new Error("expected output");
    expect(usage.lines[0]).toContain("usage: book coffee");
  });

  it("cd .. goes up from the current route", () => {
    expect(def("cd").run([".."], { path: "/writing/some-post" }, "cd ..")).toEqual({ type: "navigate", href: "/writing" });
    expect(def("cd").run([".."], { path: "/writing" }, "cd ..")).toEqual({ type: "navigate", href: "/" });
  });

  it("exit asks the terminal to close", () => {
    expect(run("exit")).toEqual({ type: "effect", effect: { kind: "exit" }, lines: [] });
  });
});
