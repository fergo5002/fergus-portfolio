# FergusOS Terminal Portfolio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CRT-terminal-styled personal portfolio (landing, experience, projects) in
Next.js, deployable on Vercel.

**Architecture:** Next.js App Router, TypeScript, hand-crafted CSS for the CRT aesthetic
(no Tailwind — the retro effects are bespoke and CSS-variable-driven for easy tweaking).
All editable content lives in typed `content/*.ts` data files. Pages are React Server
Components; only the boot sequence, typewriter, and interactive terminal are client
components. CRT effects are CSS-first and respect `prefers-reduced-motion`.

**Tech Stack:** Next.js 15, React 19, TypeScript, `next/font` (JetBrains Mono + VT323),
custom global CSS. No backend, no DB.

---

## File Structure

```
fergus-portfolio/
  package.json  tsconfig.json  next.config.mjs  next-env.d.ts
  app/
    layout.tsx               # root: fonts, metadata, CrtShell wrapper
    globals.css              # CRT design system: vars, scanlines, glow, type, layout
    page.tsx                 # landing
    experience/page.tsx
    projects/page.tsx
  components/
    CrtShell.tsx             # scanline/vignette/curvature frame (client; reduced-motion aware)
    Nav.tsx                  # persistent terminal top-bar nav (client; active route)
    BootSequence.tsx         # one-time boot animation (client; sessionStorage)
    Typewriter.tsx           # types text in, aria-live polite (client)
    Terminal.tsx             # interactive mini command-line on landing hero (client)
    Window.tsx               # phosphor-framed panel (server)
    ImageFrame.tsx           # image w/ duotone+scanline overlay + placeholder fallback (server)
    PromptLine.tsx           # "user@host:~$ cmd" line (server)
    ProjectCard.tsx          # projects grid item (server)
    ExperienceItem.tsx       # git-log-style experience entry (server)
  lib/
    commands.ts              # pure terminal command parser (unit-tested)
    commands.test.ts
  content/
    profile.ts  experience.ts  projects.ts  skills.ts
  public/img/
    .gitkeep                 # user drops portrait + screenshots here
```

---

### Task 1: Scaffold Next.js project

**Files:** Create `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`,
`app/layout.tsx`, `app/page.tsx` (temporary), `public/img/.gitkeep`.

- [ ] Create `package.json` with Next 15 / React 19, scripts (`dev`, `build`, `start`,
  `lint`, `test`), and `vitest` devDep for the command parser test.
- [ ] Create `tsconfig.json` (Next defaults, `"@/*"` path alias to project root).
- [ ] Create `next.config.mjs` (empty/default config).
- [ ] Create minimal `app/layout.tsx` and placeholder `app/page.tsx` so the app boots.
- [ ] Run `npm install`.
- [ ] Verify: `npm run build` succeeds. Commit.

### Task 2: CRT design system (globals.css) + fonts in layout

**Files:** `app/globals.css`, `app/layout.tsx`.

- [ ] Define CSS variables: `--bg #0a0e0a`, `--green #33ff66`, `--green-dim #1f8f3a`,
  `--amber #ffb000`, `--red`, spacing scale, font vars.
- [ ] Global resets, mono body text, phosphor `text-shadow`, link styles (amber), focus
  rings (visible, amber/green).
- [ ] Scanline overlay + vignette + subtle flicker keyframes; **wrap all motion in
  `@media (prefers-reduced-motion: no-preference)`** so reduced-motion gets static render.
- [ ] Responsive rules: tone down glow/scanlines at ≤768px; no horizontal scroll; base 16px.
- [ ] `app/layout.tsx`: load JetBrains Mono + VT323 via `next/font/google`
  (`display: swap`), set metadata (title/description), expose font CSS vars, render
  `<CrtShell>` + `<Nav>` around `{children}`.
- [ ] Verify build. Commit.

### Task 3: Content data files

**Files:** `content/profile.ts`, `content/skills.ts`, `content/experience.ts`,
`content/projects.ts`.

- [ ] `profile.ts`: name, tagline, bio paragraph(s), contact (email gmail, github, linkedin),
  education line. Export typed `Profile`.
- [ ] `skills.ts`: grouped skills (languages/frameworks/data+infra/ai/graphics/tools/spoken/
  interests) as typed `SkillGroup[]`.
- [ ] `experience.ts`: typed `ExperienceItem[]` — Hatch105 (HappyStack, ecommerce, `isNew:true`,
  role/dates as `"[ TBC ]"` placeholders), Larry (CTO & Co-Founder, Feb 2025–Present, bullets,
  link), Trinity Student Managed Fund (Junior Analyst, 2024–25, bullets).
- [ ] `projects.ts`: typed `Project[]` — Larry, Remand, Under the Campanile, Sauna OS,
  ContraBot. Each: `slug, title, tagline, role, bullets[], stack[], links{live?,github?},
  image (path under /img, placeholder until present)`.
- [ ] No test needed (static data). Commit.

### Task 4: Terminal command parser (pure logic + tests)

**Files:** `lib/commands.ts`, `lib/commands.test.ts`.

- [ ] Write `lib/commands.test.ts` first: `runCommand("help")` returns help text;
  `runCommand("whoami")` returns name/tagline; `runCommand("ls")` lists sections;
  `runCommand("cd projects")` returns a navigate action `{type:"navigate",href:"/projects"}`;
  `runCommand("sudo hire-me")` returns an easter-egg line; unknown command returns
  `command not found` text. Parser is pure (no DOM).
