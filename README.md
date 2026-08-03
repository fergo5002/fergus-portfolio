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
| `content/experience.ts`  | Presterly (Hatch105), Loira AI, Trinity Student Managed Fund |
| `content/projects.ts`    | Presterly, Firespark, Loira AI, Remand, Under the Campanile, ContraBot |
| `content/skills.ts`      | Grouped skills readout                                    |

### Images

Everything in `public/img/` is built by `node scripts/build-images.mjs`. Don't hand-edit
the files — change the script and re-run it. See the Images section of `AGENTS.md` for
where each source comes from and why. Set `image` **and `imageAlt`** together on a
project; a project with no `image` falls back to a procedural CRT alignment card.

## Customising the look

The whole CRT theme is driven by CSS variables at the top of `app/globals.css`
(`--green`, `--amber`, `--bg`, spacing scale, glow). Change those to retune colours.
Three phosphor themes ship (`green`, `amber`, `ice`) and are switchable live from the
site's own terminal with `theme amber`. Imagery is phosphor-tinted at rest and resolves
to full colour on hover; that tint lives in `.imgframe__img` (the `filter:` line).

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
