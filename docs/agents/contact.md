# `/contact`: booking into the calendar, the three boxes and Resend

Read this before touching `/contact`, the meeting form, `lib/calendar.ts`, `lib/meeting*.ts`, `lib/contact.ts`, the spam handling or the sender and destination settings. `docs/DEVELOPING.md` has the verification commands.

## What the page is (Fergus, 2026-11-25)

Two cards, grab a coffee and jump on a call, then three smaller boxes underneath: LinkedIn, GitHub
and email (`components/SocialLinks.tsx`). **There is no message form any more**, by his ask: "get
rid of the contact box altogether". `components/ContactForm.tsx` and `app/contact/actions.ts` are
gone; `lib/contact.ts` and `lib/contact-server.ts` stay because the meeting form uses their field
limits, the honeypot and the Resend send.

`?meet=coffee` or `?meet=call` opens the calendar. Free times come from Fergus's Google calendars
on the server (`lib/calendar.ts`, plain `fetch`, no SDK):

- **freeBusy** across `GOOGLE_CALENDAR_BUSY_IDS` (his Gmail, Draft and Family calendars; Tigh is
  left out on purpose). Weekdays, Dublin time, slots starting 10:00 to 17:00, at least a day out.
  Irish bank holidays are not blocked. Cached for 60 seconds.
- **A pick books itself.** The server action re-reads availability fresh, re-validates the slot,
  then inserts the event into `GOOGLE_CALENDAR_BOOK_ID` (default `primary`) with the visitor as a
  guest and `sendUpdates=all`, so Google emails them the invite. A call gets a Meet link
  (`conferenceDataVersion=1`). Fergus gets a short email as well, best effort.
- **Caps:** three per visitor and eight across everyone in the last day, and twelve upcoming in all
  (`BOOKING_LIMITS`), counted in the calendar itself: every booking carries a private
  `source=fergusoreilly.dev` property and `siteBookings` lists the upcoming tagged events. Not
  `lib/budget.ts`: the site has no Redis in production, and the first version, which counted there,
  would have refused every live booking.
- **Google mails the invite to whatever address was typed, from Fergus's account**, so a pick books
  itself only when it came from the page (the timing field is present and not implausibly fast) and
  the name and note carry no link. The event's description is a fixed line; the visitor's note goes
  to Fergus by email only. Anything that fails these, or a cap, becomes an emailed request, and the
  page says so.
- **The page is sent which offered slots are taken (`takenSlots`), never the busy times**, which
  are three calendars at minute precision. A month with nothing free shows the email address, not
  an empty grid.
- **Fails closed.** On Vercel production (`VERCEL_ENV=production`) a missing or broken calendar
  shows "My calendar isn't loading" and the email address, never made-up times. Anywhere else with
  no calendar configured, `demoBusy` fills in a fake pattern so CI and local builds have something
  to pick, and a pick there falls through to the emailed request (which fails without a Resend key,
  which is what CI expects).

The OAuth client is its own ("fergusoreilly.dev booking" in Google Cloud), not the workspace MCP's,
and the refresh token carries `calendar.freebusy` and `calendar.events` only. The four variables are
on the Vercel project for production only, with copies in the Mac Keychain.

## Nothing on this site may fail silently

**Nothing on this site may fail silently, and `/contact` is where that rule was written down.** The
call to action was an `<a href="mailto:...">` labelled "Email me", and on a machine with no mail
client registered, which is most of them, clicking it does nothing at all: no error, no tab, no
feedback. Fergus reported it as a dead button. It now goes to `/contact`, and three rules came out
of building that page. They were written for the message form, which went on 2026-11-25, and they
still hold for the meeting form and anything that replaces it (the email box shows the address
under its name for the same reason):

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
submit button and reads the final field rectangle without moving it itself. That step went with
the message form on 2026-11-25; the `scroll-padding-top` rule stays for the meeting form.

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
