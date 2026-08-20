"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { contactAction } from "@/app/contact/actions";
import { contactCopy } from "@/content/contact";
import {
  CONTACT_LIMITS,
  ELAPSED_FIELD,
  EMPTY_FIELDS,
  HONEYPOT_FIELD,
  INITIAL_CONTACT_STATE,
  MESSAGE_MIN,
  messageBody,
  validateContact,
  type FieldErrors,
} from "@/lib/contact";

/**
 * The contact form.
 *
 * **It has to work with JavaScript switched off.** That is not a nicety here:
 * this page exists because the previous call to action was a `mailto:` link
 * that silently did nothing on most machines, and shipping a form that fails
 * the same way for a different reason would be the same bug wearing a hat. So
 * it is a real `<form>` posting to a server action, enhanced by
 * `useActionState` rather than dependent on it. With no JavaScript the browser
 * posts natively, React runs the action on the server, and the page comes back
 * rendered with the result and every field still filled.
 *
 * Three details carry that promise:
 *
 *  - **`key={state.seq}` on each input.** React resets a form after an action
 *    resolves, which would wipe a rejected submission. Re-keying on the answer
 *    counter remounts the inputs with the values the server echoed back, so a
 *    validation error never costs anyone their message. It also clears the form
 *    for free on success, because a successful state carries no fields.
 *  - **Nothing here is the only way out.** Every failure renders a `mailto:`
 *    that already contains the message, and a copy button beside it, because a
 *    `mailto:` is exactly the thing that cannot be relied upon.
 *  - **The copy button is rendered only once its API is known to exist.** A
 *    button that quietly does nothing is the bug being fixed.
 */
