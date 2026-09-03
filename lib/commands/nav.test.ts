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
    expect(nav.map((c) => c.name).sort()).toEqual(["cat", "cd", "help", "ls", "open", "pwd", "whoami"]);
  });

  it("keeps the aliases the switch had", () => {
    expect(def("help").aliases).toEqual(["?", "man"]);
    expect(def("ls").aliases).toEqual(["dir"]);
  });

  it("cd strips slashes, routes sections, and goes home on nothing", () => {
    expect(run("cd", "/projects/")).toEqual({ type: "navigate", href: "/projects" });
    expect(run("cd", "experience")).toEqual({ type: "navigate", href: "/experience" });
    expect(run("cd", "blog")).toEqual({ type: "navigate", href: "/writing" });
    expect(run("cd", "skills")).toEqual({ type: "navigate", href: "/#skills" });
    expect(run("cd")).toEqual({ type: "navigate", href: "/" });
    expect(run("cd", "~")).toEqual({ type: "navigate", href: "/" });
  });

  it("cd refuses a section that does not exist, and nothing hidden is registered here", () => {
    expect(run("cd", "nowhere")).toEqual({ type: "output", lines: ["cd: no such section: nowhere"] });
    expect(run("cd", "arcade")).toEqual({ type: "output", lines: ["cd: no such section: arcade"] });
  });

  it("cd completes sections and only sections", () => {
    expect(def("cd").argPool).toEqual(["about", "skills", "experience", "projects", "writing", "contact"]);
  });

  it("open matches slug, title and prefix, and lists on nothing", () => {
    const first = projects[0];
    expect(run("open", first.slug)).toEqual({ type: "navigate", href: `/projects#${first.slug}` });
    expect(run("open", first.slug.slice(0, 3))).toMatchObject({ type: "navigate" });
    const none = run("open");
    if (none.type !== "output") throw new Error("expected output");
    expect(none.lines.join(" ")).toContain(first.slug);
    expect(run("open", "zzzz")).toEqual({ type: "output", lines: ["open: no project matching 'zzzz'"] });
    expect(def("open").argPool).toEqual(projects.map((p) => p.slug));
  });

  it("cat reads the bio and keeps the typed case in its error", () => {
    expect(run("cat", "about.txt")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "About")).toEqual({ type: "output", lines: profile.bio });
    expect(run("cat", "Secrets.txt")).toEqual({
      type: "output",
      lines: ["cat: Secrets.txt: No such file or directory"],
    });
    expect(def("cat").argPool).toEqual(["about.txt"]);
  });

  it("whoami, ls and pwd read the profile and the sections", () => {
    expect(run("whoami")).toEqual({ type: "output", lines: [profile.name, profile.tagline] });
    expect(run("pwd")).toEqual({ type: "output", lines: [`/home/${profile.user}`] });
    const ls = run("ls");
    if (ls.type !== "output") throw new Error("expected output");
    expect(ls.lines[0]).toBe("sections/");
    expect(ls.lines[1]).toContain("projects");
  });

  it("help reads the registry rather than carrying a list of its own", () => {
    const res = run("help");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines[0]).toBe("FergusOS 5.0 · command reference");
    expect(res.lines.at(-1)).toContain("tab completes");
  });
});
