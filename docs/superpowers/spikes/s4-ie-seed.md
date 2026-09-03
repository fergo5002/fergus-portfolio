# S4 The .ie seed: decision record

- Date run: 2026-09-03, by Claude (Fable 5.1) on Fergus's home machine, worktree `C:\Dev\fergus-portfolio-toolshed-f5-spikes`, branch `toolshed/f5-spikes`, commit 8b82c3b (base)
- Preview deployment(s): none. S4 deploys nothing.
- Hours spent: about 1.2 (wall clock 16:15 to 17:10 UTC with S3 interleaved; roughly 0.7 on S4 itself) of 3
- Record opened, before any run: 2026-09-03 16:15 UTC

## Question
How many `.ie` hosts and registered domains does Common Crawl's `cc-main-2026-jun-jul-aug` host graph hold, and how many bytes and minutes does it take to pull only that block from the home machine?

## Prediction (copied verbatim from the brief before running)
The `ie.` block is contiguous and sits in one or two of the 48 vertex part files, so the run downloads under 100 MB (two parts at about 36 MB each, plus a few kilobytes of heads) and finishes in under 10 minutes on the home connection, most of it waiting on Common Crawl's server. It finds 400,000 to 900,000 hosts, collapsing to 150,000 to 250,000 registered domains, which is 45 to 75% of the roughly 330,000 domains the registry reported in 2022. The Public Suffix List names `gov.ie` as the only second-level zone under `.ie`. **Falsified by:** the block spanning three or more parts or not being contiguous (the sort order is not what the docs say, or the parts are not sorted globally); under 50,000 registered domains (the graph does not cover `.ie` the way assumed, or the filter is wrong, and the first and last hosts printed will say which); over an hour or over 1 GB downloaded (range requests not honoured, so the heads pulled whole files); or a second-level zone beyond `gov.ie` in the PSL.

## What ran

Everything on the home machine, Node v24.16.0, no npm packages. One departure from the brief's header: both S3 and S4 ran in the single worktree `C:\Dev\fergus-portfolio-toolshed-f5-spikes` on branch `toolshed/f5-spikes` (the coordinator's instruction), not a `toolshed/s4-ie-seed` worktree. Nothing deploys, so nothing turns on that.

1. `mkdir -p scripts/census data/census .spike`; `.spike/` and `data/` added to `.git/info/exclude` (which for a worktree lives at `C:\Dev\fergus-portfolio\.git\worktrees\fergus-portfolio-toolshed-f5-spikes\info\exclude`).
2. `scripts/census/seed-ie.mjs` extracted from the brief's fenced block by line range rather than retyped. `node --check` clean.
3. The URLs, as used, unchanged from the brief. Listing `https://data.commoncrawl.org/projects/hyperlinkgraph/cc-main-2026-jun-jul-aug/host/cc-main-2026-jun-jul-aug-host-vertices.paths.gz` answered 200, 264 bytes, `Accept-Ranges: bytes`, via CloudFront (pop DUB56). Parts are `projects/hyperlinkgraph/cc-main-2026-jun-jul-aug/host/vertices/part-000NN-5bcdba52-b13e-4367-96fe-8f5d03da0f2f-c000.txt.gz`, 48 of them.
4. Run 0, the verbatim script, 16:15:24 to 16:15:43 UTC: found the block, streamed part 34 to the end of the block, then died with `DOMException [AbortError]` emitted as an unhandled `'error'` on the readline Interface. Exit 1, 19.2 s, no output file. Log kept in `.spike/run1-original-crash.log`.
5. Diagnosis, rung **fixed**. Mechanism: after the block, `controller.abort()` destroys the fetch body, `pipeline` destroys `gunzip` with the AbortError, readline re-emits that on the Interface, and the `for await` loop has already `break`-ed so nothing is listening and Node throws. Fix: an `error` listener on `gunzip` and on `lines` that swallows only when `stopped` is true (seven lines, commented in the script). Revert test: the original, kept as `.spike/seed-ie.original.mjs`, re-run at 16:17:21 crashed the same way (exit 1, 7.9 s), so the crash is reproduced; the patched script at 16:17:29 completed with exit 0.
6. Run 1 (patched): `time node scripts/census/seed-ie.mjs | tee data/census/seed-ie-run.log`, 16:17:29 to 16:17:38 UTC.
7. The brief's step 3 and step 4 commands on the output, plus three checks the brief did not have: which PSL section each `.ie` suffix sits in, DNS on `tighsauna.ie` and `rte.ie`, and two alternative collapses (ICANN section only; distinct second-level names).
8. Step 6, the registry figure: `https://www.weare.ie/` homepage widget, `https://www.weare.ie/ie-domain-profile-report/` (latest PDF there is the 2024 report), and `https://www.weare.ie/wp-content/uploads/2026/01/ie-Domain-Snapshot-2025.pdf`, which is image-only (pdftotext returned 2 bytes) and was read visually.
9. Run 2: `time node scripts/census/seed-ie.mjs`, 17:06:06 to 17:06:39 UTC, 49 minutes after run 1 rather than the brief's hour, run in the foreground once the coordinator asked me not to hold for a timer. Same script, same corpus, same commands on the output.

