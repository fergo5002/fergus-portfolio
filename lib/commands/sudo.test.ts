import { describe, it, expect } from "vitest";
import { sudo } from "./sudo";
import { profile } from "@/content/profile";

const run = (...args: string[]) => sudo[0].run(args, {}, ["sudo", ...args].join(" "));

describe("sudo", () => {
  it("is one command", () => {
    expect(sudo.map((c) => c.name)).toEqual(["sudo"]);
    expect(sudo[0].help).toBe("sudo hire-me      ;)");
  });

  it("hire-me prints the email, in either spelling", () => {
    const email = profile.contact.find((c) => c.label === "email")?.value ?? "";
    for (const args of [["hire-me"], ["hire", "me"], ["Hire-Me"]]) {
      const res = run(...args);
      if (res.type !== "output") throw new Error("expected output");
      expect(res.lines[0]).toContain("granted");
      expect(res.lines.join("\n")).toContain(email);
    }
  });

  it("rm -rf / reboots rather than pretending to delete anything", () => {
    const res = run("rm", "-rf", "/");
    expect(res).toMatchObject({ type: "effect", effect: { kind: "reboot" } });
    if (res.type === "effect") expect(res.lines.join("\n")).toContain("kernel panic");
    expect(run("rm", "-rf", "/*")).toMatchObject({ effect: { kind: "reboot" } });
  });

  it("anything else needs no permission theatrics", () => {
    expect(run("make", "tea")).toEqual({
      type: "output",
      lines: ["sudo: make tea: no permission theatrics needed here"],
    });
    expect(run()).toEqual({ type: "output", lines: ["sudo: command: no permission theatrics needed here"] });
  });
});
