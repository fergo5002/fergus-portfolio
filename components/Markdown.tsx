import { Fragment } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renders parsed markdown as real React elements.
 *
 * Note what is absent: there is no `dangerouslySetInnerHTML` anywhere in this
 * file. `lib/markdown.ts` returns typed blocks rather than an HTML string, so
 * every piece of article text arrives here as a JSX text child and is escaped
 * by React. That removes the injection surface entirely rather than sanitising
 * it, which is the whole reason for hand-writing the parser.
 */

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
          <a href={`#${block.id}`} className="prose__anchor" aria-label={`Link to this section`}>
            #
          </a>
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
    case "rule":
      return <hr key={i} className="prose__rule" />;
  }
}

export default function Markdown({ source }: { source: string }) {
  return <div className="prose">{parseMarkdown(source).map(renderBlock)}</div>;
}