## Measurements

| Name | Value | Where read | When (UTC) | Rung |
|---|---|---|---|---|
| Parts inspected by head | 6 (parts 23, 35, 29, 32, 33, 34), first hosts `com.playaoba.www`, `io.vsassets.gallerycdn.mramericanmike`, `com.woodsidecourtapts`, `de.wbh-online.www`, `energy.auction`, `green.helleniq`; both searches hit the same six, the head cache served the second | run log `head NN` lines | 16:17 | reproduced (same six in run 0 and run 1) |
| Parts streamed, block span | 1 part, `part-00034`; block bounded by heads `green.helleniq` (34) and `io.vsassets…` (35) | report `partsStreamed` | 16:17 | reproduced (run 0 and run 1) |
| Bytes, heads only | 393,480 (6 × 65,536 + 264 listing) | report `headBytes` | 16:17 | observed |
| Bytes, total compressed, run 1 | 17,417,456 | report `bytesDownloaded` | 16:17 | observed |
| HTTP requests, waits | 9 (1 listing, 6 heads, 1 PSL, 1 stream); no 429 or 503 | report `requests`, run log | 16:17 | observed |
| Lines scanned | 2,220,544 in part 34, `stoppedEarly: true` | report `linesScanned` | 16:17 | observed |
| `.ie` hosts | 197,877 | report `hosts` | 16:17 | reproduced (run 2 identical) |
| Registered domains, PSL collapse as the brief specified | 126,214 (`wc -l` 126214) | report, `wc -l` | 16:17 | reproduced (run 2 identical) |
| File size | 2,028,492 bytes | `ls -l` | 16:17 | observed |
| Second-level zones, source | `gov.ie` (PSL line 1428, ICANN section) and `myspreadshop.ie` (PSL line 15844, PRIVATE section); `zonesSource: publicsuffix.org` | report; PSL fetched separately | 16:19 | observed |
| Label-count distribution | 125,286 at 2 labels; 928 at 3 (218 `*.gov.ie` + 710 `*.myspreadshop.ie`); none at 4 or more | `awk` line | 16:18 | observed |
| First and last host | `00.ie`, `www.zyra.ie` | report | 16:17 | observed |
| Instrument, `rte.ie` | present (1); resolves in DNS | `grep -c`, `nslookup` | 16:18 | observed |
| Instrument, `tighsauna.ie` | absent (0); `nslookup` says NXDOMAIN, so the name does not exist and its absence says nothing about the filter (`tighsauna.com` resolves) | `grep -c`, `nslookup` | 16:19 | observed |
| Punycode domains | 119 (`xn--`) | `grep -c` | 16:22 | observed |
| ICANN-section-only collapse | 125,505 (`myspreadshop.ie` counted as one registration) | `awk`, `sort -u` | 16:22 | observed |
| Distinct second-level names | 125,288 (125,286 + `gov.ie` + `myspreadshop.ie`) | `awk`, `sort -u` | 16:22 | observed |
| Wall clock, run 1 | 8,273 ms in-script; `time` real 8.711 s | report `wallMs`, `time` | 16:17 | observed |
| Wall clock, run 2 | 32,253 ms in-script; `time` real 32.730 s; the streamed part alone 29,365 ms against 5,232 ms in run 1 | report `wallMs`, `time`, run log | 17:06 | observed |
| Bytes, run 2 | 17,475,608 (58,152 more than run 1; the heads were identical at 393,480, so the abort after the block landed on a different chunk boundary of the stream) | report `bytesDownloaded` | 17:06 | observed |
| Counts, run 2 | hosts 197,877; registered domains 126,214; lines scanned 2,220,544; first `00.ie`, last `www.zyra.ie`; file 2,028,492 bytes; labels 125,286 at 2 and 928 at 3; `rte.ie` present. Every one identical to run 1 | report, `wc -l`, `ls -l`, `awk`, `grep` | 17:06 | reproduced |
| Coverage of 330,000 | 0.382 | report `coverageOf2022Registry` | 16:17 | observed |
| Registry figures, dated | 326,562 at end of 2024 (the 2024 Domain Profile Report, published 2025-02); "333k, up 2%" total database at end of 2025 (Snapshot 2025 infographic, published 2026-01, rounded on the page); 349,615 on the homepage widget labelled ".ie Domains registered Total", no date on the page, read 2026-09-03 16:16 UTC | weare.ie pages and the PDF | 16:16 to 16:21 | observed |
| Coverage against those | 0.386 of 326,562; 0.379 of 333,000; 0.361 of 349,615 (all on 126,214; on 125,505 they are 0.384, 0.377, 0.359) | arithmetic | 16:22 | observed |
| Crash on the unpatched script | run 0 exit 1 at 16:15, re-run exit 1 at 16:17; patched exit 0 at 16:17 | logs | 16:15 to 16:17 | fixed (revert restores it) |

