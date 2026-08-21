import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PromptLine from "@/components/PromptLine";
import Markdown from "@/components/Markdown";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { articles, articleBySlug, readingMinutes, wordCount } from "@/content/articles";
import { profile } from "@/content/profile";
import { tableOfContents } from "@/lib/markdown";
import { questionPairs } from "@/lib/faq";
import {
  canonical,
  blogPostingSchema,
  breadcrumbSchema,
  faqPageSchema,
  articlePath,
} from "@/lib/seo";

/**
 * Every article is statically generated at build time. `dynamicParams = false`
 * makes an unknown slug a 404 rather than an attempt to render on demand, which
 * keeps the set of indexable URLs exactly equal to the set in the sitemap.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.description,
    keywords: article.tags,
    alternates: canonical(articlePath(article.slug)),
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      url: articlePath(article.slug),
      publishedTime: article.date,
      modifiedTime: article.updated ?? article.date,
      authors: [profile.name],
      tags: article.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
  };
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  const toc = tableOfContents(article.body);
  const index = articles.findIndex((a) => a.slug === article.slug);
  const next = articles[index + 1];

  // Built from the article's own question headings, so the graph cannot claim an
  // answer a reader would not find on the page. `faqPageSchema` returns
  // undefined below two pairs rather than publishing a thin one.
  const faq = faqPageSchema(article, questionPairs(article.body));

  return (
    <article className="stack">
      <JsonLd
        nodes={[
          blogPostingSchema(article, wordCount(article.body)),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Writing", path: "/writing" },
            { name: article.title, path: articlePath(article.slug) },
          ]),
          ...(faq ? [faq] : []),
        ]}
      />

      <PromptLine command={`cat ./writing/${article.slug}.md`} path="~/writing" />

      <header className="post__head">
        <h1 className="post__title">{article.title}</h1>
        <p className="post__meta">
          <time dateTime={article.date}>{formatDate(article.date)}</time>
          <span aria-hidden="true"> · </span>
          {readingMinutes(article.body)} min read
          <span aria-hidden="true"> · </span>
          {profile.shortName}
        </p>
        <ul className="writing__tags" aria-label="Tags">
          {article.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </header>

      {toc.length > 2 ? (
        <nav className="post__toc" aria-label="On this page">
          <p className="post__toc-title">On this page</p>
          <ol>
            {toc
              .filter((h) => h.level === 2)
              .map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
          </ol>
        </nav>
      ) : null}

      <Markdown source={article.body} />

      <footer className="post__foot">
        {next ? (
          <p className="post__next">
            Next: <Link href={articlePath(next.slug)}>{next.title}</Link>
          </p>
        ) : null}
        <p className="post__back">
          <Link href="/writing">← all writing</Link>
        </p>
      </footer>

      <Talk />
    </article>
  );
}
