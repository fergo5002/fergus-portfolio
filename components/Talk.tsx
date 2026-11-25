import Link from "next/link";
import type { ReactNode } from "react";
import { meetingCopy } from "@/content/meeting";
import "./meeting.css";

/**
 * A shared invitation. Old callers' extra pitch is deliberately omitted.
 * Anything passed in sits on the same row after the button: the home page
 * puts its LinkedIn and GitHub buttons there.
 */
export default function Talk({ children }: { line?: string; children?: ReactNode } = {}) {
  return <aside className="contact-invitation">
    <Link className="talk__cta" href="/contact">{meetingCopy.getInTouch}</Link>
    {children}
  </aside>;
}