- [ ] Run `npm test` → FAIL (module missing).
- [ ] Implement `lib/commands.ts`: `type CommandResult = {type:"output";lines:string[]} |
  {type:"navigate";href:string}`; `runCommand(input: string): CommandResult`. Reads section
  list from content where useful.
- [ ] Run `npm test` → PASS. Commit.

### Task 5: Core CRT components

**Files:** `CrtShell.tsx`, `Nav.tsx`, `PromptLine.tsx`, `Window.tsx`, `ImageFrame.tsx`,
`Typewriter.tsx`, `BootSequence.tsx`.

- [ ] `CrtShell.tsx` (client): renders scanline/vignette overlays + screen frame around
  children; pure CSS classes from globals.
- [ ] `Nav.tsx` (client): persistent top bar `fergus@portfolio:~$` + links to `/`,
  `/experience`, `/projects`; highlights active route via `usePathname`; real `<Link>`s.
- [ ] `PromptLine.tsx` (server): renders `prompt$ command` with styled parts.
- [ ] `Window.tsx` (server): titled phosphor panel with `[_][□][x]` chrome; `title` + children.
- [ ] `ImageFrame.tsx` (server): given `src`+`alt`, render `next/image` with duotone+scanline
  overlay; if `src` falsy render labelled placeholder box `[ insert: <label> ]`. Reserve
  aspect ratio (no CLS).
- [ ] `Typewriter.tsx` (client): types `lines` char-by-char; `aria-live="polite"`; if
  reduced-motion, render full text instantly.
- [ ] `BootSequence.tsx` (client): types boot lines once per session (`sessionStorage`),
  skippable on key/click, then reveals children; reduced-motion → instant.
- [ ] Verify build. Commit.

### Task 6: Interactive Terminal component

**Files:** `Terminal.tsx`.

- [ ] `Terminal.tsx` (client): input line with blinking cursor + scrollback; on submit calls
  `runCommand`; `output` results print to scrollback, `navigate` results `router.push`.
  Clickable hint chips (`help`, `ls`, `cd projects`) for non-typists. Keyboard accessible.
- [ ] Verify build. Commit.

### Task 7: Landing page (`app/page.tsx`)

**Files:** `app/page.tsx`.

- [ ] Compose: `<BootSequence>` → hero `Window` with `whoami` (name, tagline,
  `ImageFrame` portrait placeholder) → `<Terminal>` → highlights strip (Hatch105 / Larry /
  1.1 Scholar cards) → About section (`cat about.txt`) → Skills (`ls ./skills` grouped) →
  Contact (`./contact.sh` with mailto/github/linkedin links). Pull all text from `content/`.
- [ ] Verify build + manual render. Commit.

### Task 8: Experience page (`app/experience/page.tsx`) + `ExperienceItem`

**Files:** `app/experience/page.tsx`, `components/ExperienceItem.tsx`.

- [ ] `ExperienceItem.tsx` (server): git-log-style entry — `* commit` marker, title, org,
  role, dates, bullets; amber **NEW** badge when `isNew`.
- [ ] `experience/page.tsx`: heading (`git log --author=fergus`), map `experience` data
  through `ExperienceItem` (Hatch105 first). Metadata for the route.
- [ ] Verify build + render. Commit.

### Task 9: Projects page (`app/projects/page.tsx`) + `ProjectCard`

**Files:** `app/projects/page.tsx`, `components/ProjectCard.tsx`.

- [ ] `ProjectCard.tsx` (server): `Window`-framed card — title, tagline, role, `ImageFrame`
  screenshot placeholder, stack tags as terminal flags (`--next --fastify ...`), bullets,
  live/GitHub links.
- [ ] `projects/page.tsx`: heading (`ls -la ./projects`), responsive grid of `ProjectCard`
  from `projects` data (Larry first). Metadata.
- [ ] Verify build + render. Commit.

### Task 10: Polish, a11y & verification pass

**Files:** various (small fixes).

- [ ] Check: headings hierarchy, all images have alt, focus visible, nav active state,
  contrast (green/amber on `--bg` ≥ 4.5:1), reduced-motion path, 375px width (no h-scroll),
  touch targets ≥44px.
- [ ] Run `npm run build` (clean) and `npm test` (green); fix any issues.
- [ ] `README.md`: how to run, where to edit content, where to drop images, how to deploy.
- [ ] Commit. Launch `npm run dev` and show the user.

---

## Self-Review

**Spec coverage:** Concept/vibe → Task 2. Image handling → ImageFrame (Task 5). Architecture/
routes → Tasks 7–9. Nav model + interactive terminal → Tasks 5,6. Page content → Tasks 7–9
(data Task 3). Visual system → Task 2. Motion + reduced-motion → Tasks 2,5. Accessibility →
Tasks 2,5,10. Tech structure → Task 1 + file map. Content data → Task 3. Placeholders
(Hatch105/images) → Tasks 3,5. All spec sections mapped. ✅

**Placeholders:** Hatch105 role/dates and images are *intentional product placeholders*,
explicitly modelled in data (`"[ TBC ]"`) and ImageFrame fallback — not plan gaps.

**Type consistency:** `runCommand`/`CommandResult` (Task 4) consumed by `Terminal` (Task 6);
`Project`/`ExperienceItem`/`SkillGroup`/`Profile` types (Task 3) consumed by pages/components
(Tasks 7–9). `ImageFrame` props (`src`,`alt`,`label`) consistent across uses. ✅
