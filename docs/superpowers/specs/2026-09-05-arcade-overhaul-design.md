# The arcade, inside the tube

**Date:** 2026-09-05
**Status:** decided (Fergus, via design grilling, four forks, all four recommendations taken)
**Supersedes:** the presentation half of `docs/arcade-rebuild.md`. The engines, the board API, the
Blob store, the WebRTC link and the legacy character host are untouched.

## The problem, in Fergus's words

"It doesn't mimic the design of the rest of the website. It feels very different. The loading
animation should be really cool, like you're transforming into the universe of an arcade, like
you're changing electrics. Right now it looks boxy. It's missing all of the animations. The games
don't look as cool as they could. Make the ability to look at leaderboards way better. And you
can't even scroll on the arcade page."

## What was actually wrong, measured on the live site

- The arcade was a `<dialog>` at `z-index: 10000`, **above** the scanlines (9000), the vignette,
  the glass sheen (8997) and the phosphor shader (0). It was not inside the tube. Nothing the site
  does to make a page read as a CRT reached it.
- It carried its own palette (`#a2ffa2`, `#ffc478`, `#85b395`, `#254934`, `#07110c`) rather than the
  site's tokens, so it ignored the three phosphor themes and had no `--glow` text-shadow.
- Display type was `Arial, Helvetica` at weight 900 on a site set entirely in VT323 and JetBrains
  Mono. Arial is on the design skill's ban list.
- Layout was a marketing landing page: hero, three-column card grid, footer. The site's vocabulary is
  window panels with title bars, prompt lines, a terminal and a status strip.
- The scroll bug, reproduced against a production build with a real wheel through Lenis: a control
  wheel moved the document 599px; inside the arcade five wheel ticks moved the dialog 0px while
  `html` carried `lenis-stopped`; PageDown moved it 538px. Lenis 1.3 calls `preventDefault()` on
  every wheel event while stopped unless an ancestor carries `data-lenis-prevent`. The dialog had
  none. That is the mechanism (`node_modules/lenis/dist/lenis.mjs`, the `isStopped` branch of
  `onVirtualScroll`).

## Decisions

| Fork | Decision | Why |
|---|---|---|
| Where it lives | Inside the tube: a fixed panel at `z-index: 8990`, below every glass layer and the status bar, above the page. Site tokens, VT323 and JetBrains Mono, follows the active phosphor theme. | The site's strength is coherence. A room that sits above the glass cannot be part of the machine. |
| Entrance | A power-cycle: channel loss, the tube collapses to a line and goes dark, a different machine strikes on with its own BIOS, the picture opens into the gallery. Full sequence on the first entry of a page lifetime; a short channel-change on re-entry. | "Changing electrics" is exactly the power-on vocabulary the shader already has (`uPower`). Once per lifetime keeps testing bearable. |
| Gallery | Live attract mode: each cabinet screen is a canvas running its real game unattended, alternating with its top five. Hover or focus brightens it. | The engine is deterministic and cheap. A real arcade demos itself; that is the one memorable thing. |
| Leaderboards | Arcade tables everywhere (rank, big initials, tabular scores, your posted row lit, your rank shown), plus a Hall of Fame screen from the gallery header with all six boards. | "Way better" means a place to go and look, and a table that reads like the thing it is. |

Two decisions Fergus did not have to be asked about, because the brief settles them: no eyebrows
(the small uppercase line above a heading is banned on his sites), and prose in the terminal's
lowercase voice with marquee and canvas text in uppercase, the way a cabinet's own screen would be.

## Architecture

```
┌─ PhosphorScreen (WebGL, z:0) ─────── the tube, unchanged
├─ .crt__screen (DOM, z:1) ─────────── the page, `visibility: hidden` while the room is open
├─ .arcade-room (DOM, fixed, z:8990) ─ the arcade: transparent between panels so the tube shows
├─ CRT glass overlays (z:8997..9000) ─ scanlines, vignette, sheen, flicker, unchanged
└─ status bar (z:9100) ────────────── stays visible: the arcade is a program on this machine
```

The nav and the shell drawer are hidden while the room is open (`html.arcade-open`), because both
sit at 9050 and above and would draw over the arcade. Both come back on exit. The drawer is where
the room was launched from on every route but the home page, and it must be visible again after
Escape; `scripts/arcade-collection-check.mjs` asserts that.

### Components (`components/arcade/`)

| File | Job |
|---|---|
| `ArcadeExperience.tsx` | The room. A state machine: `entering`, `gallery`, `detail`, `play`, `fame`. Portals to `document.body`, adds and removes `html.arcade-open`, locks scroll, docks the machine (no eject, no gravity), owns Escape and focus. Carries `data-lenis-prevent`. |
| `ArcadeEntrance.tsx` | The power-cycle. Drives `frame.bootTarget` down and up, fires the degauss and the channel static, types the arcade BIOS with the site's `Typewriter`, then hands over. Skippable by button, Enter or click. |
| `AttractScreen.tsx` | One canvas running one game unattended through `lib/arcade/attract.ts`, on the one frame clock. Alternates between the demo and the cabinet's top five. Runs only while intersecting the viewport; halves its render rate on coarse pointers. |
| `Gallery.tsx` | The header strip, the marquee title, the six cabinets, the footer. |
| `CabinetDetail.tsx` | One cabinet: its attract screen large, the copy, the three ways to start, its board. |
| `CanvasGame.tsx` | The playable game, restyled: the canvas in a window panel whose bar carries the live HUD, phosphor persistence, glow, shader impacts on events, theme colours. Input and network code unchanged. |
| `ScoreBoard.tsx` | The arcade table and the initials entry. |
| `HallOfFame.tsx` | All six boards. |
| `NetworkLobby.tsx` | Unchanged logic, restyled. |
| `arcade.css` | Everything above. Imported by `ArcadeExperience.tsx` and nowhere else. |

