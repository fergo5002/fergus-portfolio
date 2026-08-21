# Share of model

Share of voice, for answer engines. When somebody asks ChatGPT, Perplexity, Google or Claude a
question this site should be the answer to, how often does `fergusoreilly.dev` come back as a
cited source?

It runs once a month by hand, takes about an hour, and stores one JSON file per run. The reason
it exists is that everything else about AI-search visibility is a feeling. Three months of these
files is a before and after.

## Use it

```bash
node scripts/share-of-model/record.mjs path/to/run.json   # validate and store a completed run
node scripts/share-of-model/report.mjs                    # read everything stored so far
node scripts/share-of-model/report.mjs --surface chatgpt  # one surface only
```

No dependencies. Plain Node, plain JSON, plain text out.

| File | What it is |
|---|---|
| `questions.json` | The frozen question set, 24 questions in 4 bands, plus the surface list and the instrument probes. Versioned. Do not edit questions in place. |
| `run.md` | The protocol. Follow it exactly, every month. |
| `record.mjs` | Validates a run and writes `results/YYYY-MM-DD.json`. Refuses malformed runs. |
| `report.mjs` | Reads every run and prints the report. |
| `results/` | One file per run. Append-only in spirit. |

## What it measures

**Share of model** is cited answers over answered questions. A citation means the domain appeared
as a **linked source**. The name appearing in prose with no link is recorded separately as a
**mention**, because it is worth less and because it usually comes first.

Four bands, and the bands are the design:

- **Entity** — questions about him and his ventures by name. He should already win these.
- **Topic** — questions the eight published articles genuinely answer, derived from the article
  set rather than invented. This is the band the writing exists to move.
- **Competitive** — questions where he is one plausible source among many. A citation here is a
  real result. No citation here is normal.
- **Control** — questions he should **not** win, deliberately included. If a run shows him in the
  control band, the run is broken and none of the other numbers can be read. A run that shows him
  everywhere is a fault, not a triumph, and the control band is the only thing that makes the
  difference visible.

Refusals and errors are excluded from the denominator. A question that was never answered cannot
have chosen a source, so counting it as a miss would turn a rate-limited afternoon into a drop in
visibility.

---

## What it cannot see

Read this before quoting any number out of it. This section is the reason the harness is
trustworthy, and skipping it is how the numbers get misused.

**A single run is a sample, not a measurement.** These engines are non-deterministic. The same
question asked twice, ten minutes apart, from the same machine, can cite different sources. So a
number from one run has an error bar around it that nobody knows the size of, and a month-on-month
move of a few points is indistinguishable from noise. The report refuses to draw a trend through
one point, and it prints a warning under any surface with fewer than five answered questions, but
neither of those makes a single run into evidence. Three or four runs before a direction means
anything.

**Absence of a citation is not absence of visibility.** A miss can mean the surface never saw the
site, or saw it and preferred something else, or answered from parameters without searching at
all. Those are three completely different problems with three different fixes and this instrument
cannot tell them apart. The probe step narrows it: a surface that cannot return the domain for a
string that exists nowhere else on the web is a surface that cannot reach the site, and that run
is stored as `index-absent` so its zeros are not read as rejection. Everything past that
distinction is inference.

**Results vary by region and by account.** These surfaces personalise. The same question from
Dublin and from Ohio, or from a logged-in account with memory on and a fresh browser, will not
give the same answer. The protocol pins the region and demands personalisation off, so runs are
comparable **with each other**. It does not make them representative of what any particular
person sees. The first baseline was taken through a US-only search backend, which is the wrong
region for this site's actual audience, and that is recorded in the run notes rather than
smoothed over.

**The control band only works when something else is non-zero.** It catches a surface that cites
him everywhere. It cannot catch a surface that cannot see the domain at all, because on an
all-zero run a clean control band and a blind surface produce identical output. That is why the
probes in `questions.json` exist and why they run first. The control band and the probes are two
halves of one check and neither is sufficient alone.

**Five surfaces are not the market, and one of them is not what it claims to be.** There are more
answer engines than these five, weighted differently by audience, and none of the five publishes
how it picks sources. `claude-search` in an automated run means the Claude Code `WebSearch` tool,
which is a search backend reached by an agent and is **not** claude.ai with web search on. The
protocol requires that to be said in the run notes. Do not let the two blur together, because
they are different products with different retrieval.

**Citations are not traffic and traffic is not work.** Being cited is being named. Whether anyone
clicks, and whether the ones who click are the founders, investors and employers this site is
written for, is not in this file and cannot be got from it. Search Console and Vercel Analytics
are where that lives. Nothing here should be quoted as an outcome.

**The instrument measures the question set, not the internet.** Twenty-four fixed questions,
chosen in August 2026 by reading the article set. If the site starts winning questions nobody
thought to write down, this harness will not notice, and it will keep reporting on questions that
may stop mattering. The set is frozen because a moving set makes the trend meaningless, and the
cost of freezing it is exactly that blind spot. Adding questions is fine; bump the version and
never reword or delete an existing id, because stored runs refer to ids and a rewritten question
silently rewrites history.

**A stored run says what happened, not why.** The competing-domains column shows who was cited
instead. It does not show why, and the obvious story is usually the untested one. On the first
run every entity question was taken by a different, established Fergus O'Reilly in software who
also studied at Trinity. That is an observation. That it is *the reason* this site is not cited is
a guess, and the thing that would test it is whether citations arrive once the domain is
retrievable at all.

---

## The baseline, 2026-08-21

Taken one day after the SEO and GEO foundation shipped, which is the point: it is the before.

Fifteen of the twenty-four questions were asked, on one surface. **Zero citations, zero
mentions.** The instrument verdict for that surface is `index-absent`, so those zeros mean the
backend could not retrieve the domain, not that it passed the site over. Four of the five surfaces
were unreachable from an automated session and are stored as `missing`, which the report never
counts as zero in either direction.

Two findings stand independently of the index question, and both are about names:

- **The entity band is taken by a different Fergus O'Reilly**, an established software
  professional with a Crunchbase profile, a thirty-year career, and a Trinity College Dublin
  computer science degree. The disambiguating detail on the site is the same detail he has.
- **"Tigh Sauna" collides with Tigh'N Alluis**, a sauna venue in the Dublin mountains with
  TripAdvisor and Visit Dublin coverage. Same word, same city, same market, different thing.

Both make the `Person` graph and its `sameAs` edges load-bearing rather than decorative.
