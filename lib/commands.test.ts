import { describe, it, expect } from "vitest";
import { runCommand } from "@/lib/commands";
import { profile } from "@/content/profile";

describe("runCommand", () => {
  it("returns empty output for blank input", () => {
    expect(runCommand("   ")).toEqual({ type: "output", lines: [] });
  });

  it("help lists the available commands", () => {
    const res = runCommand("help");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      expect(res.lines.join("\n")).toContain("whoami");
      expect(res.lines.length).toBeGreaterThan(3);
    }
  });

  it("whoami returns name and tagline", () => {
    const res = runCommand("whoami");
    expect(res).toEqual({ type: "output", lines: [profile.name, profile.tagline] });
  });

  it("ls lists sections including projects", () => {
    const res = runCommand("ls");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines.join(" ")).toContain("projects");
  });

  it("cd projects navigates to /projects", () => {
    expect(runCommand("cd projects")).toEqual({ type: "navigate", href: "/projects" });
  });

  it("cd experience navigates to /experience", () => {
    expect(runCommand("cd experience")).toEqual({ type: "navigate", href: "/experience" });
  });

  it("cd about navigates to the landing anchor", () => {
    expect(runCommand("cd about")).toEqual({ type: "navigate", href: "/#about" });
  });

  it("cd home / cd ~ returns to root", () => {
    expect(runCommand("cd ~")).toEqual({ type: "navigate", href: "/" });
    expect(runCommand("cd home")).toEqual({ type: "navigate", href: "/" });
  });

  it("cat about.txt returns the bio", () => {
    expect(runCommand("cat about.txt")).toEqual({ type: "output", lines: profile.bio });
  });

  it("clear returns a clear action", () => {
    expect(runCommand("clear")).toEqual({ type: "clear" });
  });

  it("sudo hire-me is an easter egg with the email", () => {
    const res = runCommand("sudo hire-me");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      const text = res.lines.join("\n");
      expect(text).toContain("granted");
      expect(text).toContain("oreillferg@gmail.com");
    }
  });

  it("is case-insensitive on the command token", () => {
    expect(runCommand("WHOAMI").type).toBe("output");
    expect(runCommand("CD projects")).toEqual({ type: "navigate", href: "/projects" });
  });

  it("unknown command reports not found", () => {
    const res = runCommand("foobar");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("command not found");
  });
});
