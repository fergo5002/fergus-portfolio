# FergusOS Terminal: Claude entry point

@AGENTS.md

`AGENTS.md`, imported above and shared with Codex, is the map: the rules that apply everywhere, the commands, the deploy check and which `docs/agents/` file to read before touching each area. Read the relevant topic file before any non-trivial change; don't try to hold all of it in context for a one-line fix.

Claude only:

- `cc portfolio` (or `cc personal`) from anywhere roots a shell and Claude session here.
- `.claude/settings.json` pre-approves the routine local dev loop (`npm`, `npx vitest`, `npx playwright`, `node`) so it doesn't re-prompt every session.
