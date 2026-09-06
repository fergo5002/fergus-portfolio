# FergusOS: design, code and content context

Reconciled on 6 September 2026 against repository `f4cc357`, its fetched `origin/main`,
the live site, the original arcade task and the arcade overhaul. This is an onboarding
reference, not a claim that every interaction has been audited. `AGENTS.md` governs work;
the current request and current implementation take precedence over historical plans.

## The purpose and the person

FergusOS is Fergus O'Reilly's personal portfolio and a place to use things he builds.
Its audience includes founders, investors, recruiters, employers and curious builders.
The normal journey is to understand the person, inspect the work, read something useful,
try a tool and start a conversation. The hidden arcade rewards exploration. Important
navigation remains available through links; knowing a command is never the entrance fee
to the professional content.

The public content currently describes Patrick Fergus O'Reilly, in Dublin, starting
third year of Computer Science and Business at Trinity with First Class Honours so far,
and building Tigh Sauna full time alongside it. Tigh leads the current story. Presterly
is a past venture, wound down in August 2026; Loira AI, formerly Larry, is a previous
founding-engineer role. Graphics and lighting work on Under the Campanile, Remand,
ContraBot and the student fund provide other evidence of his range. The portrait and
bio also include the mountains, sea and tennis. These facts come from `content/`, not
from the original June specification, whose roles, names and placeholders are outdated.

The current tagline, "Builds beautiful things that scale", describes two obligations.
Visual quality is part of the work, as is dependable behaviour. The writing explains
specific decisions, mechanisms and mistakes in a plain first-person voice. Personal
pages should reveal the person through the work, rather than become a catalogue of
stacks or inflated statistics. Private background notes are context for understanding
Fergus, not a source to copy wholesale into a public repository or biography.

## The design premise

There is an electron beam painting phosphor behind glass. The screen belongs to a
physical machine with memory, weight and a voice. This premise connects the site's
interactions instead of merely supplying a green colour scheme.

| Property | What the visitor experiences | Existing implementation |
| --- | --- | --- |
| Beam | Raster reveals, scroll smear, power-on strike, channel change | `RasterReveal`, `RouteTransition`, `BootSequence`, `PhosphorScreen` |
| Phosphor memory | Trails, decay, burn-in and degauss | Two-pass persistence simulation in `PhosphorScreen` |
| Glass and magnetism | Scanlines, vignette, sheen, pointer deflection | `CrtShell`, `HeroName`, shader frame signals |
| Mass | Real words can fall, collide and be moved | `GravityStage`, `lib/physics.ts` |
| Voice | Event-driven clicks, impacts, scroll noise and power sounds | `TubeAudio` in `lib/audio.ts` |
| Body | The camera pulls back to a bezel and room | `EjectRig`, `lib/eject.ts`, room shader |
| An operating machine | Shared terminal history, settings, commands, hidden programs | `Terminal`, `ShellDrawer`, command registry, `SystemProvider` |

The June terminal spec establishes the shell and typography. The August Phosphor spec
establishes the material premise. The Mass spec adds persistence, physics, voice and
body. The September arcade overhaul applies those existing ideas to another program.
This lineage matters more than a generic instruction to make a page striking.

Novelty comes from another consequence of this machine, or a useful interaction within
it. A feature can have its own composition and game mechanics while retaining the
machine's fonts, tokens, glass, input model and motion vocabulary.

## The visual system already exists

The implementation is hand-written CSS with Next.js 15, React 19 and TypeScript. There
is no Tailwind, CSS-in-JS or general component kit to install. `app/layout.tsx` loads
JetBrains Mono and VT323 through `next/font`; `app/globals.css` defines their roles.

| Role | Source or value at the audited commit |
| --- | --- |
| Body and controls | `--font-body`: JetBrains Mono with monospace fallbacks |
| Display headings | `--font-screen`: VT323, then the mono stack |
| Ground | `--bg`, `--bg-panel`, `--bg-panel-2` |
| Active phosphor | `--green`, `--green-bright`, `--green-faint`, `--green-line` |
| Accent and emphasis | `--amber`, `--amber-bright` |
| Alerts | `--red` |
| Glow | `--glow`; reduced or removed where sustained reading needs it |
| Spacing | `--sp-1` through `--sp-6`: 4, 8, 16, 24, 32, 48px |
| Ordinary content width | `--maxw`: 1040px |
| Existing corner treatment | `--radius`: 6px |

