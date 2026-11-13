# `/contact`: the form, meeting requests and Resend

Read this before touching `/contact`, the contact or meeting forms, `lib/contact.ts`, the spam handling or the sender and destination settings. `docs/DEVELOPING.md` has the meeting-request rules and the verification commands.

## Nothing on this site may fail silently

**Nothing on this site may fail silently, and `/contact` is where that rule was written down.** The
call to action was an `<a href="mailto:...">` labelled "Email me", and on a machine with no mail
client registered, which is most of them, clicking it does nothing at all: no error, no tab, no
feedback. Fergus reported it as a dead button. It now goes to `/contact`, and three rules came out
of building that page:

- **A control that can do nothing must not be rendered.** The copy button on the failure panel is
  rendered only once `navigator.clipboard.writeText` is known to exist, and the `mailto:` escape
  hatch is offered beside it rather than instead of it, precisely because a `mailto:` is the thing
  that cannot be relied on.
- **The form works with JavaScript off.** It is a real `<form>` posting to a server action,
  enhanced by `useActionState` rather than dependent on it. `key={state.seq}` on each input is what
  survives React's post-action form reset with the visitor's words still in it. Prove it the way it
  was proved the first time: POST the multipart form with its `$ACTION*` hidden fields against a
  production build and read the outcome off the HTML that comes back.
- **A spam filter that can misfire on a human is worse than the spam.** A caught submission is
  reported as "sent" without sending, so anything that can trip it on a real person silently eats
  their message. Two consequences, and the second one shipped as a bug before review caught it:
  the honeypot is named `hp` and not `website`, because a name a browser's autofill recognises is
  a name it will fill; and **only the honeypot may discard anything.** The timing floor merely
  marks a message with `[fast]` in the subject. It used to drop them, which meant a visitor who
  autofilled two fields and pasted a prepared message was told "Sent." while it went nowhere.
  Never give a soft signal the power to delete.

## Native validation and the fixed nav

**Native validation must leave the invalid field visible below the fixed nav.** On WebKit
phone emulation, a field's `scroll-margin-top` alone still left the focused name above the
viewport after the browser finished scrolling. `html` also sets `scroll-padding-top` to the
nav height plus one spacing unit. `scripts/phone-polish-check.mjs` taps the empty form's
submit button and reads the final field rectangle without moving it itself. This preserves
native validation and the no-JavaScript form; it does not introduce a second submit path.

## Sending through Resend

Sending goes through Resend over plain `fetch`, no SDK. `RESEND_API_KEY` is the only required
variable and it **is set** on the Vercel project (production, preview and development), with a copy
in the Mac Keychain (`auth get RESEND_API_KEY`). `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` are optional overrides and neither
is set.

**Do not move the destination without reading the `DEFAULT_FROM` docblock in `lib/contact.ts`
first.** The sender is Resend's shared `onboarding@resend.dev`, which needs no DNS but may only
deliver to the address the Resend account is registered under. That happens to be the same address
the form sends to, which is the only reason the zero-config setup works. Point `CONTACT_TO_EMAIL`
anywhere else without first verifying a domain and setting `CONTACT_FROM_EMAIL`, and every send
starts coming back 403.
