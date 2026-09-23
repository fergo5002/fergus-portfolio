# FergusOS Terminal

Fergus O'Reilly's portfolio and browser tools, built as a physical CRT machine.
Next.js 15, React 19, TypeScript and hand-written CSS. The contact and meeting
forms send through Resend; the arcade and other server routes have their own
bounded storage contracts in AGENTS.md.

## Run it

```sh
npm ci
npm run dev
npm test
npm run build
npm start
```

The terminal opens from the bottom bar on every route, including home. Escape,
the close button or clicking outside dismisses it. Its history lasts for the tab.
The arcade keeps its power-cycle entrance and restores the regular top nav.

## Content

Editable copy lives in `content/`:

- `profile.ts`, `home.ts`: identity, introduction and linked work previews.
- `experience.ts`: Tigh Sauna, Hatch105, Presterly and Loira AI.
- `projects.ts`: projects and honest image descriptions.
- `articles/`: writing, including the short interactive reservation note.
- `tools/index.ts`: all tool routes and the five featured tools on the index.
- `meeting.ts`: coffee/call request copy. `machine.ts`: bottom-bar controls.

Images in `public/img/` are built by `scripts/build-images.mjs`. Change the recipe,
not the derived image. Use `--tigh-only` or `--remand-only` to rebuild one card.
The Remand card is an authored illustration, not a product screenshot.

## Meeting requests

`/contact?meet=coffee` and `/contact?meet=call` offer 30-minute weekday windows
between 10:00 and 17:00 in Europe/Dublin, at least 24 hours ahead, for 28 days.
A stable date-based selection limits offered slots. They are not a live calendar,
confirmed appointments or reserved inventory. Fergus confirms each request by email.
No visitor data or selected time is persisted. The server revalidates the offer
before sending through the existing contact pipeline and inbox.

The form works without JavaScript. Delayed hydration retains an existing selection.
Provider errors preserve the visitor's words and give an email fallback.
`RESEND_API_KEY` is required for delivery; sender/destination overrides and their
restrictions are documented in `lib/contact.ts` and `.env.example`.

## Design and verification

`app/globals.css` owns the CRT, phosphor themes and machine chrome. The homepage,
meeting controls and article figure have scoped styles. Keep the existing fonts,
one frame clock, glass layers and reduced-motion behaviour.

```sh
node scripts/revision-check.mjs
node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap
node scripts/phone-polish-check.mjs --base http://localhost:3000
node scripts/mutation-check.mjs
docker build -f Dockerfile.parity -t fergus-portfolio-parity .
```

`revision-check` defaults to port 3210; set `REVISION_BASE` for another server.
It sends no live email unless explicitly run with `--send`. A local server with
no Resend key exercises visible failure and no-JavaScript field preservation.

## Deploy

The public GitHub repository deploys `main` to the personal Vercel project
`fergus-portfolio` in scope `larry-pm`. Use `VERCEL_TOKEN_PERSONAL`, never the
Tigh or retired account token. Changes go through a PR and the repository gates.
Verify the exact deployed commit and changed journeys on `fergusoreilly.dev`.
