"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { labCopy } from "@/content/lab";
const loading = () => <p role="status">{labCopy.loading}</p>;
const tools = {
  bottleneck: dynamic(() => import("./Bottleneck"), { loading }),
  "good-window": dynamic(() => import("./GoodWindow"), { loading }),
  "black-box": dynamic(() => import("./BlackBox"), { loading }),
  "same-page": dynamic(() => import("./SamePage"), { loading }),
  "what-if": dynamic(() => import("./WhatIf"), { loading }),
  "fair-play": dynamic(() => import("./FairPlay"), { loading }),
  "prove-it": dynamic(() => import("./ProveIt"), { loading }),
  "group-lore": dynamic(() => import("./GroupLore"), { loading }),
  "pocket-redact": dynamic(() => import("./PocketRedact"), { loading }),
  "clear-day": dynamic(() => import("./ClearDay"), { loading }),
  "code-atlas": dynamic(() => import("./CodeAtlas"), { loading }),
  resonance: dynamic(() => import("./Resonance"), { loading }),
};
export default function Workbench({ slug }: { slug: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const Tool = tools[slug as keyof typeof tools];
  return ready ? <Tool /> : loading();
}
