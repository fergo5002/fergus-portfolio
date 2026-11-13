# The arcade and the terminal

Read this before touching `components/arcade/`, `lib/arcade/`, the boards, `lib/commands*`, `Terminal.tsx`, the shell drawer or the inline homepage terminal.

## The arcade room sits inside the tube (2026-09-05)

`cd arcade` opens a room that is part of the machine, not a page over it. `ArcadeExperience.tsx`
portals a fixed panel to `<body>` at `z-index: 8990`: above the page, below the flicker (8999),
the glass sheen (8997) and the scanlines (9000), so every glass layer falls across the arcade the
way it falls across a page. While it is up, `html.arcade-open` hides `.crt__screen`, the
drawer and the status strip. The regular nav hides only during the entrance, then returns above
the room. It lives beside `.crt__screen` in `CrtShell`, so the hidden page cannot hide it too.
Normal nav links close the arcade host before changing route, including same-route links.
The drawer and strip sit above 9000 and would draw over the room, and the
strip's prompt button toggles the drawer that hosts the terminal the room was launched from, so
leaving it clickable would unmount the arcade from underneath itself. Nothing in
`components/arcade/arcade.css` may go above 9000; `components/arcade/arcade.test.ts` checks.

**The room carries `data-lenis-prevent`, and that is the scroll fix, not decoration.** The room
locks the document behind it through `setScrollLocked`, which stops Lenis. A stopped Lenis calls
`preventDefault()` on every wheel event it sees unless an ancestor of the target carries that
attribute. Measured on the 5 September release build with a real wheel: the page moved 599px, the
room moved 0px, PageDown moved it 538px. `scripts/arcade-scroll-check.mjs` drives the same three
readings in CI and fails if the room does not move; `--expect-broken` is the revert-to-confirm run.

The entrance is a power-cycle told with the tube's own machinery: `frame.bootTarget` driven to
zero and back, the same `--boot-open` variable the site's boot uses, the degauss, the channel
static. Full once per page lifetime (`arcadeSession().entered`, module state, no storage), short
after that. Anything that unmounts the entrance part-way must leave `bootTarget` at 1, and both the
entrance and the room do, because a dark tube with no room over it is the worst state on the site.

The cabinets play themselves. `lib/arcade/attract.ts` is a deterministic unattended player for all
three cabinets and `AttractScreen.tsx` runs it from the one frame clock, only while on screen, at
half rate and without the persistence layer on a coarse pointer. The renderer takes its colours
from `lib/arcade/theme.ts`, read off the site's tokens, and holds no colour literal; the games
follow the amber and ice phosphors for that reason alone.

## The terminal is a real subsystem

**Arcade update, 2026-09-05.** Fergus's rebuild request supersedes the character-only
arcade presentation described below. `ArcadeExperience` loads on demand from Terminal,
opens a native modal, runs a skippable phosphor corridor and presents illustrated
cabinets (three since 2026-09-27; see below). Gameplay remains pure in `lib/arcade/engine.ts`; `renderer.ts` draws the canvas;
`CanvasGame` subscribes to the one SystemProvider clock at fixed 60Hz. CSS is isolated in
`components/arcade/arcade.css`. The old `ArcadeScreen` remains the ProgramSpec fallback.
The shared contracts still apply: Escape restores the prompt, resize preserves the run,
pause/blur releases held inputs, reduced motion declines, sound is explicit and no
game state is persisted. `content/arcade-collection.ts` owns cabinet descriptions.

Boards use the dedicated **private** Blob store through `ARCADE_READ_WRITE_TOKEN`, never
the tools' public store. `useCache: false` only gives consistent origin reads on private
Blob, a distinction proven by the failing public-store integration test. ETag writes,
signed run receipts, bounded bodies and global write budgets live in `score-service.ts`,
`score-request.ts` and `blob-board.ts`. Keep the production/preview/development namespaces
separate. Scores are casual client reports, not verified competition. Only the API exposes
board rows; replay receipts stay private. The opt-in real-store test writes development
rows only. Never use the canonical production domain for generated test scores.

**Three cabinets, 2026-09-27.** Fergus cut the arcade to DEAD SIGNAL (`signal`), CIRCUIT POKER
(`poker`) and a new typing game, KERNEL PANIC (`panic`). Breakpoint, Phosphor Pong, Ouroboros and
Under the Terminal are retired, and with them arcade multiplayer (`network.ts`, `NetworkLobby`);
Overlap's own WebRTC code is separate and stays. Retired ids are refused by the boards, and their
stored rows are left where they are: nothing was migrated or deleted.

- **One module per cabinet** in `lib/arcade/games/`, each a `GameModule` (`types.ts`): created
  from a seed, stepped at a fixed rate, pure and deterministic, emitting sound events, banners
  and a HUD model through its state. `engine.ts` is the one import point. A typing game declares
  `input: "text"` and `typeable`; the room gives it a real text input and turns the field's value
  into `char:` and `erase` presses (`text-input.ts`), because phone keyboards do not send keys.
  `GameOptions.touch` lets a game shape a phone run (Kernel Panic uses letters and spaces only and
  runs slower); the boards never replay a run from its inputs, so that is safe.