`CabinetArt.tsx` is deleted. The attract screen is the cabinet art.

### Pure modules (`lib/arcade/`)

- `attract.ts`: `attractKeys(state, rng)` returns the keys an unattended player would hold this
  tick for any of the six games, and `createAttract(id, seed)` wraps a game so it restarts itself a
  couple of seconds after it ends. No DOM, no timers. Tested per game: it launches, moves, scores
  or survives within a bounded number of ticks, and never throws.
- `theme.ts`: `readArcadeTheme(style)` turns the site's CSS custom properties into the canvas
  colours the renderer needs, with the green phosphor as the fallback when a variable is missing.
  Pure parser, tested with the three themes' actual token values.
- `renderer.ts`: takes the theme. Draws the world into a persistence layer that decays each frame
  (phosphor trails) and the HUD sharp on top. Glow is additive: a wide translucent stroke under a
  thin bright one, never `shadowBlur`. A grep test proves it holds no colour literal.
- `engine.ts`: gains `eventAt`, the world position of the last sound event, so the shader can be
  lit where the hit happened. Additive; every existing engine test still passes unchanged.
- `session.ts`: gains `lastPosted` (game, initials, score) at module level, so the table can light
  the row the visitor just posted. Dies with the tab, touches no storage.

### Copy (`content/arcade-collection.ts`)

Rewritten in the terminal's voice. Marquee titles stay uppercase. Button labels that the CI
scripts match by accessible name are updated in the scripts in the same change.

The BIOS lines are content too. One of them is true rather than decorative: `boards ... online` or
`boards ... offline` is printed from the real `fetchBoards()` result, and `cabinets found ... 6` is
the length of the cabinet list, not a typed number.

## The entrance, second by second

| t | Tube (`frame.bootTarget`) | DOM | Sound |
|---|---|---|---|
| 0.00 | still 1 | room mounts transparent; page hidden; channel static overlay plays | degauss |
| 0.15 | 0 (ramp down, 1.4s linear, visible collapse from about 0.5s) | nothing on the room yet | |
| 1.55 | 0 (dark) | | |
| 1.65 | 1 (ramp up, the strike line, then the band opens) | BIOS panel scaled by `--boot-open`, the same variable the site's own boot uses | power on |
| 2.00 | opening | BIOS types at 6ms a character | |
| 3.20 | 1 | BIOS done, a 24-cell bar fills over 400ms | |
| 3.60 | 1 | gallery raster-reveals, cabinets stagger in at 70ms | degauss |

Re-entry in the same page lifetime: the channel static and a degauss, then the gallery. About half
a second. Exit is the same short form in reverse.

The sequence is skippable from its first frame. Skip jumps to the gallery with the tube fully up.

## The scroll fix

`data-lenis-prevent` on the room. Kept `setScrollLocked(true)` for the document behind it and
`overscroll-behavior: contain` on the room so the document never receives a chained scroll. The
isolation test is `scripts/arcade-scroll-check.mjs`: control wheel on the page, then five wheel
ticks inside the room, expecting movement. The revert-to-confirm is run once by removing the
attribute in a disposable build and watching the check go red.

## Phones

The phone is the product surface. The gallery is one column at 390 and 320; the attract screens
run only while in view and at half rate; the play screen keeps the canvas full width with the
d-pad and action at 48px; the Hall of Fame stacks. `scripts/arcade-collection-check.mjs` drives
WebKit at 390 and 320 and a throttled Chromium Pixel through every cabinet, and it fails on
overflow, targets under 44px, inputs under 16px and a missing canvas. Physical phones stay
unverified, as before.

## Reduced motion

Unchanged: the arcade declines at the door under `prefers-reduced-motion`, and leaves if the
preference changes mid-session. There is no still version of a game.

## Testing

- Pure modules: vitest, written before the code.
- Components: coupling greps in `components/arcade/arcade.test.ts`, in the repo's pattern: the
  room carries `data-lenis-prevent`; its z-index is below the glass; the attract screen subscribes
  to `onFrame` and never starts a `requestAnimationFrame`; no `setState` inside a frame callback;
  the renderer holds no hex literal; the entrance reads `arcadeSession().seen` before choosing
  the long form.
- Browser: `scripts/arcade-collection-check.mjs` (phones), `scripts/arcade-visual-check.mjs`
  (desktop, every game), `scripts/arcade-flow-check.mjs` (a completed run, replay, forget),
  `scripts/arcade-multiplayer-check.mjs` (two real browsers), and the new scroll check.
- Production: `npm run build`, then the same scripts against `next start`, then the live domain
  after the deploy lands.
