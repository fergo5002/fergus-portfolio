# FergusOS Terminal — Portfolio

A personal portfolio styled as a retro CRT computer terminal. Built with Next.js
(App Router) + TypeScript, hand-crafted CSS for the phosphor aesthetic. No backend.

## Run it

```bash
npm install      # first time only
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm start        # serve the production build
npm test         # run the command-parser unit tests (vitest)
```

## Editing your content

All editable text lives in `content/` — you shouldn't need to touch components:

| File                     | What's in it                                              |
| ------------------------ | --------------------------------------------------------- |
| `content/profile.ts`     | Name, tagline, bio, education, contact links, portrait path |
| `content/experience.ts`  | Hatch105, Larry, Trinity Student Managed Fund             |
| `content/projects.ts`    | Larry, Remand, Under the Campanile, Sauna OS, ContraBot   |
| `content/skills.ts`      | Grouped skills readout                                    |

### Things to fill in

- **Hatch105 role + dates** — `content/experience.ts`, the `hatch105` entry has
  `[ ROLE — TBC ]` / `[ DATES — TBC ]` placeholders.
- **Images** — drop files into `public/img/`, then point the matching entry at them:
  - Portrait → set `portrait: "/img/portrait.jpg"` in `content/profile.ts`.
  - Project screenshots → set each project's `image` in `content/projects.ts`
    (e.g. `image: "/img/larry.png"`).
  - Until a path is set, the site shows a labelled placeholder box.

## Customising the look

The whole CRT theme is driven by CSS variables at the top of `app/globals.css`
(`--green`, `--amber`, `--bg`, spacing scale, glow). Change those to retune colours.
The image tint lives in `.imgframe__img` (the `filter:` line) — dial it down or
remove it if you'd rather show photos in full colour.

Motion (scanline drift, flicker, blinking cursor, boot animation) is automatically
disabled for visitors who set `prefers-reduced-motion`.

## Deploy

Deploys to Vercel with zero config:

```bash
vercel          # preview
vercel --prod   # production
```

## Structure

```
app/            layout + the three routes (/, /experience, /projects)
components/     CRT shell, nav, boot sequence, terminal, windows, cards
content/        your editable data (edit here)
lib/            terminal command parser (+ tests)
public/img/     your images
```
