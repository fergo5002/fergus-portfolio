import { profile } from "@/content/profile";
import { defineCommand } from "./registry";
import { argOf, ok } from "./shared";

/** The one command that pretends to need permission. */
export const sudo = [
  defineCommand({
    name: "sudo",
    help: "sudo hire-me      ;)",
    group: "more",
    rank: 1,
    run: (args) => {
      const arg = argOf(args);
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
    },
  }),
];
