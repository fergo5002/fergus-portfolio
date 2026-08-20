import { ImageResponse } from "next/og";
import { articles, articleBySlug, readingMinutes } from "@/content/articles";
import { profile } from "@/content/profile";

/**
 * Per-article share card. Same phosphor language as the site card, with the
 * headline as the subject rather than the name.
 *
 * Pre-rendered for every article at build time via `generateStaticParams`, so a
 * social platform's unfurler gets a file rather than waiting on a cold render.
 * Unfurlers time out aggressively and a slow card is the same as no card.
 *
 * `fontFamily: "monospace"` is aspirational: Satori loads no monospace face, so
 * it falls back to its sans default. The cards are legible and on-palette, they
 * just are not in the site's typeface. Fixing it properly means fetching and
 * passing a font buffer, which is a real cost for a share card. Left as is
 * deliberately, and written down so nobody re-discovers it as a bug.
 */

export const alt = "Article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

/**
 * Cuts at the last word boundary before `max` and marks the cut.
 *
 * A bare `slice` broke four of the eight cards mid-word: the Presterly card
 * ended "not the product and not the mark", which is "market" sawn in half on
 * the artefact that represents the post everywhere it gets shared.
 */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, "")}...`;
}

const BG = "#0a0e0a";
const GREEN = "#33ff66";
const GREEN_BRIGHT = "#6effa3";
const GREEN_DIM = "#1f8f3a";
const AMBER = "#ffb000";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  const title = article?.title ?? "Writing";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "60px 72px",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(51,255,102,0.06) 0px, rgba(51,255,102,0.06) 1px, transparent 1px, transparent 4px)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: GREEN_DIM, fontSize: 24 }}>
            {profile.user}@{profile.host}:~/writing$ cat {slug}.md
          </div>
          <div
            style={{
              display: "flex",
              color: GREEN_BRIGHT,
              // Scaled to the headline so a long title still fits on the card
              // rather than being clipped by the renderer.
              fontSize: title.length > 44 ? 60 : 74,
              fontWeight: 700,
              marginTop: 30,
              lineHeight: 1.15,
              letterSpacing: "-1px",
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {article ? (
            <div
              style={{
                display: "flex",
                color: GREEN,
                fontSize: 26,
                marginBottom: 26,
                lineHeight: 1.4,
              }}
            >
              {clamp(article.description, 170)}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 2,
              background: GREEN_DIM,
              marginBottom: 22,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", color: AMBER, fontSize: 26 }}>{profile.shortName}</div>
            <div style={{ display: "flex", color: GREEN_DIM, fontSize: 26 }}>
              {article ? `${readingMinutes(article.body)} min read` : "fergusoreilly.dev"}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