export default function ContactForm() {
  const [state, action, pending] = useActionState(contactAction, INITIAL_CONTACT_STATE);
  const uid = useId();

  const startedAt = useRef(0);
  const elapsed = useRef<HTMLInputElement>(null);
  const [canCopy, setCanCopy] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");

  /**
   * Errors found in the browser, or `null` when the server's answer is the
   * newest thing we have.
   *
   * Null rather than `{}` on purpose. It is what makes the server-rendered
   * markup and the first client render identical, which is the difference
   * between working without JavaScript and a hydration mismatch: on a no-JS
   * post there is no client validation at all, and the errors the page must
   * show are the ones the action returned.
   */
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  /** Fields the visitor has finished with, so we only nag about ones they left. */
  const engaged = useRef(new Set<string>());

  useEffect(() => {
    // Started once, at mount, and never restarted. Restarting it after each
    // answer would mean somebody who fixes a typo and immediately resubmits is
    // measured over a couple of seconds and classed as a script.
    startedAt.current = Date.now();
    setCanCopy(typeof navigator !== "undefined" && !!navigator.clipboard?.writeText);
  }, []);

  useEffect(() => {
    setCopy("idle");
    // A fresh answer from the server outranks whatever the browser last
    // thought. Any field it rejected is now one the visitor is being asked to
    // fix, so typing in it should clear the message as they go.
    setClientErrors(null);
    if (state.status === "invalid") {
      for (const key of Object.keys(state.errors)) engaged.current.add(key);
    }
  }, [state]);

  const echoed = "fields" in state ? state.fields : EMPTY_FIELDS;
  /** What is on screen: the browser's verdict if it has one, else the server's. */
  const errors: FieldErrors = clientErrors ?? (state.status === "invalid" ? state.errors : {});

  /**
   * Re-checks the form in the browser, using the same `validateContact` the
   * action uses rather than a second set of rules that agree today.
   *
   * Only fields the visitor has actually filled and left are reported. Snapping
   * "tell me who you are" onto a field somebody tabbed through on their way to
   * the message is nagging, not helping: emptiness is what submitting is for,
   * and this is here to catch a mistyped address early.
   */
  const recheck = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const result = validateContact({
      name: data.get("name"),
      email: data.get("email"),
      message: data.get("message"),
    });

    const next: FieldErrors = {};
    if (!result.ok) {
      for (const key of engaged.current) {
        const field = key as keyof FieldErrors;
        if (result.errors[field]) next[field] = result.errors[field];
      }
    }
    setClientErrors(next);
  };

  const onBlur = (event: React.FocusEvent<HTMLFormElement>) => {
    // React types `target` and `currentTarget` off a single generic, so the
    // form's own type lands on both. What actually bubbles to here is a field.
    const target = event.target as unknown as HTMLInputElement | HTMLTextAreaElement;
    if (!target.name || target.name === HONEYPOT_FIELD) return;
    if (target.value.trim()) engaged.current.add(target.name);
    else engaged.current.delete(target.name);
    recheck(event.currentTarget);
  };

  const onInput = (event: React.FormEvent<HTMLFormElement>) => {
    // Only once something is already wrong. Validating every keystroke from the
    // first character tells somebody their half-typed address is invalid, which
    // it obviously is.
    //
    // Keyed on what is actually on screen, not on `clientErrors` alone. After
    // the server rejects a submission `clientErrors` is null while its messages
    // are showing, and guarding on the null would leave a corrected field still
    // marked wrong until the visitor happened to click away.
    if (Object.keys(errors).length === 0) return;
    recheck(event.currentTarget);
  };

  /**
   * Stamps how long the visitor has been on the page, at submit.
   *
   * Deliberately fail-open: with no JavaScript this input stays empty and
   * `looksAutomated` skips the check entirely. Getting this wrong in the other
   * direction would silently discard a real message while reporting success,
   * which is the single worst thing this page could do.
   */
  const stamp = () => {
    if (elapsed.current) elapsed.current.value = String(Date.now() - startedAt.current);
  };

  const onCopy = async () => {
    if (state.status !== "failed") return;
    try {
      await navigator.clipboard.writeText(messageBody(state.fields));
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="cform">
      {/* Announced rather than merely rendered: after a native no-JS post this
          is a fresh page, but with JavaScript on it appears in place and a
          screen reader would otherwise never hear about it. */}
      <div className="cform__result" role="status" aria-live="polite">
        {state.status === "sent" && (
          <div className="cform__panel is-sent">
            <p className="cform__panel-title">{contactCopy.sentTitle}</p>
            <p className="cform__panel-body">{contactCopy.sentBody}</p>
          </div>
        )}

        {state.status === "failed" && (
          <div className="cform__panel is-failed">
            <p className="cform__panel-title">{contactCopy.failedTitle}</p>
            <p className="cform__panel-body">{contactCopy.failedBody}</p>
            <p className="cform__panel-actions">
              <a className="cform__alt" href={state.mailto}>
                {contactCopy.failedOpen}
              </a>
              {canCopy && (
                <button type="button" className="cform__alt" onClick={onCopy}>
                  {copy === "done" ? contactCopy.failedCopied : contactCopy.failedCopy}
                </button>
              )}
            </p>
            {copy === "failed" && <p className="cform__panel-body">{contactCopy.failedCopyFailed}</p>}
          </div>
        )}
      </div>

      <form
        className="cform__form"
        action={action}
        onSubmit={stamp}
        onBlur={onBlur}
        onInput={onInput}
      >
        {contactCopy.fields.map((field) => {
          const id = `${uid}-${field.name}`;
          const errorId = `${id}-error`;
          const error = errors[field.name];
          const shared = {
            id,
            name: field.name,
            className: "cform__input",
            defaultValue: echoed[field.name],
            placeholder: field.placeholder,
            autoComplete: field.autoComplete,
            maxLength: CONTACT_LIMITS[field.name],
            required: true,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? errorId : undefined,
          };

          return (
            <div className="cform__row" key={field.name}>
              <label className="cform__label" htmlFor={id}>
                {field.label}
              </label>
              {field.multiline ? (
                <textarea
                  // See the docblock: this is what survives React's post-action
                  // form reset with the visitor's words still in it.
                  key={`${field.name}-${state.seq}`}
                  {...shared}
                  rows={7}
                  minLength={MESSAGE_MIN}
                />
              ) : (
                <input key={`${field.name}-${state.seq}`} {...shared} type={field.inputType} />
              )}
              {error && (
                // `role="alert"` because a red border and a line of text are
                // invisible to a screen reader unless something announces them,
                // and this is the one message a visitor has to act on. React
                // leaves the node alone when the text has not changed, so
                // typing through a still-wrong field does not repeat it.
                <p className="cform__error" id={errorId} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}

        {/* Hidden from sight and from the tab order, and named nothing a browser
            recognises. An autofill that understood this field would fill it,
            the submission would be classed as a bot, and a real person would be
            told their message sent when it went nowhere. */}
        <div className="cform__hp" aria-hidden="true">
          <label htmlFor={`${uid}-hp`}>{contactCopy.honeypotLabel}</label>
          <input
            id={`${uid}-hp`}
            name={HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <input ref={elapsed} type="hidden" name={ELAPSED_FIELD} defaultValue="" />

        <button type="submit" className="cform__submit" disabled={pending}>
          {pending ? contactCopy.sending : contactCopy.submit}
          <span aria-hidden="true"> →</span>
        </button>
      </form>
    </div>
  );
}