## Result against the prediction

**Partly falsified.** Confirmed: the block is contiguous and sits in one part (34), the run pulled 17.4 MB against a predicted ceiling of 100 MB, and it took 8.3 s (32.3 s on the second run) against a ceiling of 10 minutes. Falsified: 197,877 hosts against a predicted 400,000 to 900,000, and 126,214 registered domains against a predicted 150,000 to 250,000, so coverage of the 330,000 figure is 38%, under the predicted 45 to 75%. The PSL clause is also falsified as written: the list carries a second `.ie` suffix, `myspreadshop.ie`, but in the PRIVATE section, which the brief's parser did not distinguish. None of the brief's named falsifiers fired (one part, 126,214 is above 50,000, 8 s and 17 MB are nowhere near an hour or 1 GB), so the corpus is what was assumed, only about half the size the prediction gave it. The run-0 crash was not in the prediction at all: it is a bug in the brief's script on the abort path, now fixed and confirmed by revert.

## Decision

Rule applied: **50,000 to 150,000 registered domains** (126,214, at the upper end of the band, 76% of the way from 50,000 to 150,000). So for Irish Stack Census (T6): the host graph is still the seed because nothing free is bigger, the T6 spec adds a union across months (each new graph adds hosts the last one missed, and a domain stays in the seed until it fails DNS twice), and the census page prints coverage as a headline figure with the registry number beside it.

Three things for T6's spec that the run settled:

1. **Collapse on the ICANN section only.** The PRIVATE section of the PSL exists for cookie scoping. `myspreadshop.ie` is one registered name hosting 710 Spreadshirt shops, and counting it as 710 registrations inflates the seed and the coverage claim. With that change the seed is 125,505 domains. `gov.ie` stays a zone (ICANN section, and the 218 names under it are separate sites).
2. **State coverage against the registry's dated figure.** 125,505 of 333,000 at end of 2025 is 37.7%; of 326,562 at end of 2024 it is 38.4%. The 330,000 figure the brief carried is not dated on weare.ie; use the Snapshot figure and its date.
3. **Budget.** Under 20 MB and under a minute per re-seed on the home connection (run 1: 17.4 MB, 8.3 s; run 2: 17.5 MB, 32.3 s; the bytes agree to 0.3% and the time is whatever Common Crawl's CDN gives on the day). Monthly, the day the new graph lands, on the home machine's scheduler, as the rule says. The kept script must carry the abort-path fix or the scheduler will see exit 1 every month.

Also: replace `tighsauna.ie` in the instrument check with a name that exists; `rte.ie` did the job here.

## Not verified

- Why run 2 took four times as long as run 1 for the same bytes (32.3 s against 8.3 s). Almost all of the gap is inside the single streamed part (29.4 s against 5.2 s), which points at CloudFront or Common Crawl throughput at the time rather than the script, but that is a guess; nothing on the local side was measured and two readings do not make a distribution.
- The origin of "330,000 in 2022": weare.ie says "over 330,000" undated on its homepage; I did not find a dated 2022 statement of it. The dated figures used instead are 326,562 (end 2024) and 333k (end 2025, rounded on an infographic; the exact number is not on the page).
- What the homepage widget's 349,615 counts. Its label is ".ie Domains registered Total" and it sits beside "46,877 registered This Year", which is more than the whole of 2024's 46,180 new registrations; it may be gross registrations rather than the live database. Not resolved.
- Whether every host in the block is a live, registered domain. The graph is built from link targets as well as crawled pages, so some names may be dangling. No DNS was run on the output; T6's "fails DNS twice" rule is where that gets handled.
- Coverage by industry bucket. Not attempted; that is T6's spot check.
- Global sort order across all 48 parts. Checked only through the six heads read and the block's own first and last host; the block being contiguous inside part 34 is consistent with a global sort but is not a proof of it.
- The month-to-month stability of the count. One crawl only.

## Meters moved

None. S4 runs on the home machine and touches no Vercel function, so Provisioned Memory, Active CPU and invocations are unaffected by design. Not read.