`--green` is the active phosphor role, not a promise of literal green. Default values
are `#33ff66` on `#0a0e0a`, with `#ffb000` accent. Amber uses `#ffb340` phosphor and
`#9fe8ff` accent; ice uses `#8fdcff` and `#ffcf70`. A second set of hard-coded greens
will fail the theme model even if the first screenshot looks vaguely similar.
The shader's `THEME_PHOSPHOR` in `lib/system.ts` is the corresponding GPU palette.
Arcade canvas colours come through `theme.ts` and `useArcadeTheme`; Relief has its own
explicit palette-reading boundary. New canvas work needs the same connection to tokens.

The composition vocabulary is framed windows with narrow title bars, prompt lines,
readouts, understated rules, bright text and clear controls. Pages are relatively
contained; empty space gives the light and typography room to work. The arcade uses
a wider 1180px inner container because its cabinets need it. Matching the system does
not require identical layouts or widths everywhere.

Articles intentionally constrain reading measure and reduce glow. The tools workbench
also suppresses inherited text shadow on its working surface. Functional command chips,
existing topic tags, a current-role badge and the existing small radius are not licence
to introduce an unrelated system of decorative pills, eyebrow labels and marketing
cards. Nor does avoiding those tropes mean deleting every existing badge or card.

## The component and subsystem map

| Need | Start here | Boundary |
| --- | --- | --- |
| Root layout and fonts | `app/layout.tsx`, `components/CrtShell.tsx` | Preserve the shell's layering and shared lifetime |
| Framed content | `Window.tsx`, `PromptLine.tsx` | Meaningful labels are content; costume is drawn in CSS |
| Project presentation | `ProjectCard.tsx`, `ImageFrame.tsx`, `SignalPlate.tsx` | Real imagery and honest fallback; per-project alt text |
| Motion | `components/motion/`, `SystemProvider.tsx` | Reuse the house reveal and the single frame clock |
| Terminal commands | `lib/commands/`, `lib/commands.ts`, `Terminal.tsx` | Parser stays pure; Terminal applies effects/program results |
| Terminal on other routes | `ShellDrawer.tsx`, `lib/shell.ts`, `lib/history.ts` | One shared scrollback; restore focus and preserve input |
| Tool page | `components/tools/ToolPage.tsx`, `workbench.css` | Registry copy, privacy statement, useful work surface and limits |
| Arcade room | `ArcadeExperience.tsx`, `arcade.css` | Own modal semantics and focus inside the existing glass |
| Arcade entrance | `ArcadeEntrance.tsx`, `lib/arcade/bios.ts` | Power-cycle the existing tube; restore power on every exit |
| Cabinet imagery | `AttractScreen.tsx`, `lib/arcade/attract.ts` | Real deterministic games playing unattended |
| Gameplay | `CanvasGame.tsx`, `lib/arcade/engine.ts`, `renderer.ts` | Fixed simulation steps; projection changes on resize |
| Scores and multiplayer | `ScoreBoard`, `HallOfFame`, `NetworkLobby`, `lib/arcade/` | Casual scores, private receipts, bounded writes, explicit failures |
| Public knowledge | `content/`, `lib/seo.ts`, `lib/mcp.ts` | Pages and machine-readable claims use the same facts |

The important layering is shader at 0, normal content at 1, arcade room at 8990, glass
sheen at 8997, flicker at 8999 and scanlines at 9000. The root nav/drawer/status chrome
sits above that. While the arcade is open, `html.arcade-open` hides the underlying
page, nav, drawer **and status bar**. The arcade provides its own controls. A native
`showModal()` dialog enters the browser's top layer; merely reducing its z-index would
not put it back under the glass.

`SystemProvider` owns the frame clock. Lenis, the shader, physics, status and game
renderers use `onFrame`; continuous values live in a mutable frame ref and CSS
variables, not per-frame React state. Settings are discrete React state. Lenis runs
only when motion and pointer conditions permit it. Locking the document stops Lenis;
an independently scrolling room needs `data-lenis-prevent` so wheel events reach it.

The existing motion libraries already cover the required jobs: Lenis for inertial
scroll, OGL for the phosphor simulation, Motion for the magnetic spring. Physics and
audio are authored locally. The arcade overhaul added no package or lockfile change.
The original design failure is therefore not evidence that another library is needed.

## Assets and provenance

The shipped asset catalogue is small and purposeful. `scripts/build-images.mjs` is
the recipe for everything in `public/img/`; source marks live in `assets/sources/`.

