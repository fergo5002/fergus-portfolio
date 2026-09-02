import { Fragment } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { Chart } from "./Chart";

/**
 * Renders parsed markdown as real React elements.
 *
 * Note what is absent: there is no `dangerouslySetInnerHTML` anywhere in this
 * file. `lib/markdown.ts` returns typed blocks rather than an HTML string, so
 * every piece of article text arrives here as a JSX text child and is escaped
 * by React. That removes the injection surface entirely rather than sanitising
 * it, which is the whole reason for hand-writing the parser.
 */

/** Absolute http(s), a site-relative path, or an in-page anchor. Nothing else. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("#");
}

function renderInline(nodes: Inline[]) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "strong":
        return <strong key={i}>{node.value}</strong>;
      case "em":
        return <em key={i}>{node.value}</em>;
      case "code":
        return (
          <code key={i} className="prose__code">
            {node.value}
          </code>
        );
      case "link": {
        // `javascript:`, `data:` and friends never become an anchor. The
        // article bodies are first-party TypeScript so nothing hostile can
        // reach here today, but the renderer should not be the thing standing
        // between a future content source and an executable href.
        if (!isSafeHref(node.href)) return <Fragment key={i}>{node.value}</Fragment>;
        // Anything leaving the site opens in a new tab and carries
        // `noopener`, without which the opened page can reach back through
        // `window.opener`.
        const external = /^https?:\/\//.test(node.href);
        return (
          <a
            key={i}
            href={node.href}
            className="prose__link"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {node.value}
          </a>
        );
      }
      default:
        return <Fragment key={i}>{node.value}</Fragment>;
    }
  });
}

function renderBlock(block: Block, i: number) {
  switch (block.type) {
    case "heading": {
      // Levels come from the markdown and start at 2, because the article
      // title is the page's only h1. A document that jumps from h2 to h4 is a
      // broken outline for a screen reader and for a search engine both.
      const Tag = (`h${block.level}` as const) satisfies "h2" | "h3" | "h4";
      return (
        <Tag key={i} id={block.id} className="prose__h">
          {/*
            The heading text goes in the label. Every anchor carrying the same
            name means a screen reader user pulling up a links list gets "Link
            to this section" six to eight times with nothing to choose between.
          */}
          {/*
            The `#` is drawn by `.prose__anchor::before`, not written here. It
            used to be a real text node, and measured against the live site on
            2026-08-21 that meant all 46 article headings extracted as
            `#The actual reason` for anything reading the HTML as text. The
            glyph is decoration, the label is the content, and `aria-hidden`
            would not have helped: a text extractor has no reason to read
            accessibility properties, which is the same lesson the hero name
            taught. `components/chrome.test.ts` guards it.
          */}
          <a
            href={`#${block.id}`}
            className="prose__anchor"
            aria-label={`Link to the section: ${block.inline.map((n) => n.value).join("")}`}
          />
          {renderInline(block.inline)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={i} className="prose__p">
          {renderInline(block.inline)}
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol key={i} className="prose__list">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={i} className="prose__list">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre key={i} className="prose__pre" data-lang={block.lang || undefined}>
          <code>{block.value}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={i} className="prose__quote">
          {renderInline(block.inline)}
        </blockquote>
      );
    case "chart":
      // The figure draws itself from a typed spec, never from HTML in the
      // article body. `lib/chart.ts` has already rejected anything malformed, so
      // by the time a chart block exists here its shape is guaranteed and the
      // component has no validation to do.
      return <Chart key={i} spec={block.spec} />;
    case "table":
      // A real table, not a grid of divs. The header cells carry `scope="col"`
      // so a screen reader announces the column a value belongs to instead of
      // reading a wall of loose numbers, which is the whole reason to use the
      // element rather than draw one.
      //
      // The wrapper exists so a table wider than the measure scrolls inside
      // itself rather than pushing the article body sideways. It needs an
      // `overflow-x` rule in `app/globals.css` to do that, alongside rules for
      // `prose__table`, `prose__th` and `prose__td`.
      return (
        <div key={i} className="prose__tablewrap">
          <table className="prose__table">
            <thead>
              <tr>
                {block.head.map((cell, j) => (
                  <th key={j} scope="col" className="prose__th">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k} className="prose__td">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr key={i} className="prose__rule" />;
  }
}

export default function Markdown({ source }: { source: string }) {
  return <div className="prose">{parseMarkdown(source).map(renderBlock)}</div>;
}
