# Twelve local tool MVPs

Fergus requested a working local MVP of each research pitch on 6 September 2026 so he can choose after trying them. This branch is `codex/twelve-tool-mvps`. Nothing is authorised for deployment.

The local review hub is `/lab`, enabled only with `FERGUSOS_LAB=1`. The existing public tool registry remains the published catalogue. Every prototype has an example, editable inputs, a meaningful result, visible limits and an export where useful. Personal inputs stay in the browser. Downloads provide persistence without adding storage keys.

## Scope

| Tool | Working MVP |
| --- | --- |
| Bottleneck | Seeded service and session simulation, editable capacity and demand, comparison, timeline, CSV |
| Good Window | Dublin-area forecast windows, adjustable weather preferences, explicit sample/live modes, calendar export |
| Black Box | Documented JSON/JSONL trace import, timeline, error/repetition filters, claim-to-event links, private summary export |
| Same Page | Independent structured founder answers, file import/export, difference ranking and discussion record |
| What If | Three Monte Carlo templates with ranges, distributions, sensitivity and scenario export |
| Fair Play | Rotating doubles, balanced rest and pairings, preserve played rounds while replanning, printable/exportable draw |
| Prove It | Five authored deterministic investigations, test budgets, predictions, evidence and debrief |
| Group Lore | WhatsApp text import, participant/activity/phrase analysis, timeline and pseudonymous SVG keepsake |
| Pocket Redact | Images and bounded PDFs rendered to pixels, pointer/keyboard redaction, fresh raster PDF/PNG export and reopened preview |
| Clear Day | ICS import including bounded recurring-event expansion, weekly free blocks, hypothetical meeting move and ICS export |
| Code Atlas | ZIP or metrics JSON import, code city, file details, compare two snapshots, metrics export |
| Resonance | Pendulum sequencer, editable notes/lengths, synthesised sound, preset/patch import/export and reliable stop |

The MVP redactor deliberately exports newly rendered pages. It does not preserve searchable text, signatures, interactive forms or document accessibility structure. The later structural-PDF engine remains a separate evaluation. Good Window uses an explicit forecast source suitable for local review and does not offer marine safety judgements. Forecast availability and any future production licensing are separate from the simulation demo.

## Verification plan

- [x] Tests first for simulation, window matching, trace parsing, comparisons, sampling, scheduling, case scoring, chat parsing, redaction geometry, calendar handling, repository metrics and instrument timing.
- [x] Focused tests, complete existing suite, TypeScript and production build.
- [x] Browser review of every example, changed input and export; malformed imports and important failure cases.
- [x] Real local HTTP review hub, desktop and narrow mobile layouts, reduced motion, no tool input uploads.
- [x] Record exact working limits, local launch command and durable context.

## Dependency rationale

ICAL.js supplies recurrence and timezone handling for real calendar exports. PDF.js renders supported PDFs and pdf-lib creates a new document containing only the redacted raster pages. fflate reads bounded ZIPs for Code Atlas. Each is loaded only by the prototype that needs it. No third-party app is copied wholesale.

| Package | Installed version | Licence |
| --- | --- | --- |
| ical.js | 2.2.1 | MPL-2.0 |
| pdfjs-dist | 6.3.289 | Apache-2.0 |
| pdf-lib | 1.17.1 | MIT |
| fflate | 0.8.3 | MIT |

## Local review

From this worktree:

```powershell
npm run lab
```

Open `http://127.0.0.1:3106/lab`. For the faster production build, run `npm run build` then
`npm run lab:start`. Stop an existing server before rebuilding its `.next` directory.
`LAB_PORT` changes the port. The launcher sets the lab flag only for its child process.

The shortlist and notes live in the shared lab React layout, so links between its pages preserve
them. Refreshing or closing the tab clears them; download the review on the hub to keep it.
Tool inputs also stay in memory unless downloaded. Most examples are preloaded; Good Window,
Pocket Redact and Clear Day have an explicit example button. Examples are fictional.

## Evidence, 6 September 2026

- `lib/lab/engines.test.ts`: 29 behavioural tests. Calendar timezone rejection and blank weather
  limits were added as failing regressions before their fixes.
- Full suite: 150 passing test files, two opt-in skipped files; 2,567 passes and three skips.
  The first highly parallel run timed out in the existing Overlap chunking test. It passed alone
  and in the complete run with two workers, without changing its code or timeout.
- `tsc --noEmit` and the production build pass. Existing public pages still build; 44 static pages.
- `scripts/lab-check.mjs`: all thirteen production-browser workflows pass with no page errors.
  Checks include note persistence, identical-arrival comparison, all three uncertainty templates,
  retained played rounds, chat/ZIP/ICS imports, output files and malformed input feedback.
- Redaction proof imports a real two-page PDF, exports a new PDF, verifies its page count and
  absence of text-font resources, and samples a black pixel in the reopened output. Image import,
  coordinate redaction and PNG export also pass. PDFs have an additional 32 megapixel total cap.
- Resonance proof observes oscillator notes being scheduled and AudioContexts closing on Stop;
  pagehide also stops playback. It does not claim a physical speaker or phone was exercised.
- Good Window successfully fetched a live forecast directly from Open-Meteo in Chromium.
  Its simulated 503 failure is visible. No marine-safety judgement or production service licence
  is implied by that local test.
- Gate proof: `/lab` and `/lab/bottleneck` return 200 with the flag, 404 without it. The sitemap
  contains no lab route. No public hosting configuration was changed.
- Local screenshots, test downloads and JSON reports are in `.codex/lab-review/` and are not
  committed. `scripts/lab-mobile-check.mjs` checks all twelve routes in 390px Chromium and WebKit.
  The final 24-route pass reports no page errors, horizontal overflow, undersized input text or
  undersized buttons. Long native WebKit select options previously enlarged the document despite
  fitting controls; `overflow: hidden` on the select fixes that specific failure. It was reproduced
  at 418px and measured at 390px after the correction.

## Deliberate first-version limits

The pitch scopes were narrowed to one meaningful job each. Black Box accepts the documented
interchange format; vendor-specific log adapters remain future work. Same Page exchanges files
instead of hosting rooms. Prove It has five authored cases. Code Atlas measures file size and
line count, not dependency or Git history. Pocket Redact produces raster documents rather than
preserving searchable PDFs. Clear Day changes a local proposed copy, not a connected calendar.
Resonance saves patches, not audio recordings. Each tool states its boundary on its page.
