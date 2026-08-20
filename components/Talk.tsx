import Link from "next/link";
import { profile } from "@/content/profile";

/**
 * The call to action.
 *
 * Traffic with no next step is a vanity metric, and this site previously had
 * its contact details in a list at the bottom of the page alongside two GitHub
 * accounts, which is a footer rather than an ask.
 *
 * **The button used to be a `mailto:`, and that was the bug.** Pre-filled
 * subject and all, it opens nothing at all on a machine with no mail client
 * registered, which is most of them: no error, no new tab, no feedback. Fergus
 * reported it as a dead button and he was right. It now goes to `/contact`,
 * which is a page, and a page cannot fail to appear.
 *
 * `profile.booking` still takes over when it is set, and that stays an external
 * link because a calendar lives somewhere else.
 */
export default function Talk({ line }: { line?: string }) {
  const email = profile.contact.find((c) => c.href.startsWith("mailto:"));

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
      {profile.booking ? (
        <a
          className="talk__cta"
          href={profile.booking}
          target="_blank"
          rel="noopener noreferrer"
        >
          Book a time
          <span aria-hidden="true"> →</span>
        </a>
      ) : (
        <Link className="talk__cta" href="/contact">
          Email me
          <span aria-hidden="true"> →</span>
        </Link>
      )}
      {!profile.booking && email ? <p className="talk__alt">{email.value}</p> : null}
    </aside>
  );
}
