import type { Metadata } from "next";
import Link from "next/link";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import ArticleFigure from "@/components/writing/ArticleFigure";
import { articles, readingMinutes } from "@/content/articles";
import "./writing.css";
import { profile } from "@/content/profile";
import { canonical, blogSchema, breadcrumbSchema, articlePath, OG_IMAGE } from "@/lib/seo";

const DESCRIPTION =
  "Writing by Fergus O'Reilly.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name. Spelling
  // it out here would produce "Writing · Fergus O'Reilly · Fergus O'Reilly".
  title: "Writing",
  description: DESCRIPTION,
  alternates: {
    ...canonical("/writing"),
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    title: `Writing · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/writing",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/** Long dates, because an article index is one of the few places they earn it. */
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function WritingPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          blogSchema(articles),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Writing", path: "/writing" },
          ]),
        ]}
      />
      <PromptLine command="ls -la ./writing" path="~/writing" />
      <h1 className="page__title">
        <Scramble text="writing" speed={34} />
      </h1>

      {/* Each row: the piece's figure, its title, one line on what it argues,
          and the date. The title link is stretched over the row by CSS so the
          whole entry is the target, while its accessible name stays the title. */}
      <ol className="writing__list writing__list--figured">
        {articles.map((article) => (
          <li key={article.slug} className="writing__item">
            <ArticleFigure slug={article.slug} />
            <div className="writing__text">
              <Link href={articlePath(article.slug)} className="writing__link">
                <h2 className="writing__title">{article.title}</h2>
              </Link>
              <p className="writing__desc">{article.description}</p>
              <p className="writing__meta">
                <time dateTime={article.date}>{formatDate(article.date)}</time>
                <span className="writing__dot" aria-hidden="true" />
                {readingMinutes(article.body)} min read
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="writing__feed">
        <a href="/feed.xml" className="prose__link">
          RSS feed
        </a>
      </p>

      <Talk line="If any of this is relevant to something you're building, I'd like to hear about it." />
    </div>
  );
}
