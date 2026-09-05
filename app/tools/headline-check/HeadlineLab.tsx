"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { headlineLabCopy as copy } from "@/content/tool-workbench";
import { checkHtml } from "@/lib/headline";
import { fixSnippet, headlineCopy, VERDICTS } from "./state";

const clean = `<h1>${copy.sample}</h1>`;
const broken = `<h1>${[...copy.sample].map(c => c === " " ? " " : `<span>${c}</span>`).join("")}</h1>`;

export default function HeadlineLab() {
  const [html, setHtml] = useState(broken);
  const deferred = useDeferredValue(html);
  const result = useMemo(() => deferred.trim() && deferred.length <= 100_000 ? checkHtml(deferred) : null, [deferred]);
  return <section className="headline-lab">
    <h2>{copy.heading}</h2>
    <p className="bench-note">{copy.intro}</p>
    <div className="bench-actions">
      <button type="button" className="bench-button" onClick={() => setHtml(broken)}>{copy.broken}</button>
      <button type="button" className="bench-button" onClick={() => setHtml(clean)}>{copy.clean}</button>
    </div>
    <label className="bench-label" htmlFor="headline-source">{copy.label}</label>
    <textarea id="headline-source" className="bench-input headline-lab__source" rows={4} spellCheck={false} value={html} onChange={e => setHtml(e.target.value)} aria-describedby="headline-limit" />
    <p className="bench-note" id="headline-limit">{html.length > 100_000 ? copy.tooLarge : copy.limit}</p>
    <p className="headline-lab__verdict" role="status">{result ? VERDICTS[result.verdict].title : copy.waiting}</p>
    {result && <>
      <div className="hcheck__views">
        <div className="hcheck__view"><h3 className="hcheck__view-title">{copy.browser}</h3><p className="hcheck__string">{result.browserText || "∅"}</p></div>
        <div className="hcheck__view is-crawler"><h3 className="hcheck__view-title">{copy.crawler}</h3><p className="hcheck__string">{result.crawlerText || "∅"}</p></div>
      </div>
      <p className="bench-note">{VERDICTS[result.verdict].body}</p>
      {result.verdict !== "clean" && <div className="headline-lab__fix">
        <h3>{headlineCopy.fixTitle}</h3>
        <p className="bench-note">{headlineCopy.fixLead}</p>
        <pre className="hcheck__code"><code>{fixSnippet(result.browserText)}</code></pre>
        <button type="button" className="bench-button" onClick={() => setHtml(fixSnippet(result.browserText))}>{copy.clean}</button>
      </div>}
    </>}
  </section>;
}
