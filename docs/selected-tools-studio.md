# Five tool studios

Fergus's selected build-out, 6 September 2026. Deployed after local review through PR #19.
All five are live at [the tools board](https://fergusoreilly.dev/tools), with individual routes under `/tools/<slug>`.
Release status and deployment evidence live in `docs/PROGRESS.md`.

- **Atlas:** a physics graph of uploaded files, folders, ZIPs or a public GitHub repository. Every admitted file has a node. Readable formats get text extraction; other formats retain metadata. Connections identify containment, explicit references or shared terms. Search, inspect, focus, drag, pin, zoom and export.
- **Group Lore:** import a chat, filter by person/date/phrase, explore its weekly rhythm and read the messages behind a pattern. Export an aggregate portrait without message text or names by default.
- **Pocket Redact:** thumbnail navigation, zoom, selectable masks, undo/redo, PDF text search and candidate review. Export a newly rasterised PDF and reopen its exact bytes for inspection.
- **Prove It:** case library, evidence notebook, competing explanations, confidence history and a useful debrief. Authored cases, no claim of probabilistic diagnosis.
- **Resonance:** a playable sequencer with live note/tempo/timbre changes, pads, a performance surface, mute/solo, patch files and synthesised WAV export.

Implementation uses the existing ToolPage, colour system and single system animation clock. Physics uses d3-force with its internal timer stopped. Browser-only inputs are never sent to a server. GitHub import makes explicit requests to GitHub; no credentials are requested.

References: [D3 manual simulation ticks](https://d3js.org/d3-force/simulation), [GitHub tree limits](https://docs.github.com/en/rest/git/trees#get-a-tree), [OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext).

## Review

Run `npm run dev` for the public tools. For the complete local review hub, run `npm run lab`, or `npm run build` followed by `npm run lab:start`. Both lab commands use `http://127.0.0.1:3106/lab`. Branch: `codex/selected-tools-studio`, built on the twelve-MVP commit `f49cb41`. The lab remains gated by `FERGUSOS_LAB=1`, noindex and absent from the sitemap. Its five selected studios also have public registry entries and routes.

Atlas occupies Code Atlas's place in the lab. The old `/lab/code-atlas` link redirects to `/lab/atlas`. No public tool was removed. The seven other lab experiments remain available, and the hub features the five selected studios first.

## Useful things to try

| Studio | A useful review path |
| --- | --- |
| Atlas | Drop a mixed folder or ZIP, search a file, inspect the explanation on its connections, focus its neighbours, drag and pin it. Try fullscreen. Save and reopen the map. |
| Group Lore | Tap a time in the weekly activity grid, read its messages, filter a speaker and phrase, then export an anonymous portrait. |
| Pocket Redact | Try the invoice, find email-like text, apply the candidate, switch to Select / move, drag or resize the mask, undo, build a PDF and inspect its reopened pages. |
| Prove It | Open a case, record a prediction, buy an investigation, revise your explanation and confidence, then read the comparison table in the debrief. |
| Resonance | Start the sequence, edit steps while playing, drag a pendulum's pitch, use A/S/D/F pads, change timbre, play the XY surface and render the result to WAV. |

## Boundaries

- Atlas admits up to 1,000 files / 80 MB, retaining every admitted file as a node. ZIP expansion is bounded and not recursive. Text extraction caps each file at 150,000 characters and the map at 10 MB of extracted text. PDF extraction caps at 60 pages. Password-protected or unreadable documents retain a visible explanation and metadata. There is no OCR. Office files yield text, not reconstructed layouts; XLSX shows raw sheet values/shared strings, not evaluated formulas or cell relationships. Unknown formats retain metadata. Browser-supported uploaded media gets a local preview; media bytes are not embedded in saved maps.
- Public GitHub import reads a root repository, rejects truncated or over-limit trees and fetches at most 100 text files / 8 MB. Private repositories, branch URLs and authentication are outside this build. GitHub's own rate limits still apply.
- Group Lore uses browser-local time, and WhatsApp timestamps contain no timezone. Its pseudonym switch only changes speaker labels; the original messages may still contain names. Anonymous exports intentionally omit message text, names and phrases. Large archives render 50 visible messages at a time.
- Pocket Redact supports 20 pages / 40 MB with 12 MP per-page and 64 MP document raster limits. Text candidates cover full PDF text boxes, not automatically identified sensitive substrings. Scans require manual masks. New PDF output consists of freshly rasterised pages; its review panel reopens the exact output bytes. All original searchable text, forms and accessibility structure are lost. Visible unmasked information remains visible.
- Prove It has twelve authored cases. Scores and explanations are game mechanics, not real-world probabilities. The daily case uses the browser's calendar date. Progress stays in the current tool instance; downloaded reports preserve individual attempts.
- Resonance uses four synthesised voices, sixteen steps and a bounded Web Audio graph. Tempo, notes and effects can change live. Direct pads and pitch scrubbing are playable without starting the sequencer. Sound stops on navigation or tab hiding. WAV export renders eight bars of the current patch plus a three-second tail, using the same synthesiser and effects. It does not record improvised pad gestures.

## Verification evidence

- Final production build: **44 generated pages**, TypeScript valid and no build warnings. Lab routes return 404 without `FERGUSOS_LAB=1` and do not appear in the sitemap. The optimised review server runs on `127.0.0.1:3106`.
- Full repository suite: **2,582 passing tests**, three opt-in skips. The fifteen new engine tests cover graph references, ambiguity/bounds, chat import and privacy, combined evidence, mask history and geometry, musical patterns/patches and PCM encoding.
- `scripts/studio-check.mjs`: five desktop workflows, actual file downloads, audio context lifecycle, a two-page raster PDF round trip and 390px Chromium/WebKit layouts. No page errors in the first complete pass.
- `scripts/studio-boundaries.mjs`: mixed PDF/DOCX/PPTX/XLSX/HTML/image/binary import; no requests triggered by uploaded HTML; a 1,000-file map; rejected over-limit ZIP preserving the existing map; real `octocat/Hello-World` import; 25,000-message filtering; and black/white pixel checks on reopened redaction output.
- Development-browser measurements on this machine: 1,000-file import **935 ms**, 25,000-message chat **2,454 ms**, with only 50 message rows mounted. These are local observations, not device-independent performance guarantees.
- Local evidence is in `.codex/studio-review/`, including screenshots, exported files, `report.json` and `boundaries.json`. It is deliberately untracked.
- The strict phone instrument found and led to fixes for clickable label and slider sizes, closed disclosure layout and disabled-control legibility. It now accepts an explicit readiness selector and distinguishes text outside a scrolling panel from text present in the photograph. Its original numerical floors are unchanged. A new fixture verifies visible and clipped scroll-panel text; removing the correction makes the self-test fail on all three profiles, and the corrected instrument passes every existing planted-fault check.
- Final strict phone result: all five studios pass at 390px WebKit, 320px WebKit and throttled Chromium. Evidence: `phone-final.log` for the four studios that passed together, and `phone-atlas-final.log` for Atlas after its disabled-label correction. Final `report.json` covers all five production workflows and ten mobile route checks, all passing with no page errors. `boundaries.json` also covers cancellation during a deliberately delayed chat file read and an opaque PNG graph export. The hub and seven remaining MVP workflows pass in `.codex/lab-review/report.json`.

`npm run lab:check` runs the remaining MVP checks plus the studio checks. `npm run lab:studio-check` runs just the selected studios. `node scripts/studio-boundaries.mjs` exercises the wider import and export cases. The existing phone instrument can target the five lab routes against a production build.

For the strict audit: `node scripts/phone-check.mjs --base http://127.0.0.1:3106 --routes /lab/atlas,/lab/group-lore,/lab/prove-it,/lab/resonance,/lab/pocket-redact --ready-selector .studio --out .codex/studio-review/phone`.

New dependency: `d3-force` 3.0.0 (ISC), with its internal timer stopped and manual ticks on the existing system clock. Its small force/quadtree modules are used for graph layout; no graph framework, external embedding service or hosted inference was added. Existing `fflate`, `pdfjs-dist` and `pdf-lib` handle archives and PDFs.
