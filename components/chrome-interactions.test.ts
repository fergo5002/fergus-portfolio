import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

it("keeps the one nav outside the screen hidden by the arcade", () => {
  const layout = read("app/layout.tsx");
  const shell = read("components/CrtShell.tsx");
  expect(layout).not.toContain("<Nav />");
  expect(shell.match(/<Nav \/>/g)).toHaveLength(1);
  expect(shell.indexOf("<Nav />")).toBeGreaterThan(shell.indexOf('<div className="crt__screen">{children}</div>'));
});
it("dismisses outside pointer presses but protects the portaled arcade and toggles", () => {
  const drawer = read("components/ShellDrawer.tsx");
  expect(drawer).toContain('document.addEventListener("pointerdown", onPointerDown)');
  expect(drawer).toContain('document.removeEventListener("pointerdown", onPointerDown)');
  expect(drawer).toContain('.shell, .statusbar__prompt, .nav, .arcade-room');
});
it("exits the host before a normal nav link, including its current route", () => {
  const nav = read("components/Nav.tsx");
  expect(nav).toContain('shellStore.dispatch({ type: "close" })');
  expect(nav).toContain("onClick={leaveArcade}");
});
it("does not claim a modal boundary around accessible site navigation", () => {
  const room = read("components/arcade/ArcadeExperience.tsx");
  expect(room).not.toContain('aria-modal="true"');
  expect(room).toContain('phase: "ready"');
  expect(room).toContain('phase: "closed"');
});

it("also releases the room for browser history navigation", () => {
  const room = read("components/arcade/ArcadeExperience.tsx");
  expect(room).toContain('if (path !== enteredPath.current) shellStore.dispatch({ type: "close" })');
});
