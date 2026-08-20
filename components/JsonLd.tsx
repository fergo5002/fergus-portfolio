import { graph, jsonLd, type JsonLdObject } from "@/lib/seo";

/**
 * Injects one schema.org graph into the page.
 *
 * A server component with no client cost: this renders to a script tag in the
 * initial HTML, which is the only place it is any use. A crawler that does not
 * execute JavaScript, which includes most of the ones that matter for answer
 * engines, would never see structured data added on the client.
 *
 * One graph per page, not several sibling scripts. The nodes reference each
 * other by `@id` (every page's content points back at the same `Person`), and
 * those references only resolve if they are inside the same `@graph`. Split them
 * across scripts and you get several thin, unlinked entities instead of one
 * well-evidenced one.
 *
 * `dangerouslySetInnerHTML` is unavoidable here, because the content has to be
 * raw text inside the script element rather than an escaped text node. It is
 * made safe in `jsonLd`, which escapes `<` so nothing in the data can close the
 * tag early. See `lib/seo.test.ts`.
 */
export default function JsonLd({ nodes }: { nodes: JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(graph(nodes)) }}
    />
  );
}
