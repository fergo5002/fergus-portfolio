import type { Metadata } from "next";
import Link from "next/link";
import MissingPath from "@/components/MissingPath";
import { notFoundCopy as copy } from "@/content/not-found";
import "./not-found.css";

/**
 * A missing page is a channel with nothing on it: the test card a set shows
 * when there is no signal, the path you asked for as a failed `cd`, and the
 * way back. The card is shapes only (no words), so the page's text is its
 * message and its links. Next serves this with a 404 status and a noindex tag.
 */
export const metadata: Metadata = {
  title: "No signal",
};

export default function NotFound() {
  return (
    <div className="stack nosignal">
      <div className="nosignal__card" aria-hidden="true">
        <div className="nosignal__bars">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className="nosignal__strip">
          <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className="nosignal__ring" />
        <div className="nosignal__static" />
      </div>
      <MissingPath suffix={copy.missing} />
      <h1 className="page__title nosignal__title">{copy.title}</h1>
      <p className="nosignal__line">{copy.line}</p>
      <ul className="nosignal__links">
        {copy.links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
