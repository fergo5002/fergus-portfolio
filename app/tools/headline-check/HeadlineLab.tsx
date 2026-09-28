"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { headlineLabCopy as copy } from "@/content/tool-workbench";
import { checkHtml } from "@/lib/headline";
import { fixSnippet, VERDICTS } from "./state";

const clean = `<h1>${copy.sample}</h1>`;
const broken = `<h1>${[...copy.sample].map(c => c === " " ? " " : `<span>${c}</span>`).join("")}</h1>`;

/**
 * The stage: the two readings of one heading, running on the split-letter
 * example from the first paint. `checkHtml` is pure, so the server renders the
 * same verdict the browser will, and the comparison is on screen with
 * JavaScript off. Pasted source is parsed as text by `lib/headline.ts`; nothing
 * in it is ever inserted as markup or run.
 */
export default function HeadlineLab() {
  const [html, setHtml] = useState(broken);
  const deferred = useDeferredValue(html);
  const result = useMemo(() => deferred.trim() && deferred.length <= 100_000 ? checkHtml(deferred) : null, [deferred]);
  return <section className="headline-lab" aria-label={copy.heading}>
    <div className="headline-lab__screen" data-verdict={result?.verdict ?? "waiting"}>
      <div className="headline-lab__top">
        <p className="headline-lab__verdict" role="status">{result ? VERDICTS[result.verdict].title : copy.waiting}</p>
        <div className="headline-lab__samples">
          <button type="button" className="bench-button" aria-pressed={html === broken} onClick={() => setHtml(broken)}>{copy.broken}</button>
          <button type="button" className="bench-button" aria-pressed={html === clean} onClick={() => setHtml(clean)}>{copy.clean}</button>
        </div>
      </div>
      {result && <div className="hcheck__views">
        <div className="hcheck__view"><h3 className="hcheck__view-title">{copy.browser}</h3><p className="hcheck__string">{result.browserText || "∅"}</p></div>
        <div className="hcheck__view is-crawler"><h3 className="hcheck__view-title">{copy.crawler}</h3><p className="hcheck__string">{result.crawlerText || "∅"}</p></div>
      </div>}
    </div>
    <div className="headline-lab__input">
      <label className="bench-label" htmlFor="headline-source">{copy.label}</label>
      <textarea id="headline-source" className="bench-input headline-lab__source" rows={3} spellCheck={false} value={html} onChange={e => setHtml(e.target.value)} aria-describedby="headline-limit" />
      <p className="bench-note" id="headline-limit">{html.length > 100_000 ? copy.tooLarge : copy.limit}</p>
    </div>
    {result && result.verdict !== "clean" && <div className="headline-lab__fix">
      <pre className="hcheck__code"><code>{fixSnippet(result.browserText)}</code></pre>
      <button type="button" className="bench-button" onClick={() => setHtml(fixSnippet(result.browserText))}>{copy.clean}</button>
    </div>}
  </section>;
}
