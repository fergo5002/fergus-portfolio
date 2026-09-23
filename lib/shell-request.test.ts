import { describe, it, expect, vi } from "vitest";
import { requestCommand, takeRequest, subscribeRequests } from "./shell-request";

/**
 * The nav's `cd arcade` is a button, not a link: the arcade is not a page, it
 * is a program the terminal hosts. So the nav asks the shell to run a command,
 * and the drawer's Terminal drains the request. One slot, taken once.
 */
describe("a pending shell command", () => {
  it("is handed over once and then gone", () => {
    requestCommand("cd arcade");
    expect(takeRequest()).toBe("cd arcade");
    expect(takeRequest()).toBeNull();
  });

  it("tells subscribers when something is requested", () => {
    const heard = vi.fn();
    const off = subscribeRequests(heard);
    requestCommand("help");
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    requestCommand("help");
    expect(heard).toHaveBeenCalledTimes(1);
    takeRequest();
  });

  it("keeps only the latest request, since a person can only mean one thing", () => {
    requestCommand("help");
    requestCommand("cd arcade");
    expect(takeRequest()).toBe("cd arcade");
    expect(takeRequest()).toBeNull();
  });
});