| Shipped asset | Meaning and source |
| --- | --- |
| `portrait.jpg` | Real Dolomites portrait, cropped 4:5 from `IMG_1018.HEIC`; ffmpeg decodes HEIC before Sharp crops it |
| `tigh-sauna.png` | Real Tigh house mark, steam teal on birch, from `tigh-house-steam.svg`; the retired orange treatment is not current branding |
| `presterly.png` | Presterly brand mark, composited by the build script |
| `loira.png` | Vendored Loira looping L, from `loira-l-white.svg` |
| `remand.png` | Authored illustration of discussion threads becoming a demand signal |
| `contrabot.png` | Authored price/sentiment illustration, not a product screenshot |
| `under-the-campanile.jpg` | Real Trinity game screenshot showing the lighting work |
| `SignalPlate` | Procedural alignment card for a missing project image, never a pretend screenshot |
| Arcade canvases | Procedural gameplay and attract mode, with theme-driven colours; no image pack |
| Icon and social cards | `app/icon.svg` and the `opengraph-image.tsx` generators |

The two external originals referenced by the build script were present on this machine
on 6 September. They remain external to the repository; a fresh clone may not have
them. The script reports missing sources. Raster outputs are derived artefacts.
Images receive a phosphor tint in `ImageFrame`, resolve towards full colour on hover,
and use a lighter treatment on touch. Brand artwork may contain the brand's own type;
the site's interface-font contract does not mean relettering somebody's logo.
`content/projects.ts` owns accurate alt text distinguishing logos, illustrations and
screenshots. There are no audio sample assets: sound is synthesised at runtime.

## Public surfaces and their jobs

| Surface | Purpose and significant limits |
| --- | --- |
| Home, experience, projects | Person, current work and evidence; real links alongside the terminal |
| Writing index and eleven articles | Specific engineering, founder and craft experience; readable long-form text |
| Contact | Dependable conversation entry; server-action form with a no-JavaScript path |
| Tools index | Five working tools, described by the result a visitor can obtain |
| Headline check | Server URL fetch under SSRF bounds; separate local HTML playground |
| Drift | Local comparison with the visitor's own writing; not an AI detector |
| Relief | Local dated-event terrain; PNG/SVG/STL export; optional direct GitHub request |
| Overlap | Local comparison of two files, or a direct peer comparison; hashes/counts/IP exposure are explained |
| Second Visit | Browser-worker retention analysis, model provenance and visible uncertainty |
| MCP documentation/API | Public content available as structured facts, through the source-stated protocol |
| Hidden arcade | Six games, solo boards, local/direct-peer Pong and Snake, explicit reduced-motion refusal |

The game IDs remain `bounce`, `pong`, `snake`, `under`, `signal`, `poker`; their public
names are Breakpoint, Phosphor Pong, Ouroboros, Under the Terminal, Dead Signal and
Circuit Poker. Poker is single-player draw, not the original unbuilt six-max proposal.
The character `ProgramSpec` host is compatibility code, not the current gallery.

The programme spec also describes future tools, Burn and Play your website. A planned
interface or an old branch is not a shipped feature. Consult the ledger, then verify
the actual route, registry and service state before selecting work.

## Quality obligations that follow the design

- Whole meaningful words must exist in server HTML before client effects replace them.
  The hero renders the plain name once on the server; after mount it keeps an accessible
  copy beside the hidden-from-assistive-tech visual characters. A client `textContent`
  snapshot during scramble is not a server-text extraction test.
- Decorative prompts and anchor glyphs belong in CSS `content`. `aria-hidden` does not
  remove strings from ordinary HTML-to-text extraction. Real navigation is intentional.
- `lib/seo.ts` owns canonical/schema construction; sitemap, robots, feed, llms and MCP
  derive from content. Framework chunks must remain crawlable so boot can reveal content.
- `lib/boot.ts` defines power/reveal ownership. Every interruption and unmount must
  leave a visible machine. Timeouts cannot be tuned to outlast a throttled animation.
- Reduced motion is an alternate behaviour: static or instant ordinary pages; explicit
  refusal for gravity, eject and arcade. Sound starts only by choice and is silent at rest.
- Phone evidence includes WebKit at 390/320, readable text, 16px inputs, 44px targets,
  overflow, scrolling, focus and actual touch controls. A narrow desktop is different.
- Persistent local state follows explicit saves, under owned keys that `forget` removes.
  Cookieless analytics is separate from user-requested saved state. Defaults leave no key.
- Contact, imports, reports, rooms and boards need visible, recoverable failures.
  No plausible stale report after invalid input; no unsupported privacy or result claims.
- Keep Presterly's figures historical and correctly scoped. Tigh carries no public
  traction numbers here. Retired product names and private company details stay out of copy.

## What failed in the original arcade

The original request explicitly required the website's styling. The recovered Codex
task shows reads of `AGENTS.md`, the personal-site conventions, the Toolshed programme,
the Phosphor and Mass specs, and a frontend-design skill. It also shows nine image-view
events and a commentary claiming the gallery looked coherent. This was not a case of
having no documents, no browser, no screenshots or no design skill.

