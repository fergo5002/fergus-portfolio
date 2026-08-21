# The monthly run protocol

Follow this exactly. The point of the harness is that two runs a month apart are comparable,
and the only thing that makes them comparable is that the procedure did not change between
them. If you improvise a step, write down what you did in the run notes, because an
undocumented change to the method reads later as a change in the site.

Runs on the first working day of the month. It takes about an hour by hand.

---

## 0. Before you start

Open `questions.json`. Do not edit it. If a question no longer makes sense, add a replacement
with a new id and leave the old one in place, because a stored run refers to ids and rewording
a question rewrites every run that already answered it.

Have a scratch file open. You are filling in one row per question per surface, and the shape
of a row is in `record.mjs` at the top.

---

## 1. Prove the instrument first

This step is not optional and it comes before any question.

Take each string in `questions.json` → `probes.strings` and ask the surface for it verbatim,
in quotes. Each one is a phrase from the site that exists nowhere else on the web.

- **The domain comes back on at least one probe** → the surface can reach the site. Record
  `verdict: "clear"` and continue.
- **The domain comes back on none of them** → the surface cannot retrieve the site at all.
  Record `verdict: "index-absent"`, run the questions anyway (the competing domains are still
  worth having), and know that every zero in that surface means "cannot see it", not "did not
  choose it".
- **The surface errors, refuses, or answers something unrelated to what you asked on more
  than one probe** → `verdict: "degraded"`. A measurement taken through a degraded instrument
  is not evidence, so note what happened and treat the whole surface as unreadable for that run.

Write what the probes actually returned into the surface `notes`. Some surfaces ignore quotes
and the `site:` operator entirely and will answer the topic of the phrase instead of looking
for the phrase. That behaviour is itself a limit on the probe and it belongs in the notes.

---

## 2. The surfaces

Five, in this order. Use the canonical keys from `questions.json` → `surfaces`.

| Key | What to open | Notes |
|---|---|---|
| `chatgpt` | chatgpt.com, web search on | Use a temporary chat |
| `perplexity` | perplexity.ai | Default model, not a focus mode |
| `google-ai-overviews` | google.com, read the AI Overview panel only | If no panel appears, that is `refused`, not zero |
| `google-ai-mode` | google.com AI Mode tab | Separate surface from the Overview panel, do not merge them |
| `claude-search` | claude.ai with web search on | See the note below if running this from Claude Code |

**A surface you cannot reach is `missing`, never zero.** No account, region not served, feature
not rolled out, tool refuses: all `missing`, with a `reason`. `record.mjs` refuses to store rows
for a surface marked missing, deliberately, because a zero and an absence average very
differently and only one of them is a fact about the site.

**`claude-search` from Claude Code is a different surface from claude.ai and must be noted as
such.** The `WebSearch` tool is a search backend reached by an agent. It is the closest thing an
automated session has to a live answer engine, and it is not the consumer product. If a run uses
it, say so in the surface notes. Do not silently file it as claude.ai.

---

## 3. Asking

- **Fresh session per question.** New chat, new tab, no follow-ups. A second question in the
  same thread is answered with the first one still in context and that is not the query you
  meant to measure.
- **No personalisation.** Logged out where the surface allows it. Where it does not, use an
  account with memory and personalisation off, and say which in the run notes.
- **Verbatim.** Copy the question text exactly. No rephrasing, no adding "in Ireland", no
  helpful context. The wording is part of the instrument.
- **Once each.** These engines are non-deterministic, so a second ask is a second sample and
  not a better answer. If you want to know how noisy a question is, run the whole set twice on
  the same day and store it as two runs.
- **Same region, same day.** Note the region in the run notes. Results move with it.

---

## 4. What counts

Three separate things, and keeping them separate is most of the value here.

**Cited** (`cited: true`). `fergusoreilly.dev` appears as a **linked source**: in the citation
list, in a footnote chip, in a source panel, or as a link in the answer body. The URL goes in
`citingUrls`. A citation with no URL is not a citation, and `record.mjs` will reject the row,
which is on purpose: it is the guard against a claim with nothing behind it.

**Mentioned** (`mentioned: true`). The answer says "Fergus O'Reilly", "Tigh Sauna" or
"Presterly" in prose with **no link**. Worth strictly less than a citation and worth recording,
because a model repeating the entity without a source is usually what happens on the way to
citing it. Set both flags when the answer both names him and links him.

**Competing domains** (`competingDomains`). Bare hostnames of everything the answer *did* cite,
lowercase, no `www.`, no path. Cap it at the first ten. This is the field that tells you who
actually owns each question, and after three runs it is the most useful column in the file.

Everything else goes in `notes`, in one plain sentence.

### Outcomes

| `outcome` | When |
|---|---|
| `answered` | The surface answered the question. The normal case. |
| `refused` | It declined, gave a safety response, said it could not help, or Google showed no AI Overview. Set `cited` and `mentioned` to `false` and say what it did. |
| `error` | Rate limit, timeout, blank response, crash. Not a zero. It is a hole in the run and the report counts it separately. |

A `refused` and an `error` are both excluded from the share-of-model denominator. Only
`answered` rows count, because a question that was never answered cannot have chosen a source.

**"I could not find anything about that" is `answered`, not `refused`.** It came up four times
on the first run and the distinction matters. The surface searched, retrieved sources, and
concluded the entity was not there. That is a real observation about visibility and it belongs
in the denominator. A `refused` is the surface declining to engage at all. If it ends by asking
you for more context, that is a follow-up offer and not a refusal, so do not take the offer:
one question, one session.

### The named-entity trap

Watch for a citation about a **different** Fergus O'Reilly. There is at least one other in
software, with a long career and a Crunchbase profile, who also studied at Trinity College
Dublin. Observed dominating the entity band on 2026-08-21. A source about him is not a
citation of this site: `cited` is about the domain, so if the link is not `fergusoreilly.dev`
it is a competing domain, and put the collision in the notes.

---

## 5. Storing it

Write the run to a scratch JSON file in the shape `record.mjs` documents, then:

```bash
node scripts/share-of-model/record.mjs path/to/scratch-run.json
```

It validates and writes `results/YYYY-MM-DD.json`. It refuses malformed runs and refuses to
overwrite an existing file for that date without `--force`. Read the errors rather than
reaching for `--force`: every one of them is a shape that would have quietly corrupted the
trend.

Then read the report:

```bash
node scripts/share-of-model/report.mjs
```

---

## 6. Before you call it done

- Every surface has either `rows` or a `reason`. Nothing has both and nothing has neither.
- The control band is zero. If it is not, the run is void: say so in the run notes and do not
  quote a share-of-model number off it.
- The instrument verdict is written down for every surface you ran.
- The run notes say the region, the date, whether accounts were logged in, and anything you
  did differently from this file.

Then say what you did **not** check. A run covers the surfaces you reached, on one day, in one
region, with one sample per question. That is the claim. Anything beyond it is a story.
