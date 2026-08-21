"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { headlineCheckAction } from "./actions";
import {
  ARTICLE_PATH,
  INITIAL_TOOL_STATE,
  MAX_URL_LENGTH,
  URL_FIELD,
  VERDICTS,
  fixSnippet,
  headlineCopy,
} from "./state";

/**
 * The tool itself.
 *
 * **It works with JavaScript switched off**, the same way `/contact` does and
 * for the same reason: a real `<form>` posting to a server action, enhanced by
 * `useActionState` rather than dependent on it. With no JavaScript the browser
 * posts natively, React runs the action on the server, and the page comes back
 * rendered with the result and the URL still in the field.
 *
 * `key={state.seq}` on the input is what survives React's post-action form
 * reset. Without it a visitor who mistypes a URL gets an error message and an
 * empty box, which is the site telling somebody off and then taking their work
 * away.
 *
 * **Nothing here can fail quietly.** Every state the action can return has a
 * panel, every panel says what actually went wrong, and the copy button is
 * rendered only once `navigator.clipboard.writeText` is known to exist. A
 * control that can do nothing must not be on screen: that rule was written on
 * this site after a `mailto:` button that opened nothing at all.
 */
export default function HeadlineForm() {
  const [state, action, pending] = useActionState(headlineCheckAction, INITIAL_TOOL_STATE);
  const uid = useId();
  const { audio } = useSystem();

  const [canCopy, setCanCopy] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    setCanCopy(typeof navigator !== "undefined" && !!navigator.clipboard?.writeText);
  }, []);

  useEffect(() => {
    setCopy("idle");
  }, [state]);

  const id = `${uid}-url`;
  const errorId = `${id}-error`;
  const invalid = state.status === "invalid";
  const typed = "url" in state ? state.url : "";

  /**
   * The membrane click, filtered exactly as the shell filters it. Silent until
   * a visitor has switched sound on themselves, so nobody gets noise they did
   * not ask for.
   */
  const onKey = (e: KeyboardEvent) => {
    if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Tab") {
      audio.key();
    }
  };

  const snippet = state.status === "done" ? fixSnippet(state.report.browserText) : "";

  const onCopy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="hcheck">
      <form className="hcheck__form" action={action}>
        <label className="hcheck__label" htmlFor={id}>
          {headlineCopy.label}
        </label>
        <div className="hcheck__field">
          <input
            // See the docblock: this is what keeps the URL in the box after the
            // action resolves and React resets the form.
            key={`${URL_FIELD}-${state.seq}`}
            id={id}
            name={URL_FIELD}
            // Deliberately `text` rather than `url`. A `url` input refuses
            // `example.com` without a scheme, and typing a bare hostname is what
            // everybody actually does. The scheme is added on the server, where
            // it can also be refused.
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            className="hcheck__input"
            placeholder={headlineCopy.placeholder}
            defaultValue={typed}
            maxLength={MAX_URL_LENGTH}
            required
            onKeyDown={onKey}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
          />
          {/* The arrow and the working dots are drawn by CSS `content` in
              globals.css, deliberately. A decorative glyph written into the
              document is a real text node, so it lands in every extraction of
              this page, and `aria-hidden` does not help: it is an accessibility
              property and a text extractor has no reason to read it. That is the
              same mistake as the split hero name, one character wide. */}
          <button type="submit" className="hcheck__submit" disabled={pending}>
            {pending ? headlineCopy.checking : headlineCopy.submit}
          </button>
        </div>
        {invalid && (
          <p className="hcheck__error" id={errorId} role="alert">
            {state.message}
          </p>
        )}
      </form>

      {/* Left in the DOM when empty, because it is the live region: one that is
          inserted at the same moment as its content is not reliably announced. */}
      <div className="hcheck__result" role="status" aria-live="polite">
        {state.status === "limited" && (
          <div className="hcheck__panel is-warn">
            <p className="hcheck__panel-title">Slow down a moment</p>
            <p className="hcheck__panel-body">{state.message}</p>
          </div>
        )}

        {state.status === "failed" && (
          <div className="hcheck__panel is-failed">
            <p className="hcheck__panel-title">Could not read that page</p>
            <p className="hcheck__panel-body">{state.message}</p>
            <p className="hcheck__panel-body">
              Checked: <span className="hcheck__url">{state.url}</span>
            </p>
          </div>
        )}

        {state.status === "done" && (
          <div className="hcheck__report">
            <p className="hcheck__checked">
              <span className="hcheck__checked-k">Read</span>
              <span className="hcheck__url">{state.finalUrl}</span>
              {state.redirects > 0 && (
                <span className="hcheck__hops">
                  {" "}
                  after {state.redirects} redirect{state.redirects === 1 ? "" : "s"}
                </span>
              )}
            </p>

            <div className={`hcheck__verdict is-${state.report.verdict}`}>
              <p className="hcheck__verdict-title">{VERDICTS[state.report.verdict].title}</p>
              <p className="hcheck__panel-body">{VERDICTS[state.report.verdict].body}</p>
            </div>

            <div className="hcheck__views">
              <section className="hcheck__view">
                <h2 className="hcheck__view-title">{headlineCopy.browserLabel}</h2>
                <p className="hcheck__string">
                  {state.report.browserText || <em className="hcheck__empty">nothing at all</em>}
                </p>
              </section>
              <section className="hcheck__view is-crawler">
                <h2 className="hcheck__view-title">{headlineCopy.crawlerLabel}</h2>
                <p className="hcheck__string">
                  {state.report.crawlerText || <em className="hcheck__empty">nothing at all</em>}
                </p>
              </section>
            </div>

            <dl className="hcheck__evidence">
              <div className="hcheck__stat">
                <dt>Heading read</dt>
                <dd>{state.report.tag ?? "none found"}</dd>
              </div>
              <div className="hcheck__stat">
                <dt>Child elements</dt>
                <dd>{state.report.childElements}</dd>
              </div>
              <div className="hcheck__stat">
                <dt>Single-character elements</dt>
                <dd>{state.report.characterElements}</dd>
              </div>
            </dl>

            {state.report.verdict === "fragmented" && (
              <section className="hcheck__fix">
                <h2 className="hcheck__view-title">{headlineCopy.fixTitle}</h2>
                <p className="hcheck__panel-body">{headlineCopy.fixLead}</p>
                <pre className="hcheck__code">
                  <code>{snippet}</code>
                </pre>
                <p className="hcheck__panel-body">{headlineCopy.fixNote}</p>
                <p className="hcheck__actions">
                  <Link className="hcheck__alt" href={ARTICLE_PATH}>
                    {headlineCopy.readMore}
                  </Link>
                  {/* Rendered only once the API it needs is known to be there. */}
                  {canCopy && (
                    <button type="button" className="hcheck__alt" onClick={onCopy}>
                      {copy === "done" ? headlineCopy.fixCopied : headlineCopy.fixCopy}
                    </button>
                  )}
                </p>
                {copy === "failed" && (
                  <p className="hcheck__panel-body">{headlineCopy.fixCopyFailed}</p>
                )}
              </section>
            )}

            <p className="hcheck__limits">{headlineCopy.limits}</p>
          </div>
        )}
      </div>
    </div>
  );
}