| Decision in PR #15 (`347a314`) | Why it broke continuity | Correction in PR #16 (`3b1a660`) |
| --- | --- | --- |
| Native modal, z-index 10000, opaque separate ground | It sat above the machine's glass | Body portal at 8990, shared glass, hidden underlying chrome |
| Local palette beginning `#a2ffa2` / `#ffc478` | It approximated green/amber but ignored theme roles | Existing site tokens and a canvas theme adapter |
| Arial/Helvetica 900-weight display lettering | It replaced the distinctive VT323 hierarchy | Existing display/body type and phosphor glow |
| Broad promotional hero, separate wordmark, illustrated cards | It introduced another identity inside an established interface | Terminal header, live cabinets, window furniture and arcade tables |
| Separate corridor spectacle | It did not use the existing power behaviour | Power-cycle, degauss, channel static and BIOS |
| Document lock without wheel exemption | Stopped Lenis cancelled the room's wheel events | `data-lenis-prevent`, checked with real wheel input |

The engines and services were largely retained; the engine diff mainly adds event
positions for shared light/sound. The overhaul's package and lockfile diff is empty.
That makes an unavailable library or missing game capability a poor explanation.

The best-supported diagnosis is a context-application and design-judgement failure:
the implementation reduced the brief to a loose green arcade aesthetic, despite
reading the stronger system constraints. Functional checks and image inspection did
not provide an effective acceptance check against the host site. The existing release
evidence demonstrated useful game and infrastructure behaviour, but did not establish
the design claim that was made. It also missed ordinary wheel scrolling.

The historical record does not reveal every cause of the decision. It does not justify
blaming model capability, absent tools, compaction or the user. Stale documentation is
a real risk for future work, but the original task had read the relevant design sources.

## The practical design review

Before implementation, write a short mapping from the requested experience to the
existing components, tokens, material behaviour and reference screens. Name any
deliberate departure. A generic frontend skill can assist the work; it cannot redefine
the site's identity.

Build one representative state inside the shell and inspect it beside home/projects
and the closest existing feature. Judge typography, density, spacing, colour roles,
glass, motion, content hierarchy and touch behaviour before repeating the pattern
through six games or five tools. This is an agent review step, not a new requirement
to interrupt Fergus for routine decisions.

Keep visual and behavioural evidence distinct. Inspect actual screenshots and motion
states, then test the relevant failure paths. Green tests do not establish beauty;
a compelling screenshot does not establish scrolling or input. Theme changes should
reach both DOM and canvas. A test must use the visitor's input path: setting `scrollTop`
does not test a mouse wheel; calling `.focus()` before Space can hide broken autofocus.
Shader brightness requires measured pixels, not smaller constants.

The repository already contains structural guards for arcade fonts, palette, layering,
frame ownership and cleanup, plus a real-wheel script. They protect specific contracts.
They do not replace a comparison with the site or prove that a game is enjoyable.

## Evidence and limits of this onboarding

The 6 September pass inspected all thirteen route patterns at 1440x900 in Chromium
151.0.7922.34, with one of the eleven articles selected for the visual sample. All
returned 200 and the visits recorded no uncaught page exceptions. Screenshots were
read for the home, experience, projects, writing, article, contact, MCP and all five
tool surfaces. Initial captures caught some headings during scramble; four were
retaken after observing the settled text. This was not a complete tools workflow test.

The existing arcade screenshot driver completed desktop green and emulated iPhone 12
WebKit at 390x844 with no page exceptions. It captured entrance states, gallery,
attract mode, detail, play, pause, results, exit and re-entry. Representative desktop
and phone captures were inspected. This does not establish that every screen is free
of visual defects, nor is it a physical-phone or GPU performance measurement.

The fresh wheel experiment held the background at 600px: the current room moved 474px,
removing only `data-lenis-prevent` in the isolated browser reduced movement to 0px,
and restoring it restored 474px. This reproduces the mechanism without changing source
or redeploying. Amber and ice computed room colours matched their root tokens, with
room z-index 8990 and scanlines 9000. No production score or contact message was sent.

Primary sources: `AGENTS.md`; the June terminal, August Phosphor/Mass and SEO specs;
the September Toolshed programme; the arcade overhaul spec; `docs/arcade-rebuild.md`;
the commits above; current components, styles, content and image-build script. The
private audit additionally used the shared personal-site notes, relevant Fergus/feedback
sections and the original task, titled **Build arcade games and deploy**.

Captures and diagnostic scripts are local audit artefacts, outside `public/`. The shared
personal-site conventions note records their location and the diagnostic findings so
they remain discoverable across tasks. No Vercel account metadata was rechecked in this
session, and no implementation, publication or deployment is implied by this document.
