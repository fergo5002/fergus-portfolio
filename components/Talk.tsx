import Link from "next/link";
import MeetingCards from "./MeetingCards";
import { meetingCopy } from "@/content/meeting";

/** A shared invitation. Old callers' extra pitch is deliberately omitted. */
export default function Talk(_props: { line?: string } = {}) {
  return <aside className="contact-invitation" aria-labelledby="talk-heading">
    <div className="contact-invitation__head">
      <h2 id="talk-heading">{meetingCopy.contact}</h2>
      <Link className="talk__cta" href="/contact">{meetingCopy.getInTouch}</Link>
    </div>
    <MeetingCards />
  </aside>;
}
