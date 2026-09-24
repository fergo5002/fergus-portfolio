import Link from "next/link";
import { meetingCopy } from "@/content/meeting";
import "./meeting.css";

/** A shared invitation. Old callers' extra pitch is deliberately omitted. */
export default function Talk(_props: { line?: string } = {}) {
  return <aside className="contact-invitation">
    <Link className="talk__cta" href="/contact">{meetingCopy.getInTouch}</Link>
  </aside>;
}