- **Shared chrome** (`chrome.ts`, `draw/kit.ts`): a title card with keycaps lit by the demo, a
  countdown, an on-canvas HUD, banners and a game-over screen, the same for every cabinet. No
  eyebrow above a title, ever: `chrome.test.ts` fails if any text is drawn above one.
- **The header bar is gone**; the Hall of Fame is a section of the arcade front, one table per
  board, empty slots as dashes and no invented rows. `cd arcade` in the nav closes an open room.
- **Dead Signal is losable**: the beam fires only while you move, contact costs hull without
  killing the enemy, and each wave brings a new kind. Balance is judged by the pure simulation in
  its tests (an idle player loses within 30 seconds on 20 seeds), not by headless play, where game
  time runs at a quarter to a third of wall time under software WebGL.
- The direction pad is hidden on a fine pointer with hover; touch screens keep it.

CI runs the phone, game-over/replay/sound/forget and wheel-scroll flows, plus the collection check,
which types a Kernel Panic process to death and scores a Dead Signal kill through the real input.

`lib/commands.ts` stays **pure**, and since 2026-09-03 it is a thin dispatcher over a registry.
Every command is a `defineCommand({ name, aliases, help, hidden, argPool, run })` in one of the
modules under `lib/commands/` (`nav`, `info`, `effects`, `sudo`, `hidden`, and whatever a later
sub-project adds), registered from `lib/commands/index.ts`, where the lines stay alphabetical so
two pull requests rarely collide. `COMMANDS`, `HELP_LINES` and `complete()` are derived from the
registry, so a command is listed by being visible, not by being added to three lists. A
`hidden: true` command is absent from help, completion and `ls`, and is reachable only by name or
through `cd <name>`: that is the door to the arcade, and the `arcade` row in `top` is the one hint.
Since 2026-09-04 that door opens something. `lib/arcade/` is a program runtime the terminal hosts:
a fixed 30Hz tick driven by `SystemProvider`'s one rAF clock, a character grid sized from the
measured cell (48 by 20 down to 32 by 16, and a sentence rather than a clipped grid when even the
smallest will not fit), one key vocabulary for arrows, WASD and swipes, and `Escape` always exiting
to the prompt with the scrollback intact. A game is a `ProgramSpec` in `lib/arcade/<game>.ts` plus
one line in `ARCADE_GAMES`; it writes no React, no CSS and no route. The arcade declines under
`prefers-reduced-motion: reduce` the way `gravity` and `eject` do, in a sentence.

A running program may implement `resize(cols, rows)`: the runtime updates the host first, then asks
the program to keep any live coordinates inside the new character world and redraw without a
restart. Keyboard input is paired by physical key. The logical key chosen on keydown is the one
released on keyup even if modifiers or focus changed, and blur, visibility loss, program hand-off
and exit release every held key before disposal. New games must preserve both contracts.

**The drawer sizes itself to its content, so a program must state a height.** `.shell` is
`position: fixed` with a `max-height` and no height, and an arcade set to `height: auto` inside it
wraps an empty `<pre>`, measures a box a few pixels tall and refuses a screen that is really there.
`.shell:has(.term--program)` sets `--shell-program-h` and the arcade's height is arithmetic on it.
Measured on WebKit at 390 and 320: 40 by 18 and 32 by 16, both at full size.
`scripts/arcade-phone-check.mjs` reaches it through `cd arcade`, rather than adding the hidden door
to the sitemap, and keeps that resize, layout, focus and reduced-motion flow in the required phone
CI job.

Commands that change the running site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`,
`sudo rm -rf /`) return an `effect` descriptor, and a program (a game) returns
`{ type: "program", program }`. `Terminal.tsx` is the only place allowed to act on either. Keep it
that way: it is why the whole command surface is unit-testable without a DOM. To add a command,
add a `defineCommand` to the right module (or a new module with its registration line) and a test
beside it. Run `node scripts/mutation-check.mjs` if you touch a guard: the reduced-motion
refusals, the scanlines range, the theme check, the hidden flag and the door are all mutated by it.

The homepage has an inline terminal directly below About, alongside the drawer on every route.
Only the drawer subscribes to external shell requests and hosts arcade programs. An inline
program command is forwarded before recording history, so it is recorded once by its drawer host.
`components/ShellDrawer.tsx`, mounted once in `components/CrtShell.tsx` beside the status bar,
hosts the same component in a drawer opened by the backtick (when focus is not in a field), by the
terminal button in the status bar, or by a tap on that button on a phone, and closed by Escape
or a click outside. Outside dismissal excludes the arcade portal and the toggle that owns it.
There is one scrollback and one recall list, in `lib/history.ts`, module-level and never persisted,
so closing and reopening the drawer preserves history. `lib/shell.ts` is
the drawer's state machine, pure and tested. `forget` returns an effect like every other command that touches the machine; the
Terminal removes the keys.
