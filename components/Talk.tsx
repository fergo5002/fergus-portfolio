import { profile } from "@/content/profile";

/**
 * The call to action.
 *
 * Traffic with no next step is a vanity metric, and this site previously had
 * its contact details in a list at the bottom of the page alongside two GitHub
 * accounts, which is a footer rather than an ask.
 *
 * `profile.booking` takes over when it is set. Until then this is a `mailto:`
 * with the subject already filled in, which is a real action and not a
 * placeholder: the reason to pre-fill the subject is that "what do I even put"
 * is a genuine reason people close the tab.
 */
export default function Talk({ line }: { line?: string }) {
  const email = profile.contact.find((c) => c.href.startsWith("mailto:"));
  const href = profile.booking
    ? profile.booking
    : `${email?.href ?? "#"}?subject=${encodeURIComponent(profile.bookingSubject)}`;
  const external = Boolean(profile.booking);

  return (
    <aside className="talk" aria-labelledby="talk-heading">
      <p className="talk__prompt" aria-hidden="true">
        {profile.user}@{profile.host}:~$ ./say-hello
      </p>
      <h2 id="talk-heading" className="talk__title">
        Fancy a chat?
      </h2>
      <p className="talk__line">
        {line ??
          "I'm always up for talking to people building things, hiring, or backing early companies. No agenda needed."}
      </p>
      <a
        className="talk__cta"
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {profile.booking ? "Book a time" : `Email me`}
        <span aria-hidden="true"> →</span>
      </a>
      {!profile.booking && email ? <p className="talk__alt">{email.value}</p> : null}
    </aside>
  );
}
