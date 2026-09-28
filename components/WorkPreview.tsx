"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import TiltCard from "./motion/TiltCard";
import { homeCopy } from "@/content/home";
import { previewPlacement } from "@/lib/preview-placement";

/**
 * A company link on the homepage that opens a small preview card on hover or
 * focus. The card opens below its link unless that would put it under the
 * status strip or off the window, in which case it opens above (see
 * `lib/preview-placement.ts`). Measured at the moment it opens, because the
 * link's place on screen changes with every scroll.
 *
 * The server always renders the "below" state, which is what the first client
 * render assumes too, so placement never causes a hydration mismatch.
 */
export default function WorkPreview({ name }: { name: keyof typeof homeCopy.previews }) {
  const work = homeCopy.previews[name];
  const rootRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"below" | "above">("below");

  const place = () => {
    const root = rootRef.current;
    const link = root?.querySelector(".work-preview__link");
    const panel = root?.querySelector(".work-preview__panel");
    if (!link || !panel) return;
    const anchor = link.getBoundingClientRect();
    // The panel is laid out while hidden (visibility, not display), so its
    // height is real before it is shown. Its padding is the hover bridge to
    // the link, so the gap is already inside this height.
    const panelHeight = panel.getBoundingClientRect().height;
    const strip = document.querySelector(".statusbar")?.getBoundingClientRect();
    const nav = document.querySelector(".nav")?.getBoundingClientRect();
    setSide(
      previewPlacement({
        anchorTop: anchor.top,
        anchorBottom: anchor.bottom,
        panelHeight,
        viewportHeight: window.innerHeight,
        reservedBottom: strip ? Math.max(0, window.innerHeight - strip.top) : 0,
        reservedTop: nav ? Math.max(0, nav.bottom) : 0,
        gap: 0,
      }),
    );
  };

  return (
    <div ref={rootRef} className={`work-preview is-${side}`} onPointerEnter={place} onFocus={place}>
      <Link href={work.href} className="work-preview__link">
        {work.label}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" /></svg>
        <span className="work-preview__peek" aria-hidden="true"><Image src={work.image} alt="" width={320} height={180} /></span>
      </Link>
      <div className="work-preview__panel">
        <TiltCard max={5}>
          <Link href={work.href} className="work-preview__card" tabIndex={-1}>
            <span className="work-preview__screen">
              <Image src={work.image} alt={work.alt} width={320} height={180} />
            </span>
            <span className="work-preview__caption"><strong>{work.title}</strong><span>{work.detail}</span></span>
          </Link>
        </TiltCard>
      </div>
    </div>
  );
}
