"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { studioShellCopy } from "@/content/studio/copy";

const loading = () => <p role="status">{studioShellCopy.loading}</p>;
const studios = {
  atlas: dynamic(() => import("./Atlas"), { loading }),
  "group-lore": dynamic(() => import("./GroupLore"), { loading }),
  "pocket-redact": dynamic(() => import("./PocketRedact"), { loading }),
  "prove-it": dynamic(() => import("./ProveIt"), { loading }),
  resonance: dynamic(() => import("./Resonance"), { loading }),
};

/** Controls appear once their handlers exist. The public page shell remains server-rendered. */
export default function Studio({ slug }: { slug: keyof typeof studios }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const Tool = studios[slug];
  return <div className="tool-studio" data-studio-host>
    {ready ? <Tool /> : loading()}
    <noscript>{studioShellCopy.noScript}</noscript>
  </div>;
}
