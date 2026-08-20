import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import CrtShell from "@/components/CrtShell";
import Nav from "@/components/Nav";
import SystemProvider from "@/components/system/SystemProvider";
import { profile } from "@/content/profile";
import JsonLd from "@/components/JsonLd";
import {
  SITE_URL,
  SITE_NAME,
  SITE_LOCALE,
  canonical,
  personSchema,
  websiteSchema,
} from "@/lib/seo";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const display = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const DESCRIPTION = `${profile.name}: ${profile.tagline}. Co-founder of Tigh Sauna, previously Presterly. CS & Business @ Trinity College Dublin.`;

export const metadata: Metadata = {
  // `metadataBase` is what makes every relative URL below resolve to an
  // absolute one. Without it Next cannot build an absolute OG image URL, and a
  // relative OG image is ignored by every platform that unfurls a link, so the
  // card silently falls back to nothing.
  metadataBase: new URL(SITE_URL),
  // Derived from content/profile.ts, never retyped. AGENTS.md keeps copy in the
  // content layer, and a hand-written duplicate here would quietly go on
  // advertising the old tagline in search results after the hero was updated.
  title: {
    default: `${profile.shortName} · ${profile.jobTitle}`,
    // Child routes set a bare title and get the name appended, so every tab and
    // every search result carries the entity this site is about.
    template: `%s · ${profile.shortName}`,
  },
  // Trinity is appended rather than left to the tagline: the tagline was
  // shortened to fit one line in the hero, which is a pixel decision that should
  // not quietly cost the page its strongest search keyword.
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: profile.name, url: SITE_URL }],
  creator: profile.name,
  // The landing page's own canonical. Child routes override this with theirs.
  alternates: {
    ...canonical("/"),
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    title: `${profile.shortName} · ${profile.jobTitle}`,
    description: DESCRIPTION,
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.shortName} · ${profile.jobTitle}`,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Without these three, Google is free to truncate the snippet, refuse to
      // show a preview image, and cap video previews. They are the difference
      // between a rich result and a bare blue link.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${display.variable}`}
      // The pre-paint script below adds the `booting` class to <html> before React
      // hydrates, so the server/client className intentionally differ. Suppress the
      // hydration warning for this element (standard theme-flash-script pattern).
      suppressHydrationWarning
    >
      <head>
        <script
          // Runs before first paint and does three things:
          //
          //  1. Flags `.js` on <html>. Scroll reveals hide their content behind this
          //     class only, so a visitor without JavaScript is never left staring at
          //     a permanently clipped block.
          //  2. Restores the saved phosphor theme before paint, so a returning
          //     visitor on amber never sees a flash of green.
          //  3. On the landing page only, if this session hasn't booted and the user
          //     allows motion, marks <html> as .booting so CSS hides content until the
          //     boot overlay takes over. Path-gated because BootSequence (which clears
          //     the flag) only mounts on "/": other routes must never get stuck hidden.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;d.classList.add('js');" +
              "try{var s=JSON.parse(localStorage.getItem('fergusos_settings')||'{}');" +
              "if(s.theme)d.dataset.theme=s.theme;" +
              "if(s.crtEnabled===false)d.classList.add('crt-off');" +
              "if(typeof s.scanlines==='number')d.style.setProperty('--scanline-intensity',String(s.scanlines));" +
              "}catch(e){}" +
              "try{if(location.pathname!=='/')return;" +
              "var b=sessionStorage.getItem('fergusos_booted');" +
              "var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
              "if(!b&&!r){d.classList.add('booting');}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        {/*
          The Person and WebSite nodes sit in the layout so every route carries
          them, which is what lets each page's own schema reference the same
          entity by `@id` instead of describing a fresh, thinner one. Routes add
          their page-specific nodes in their own JsonLd block.
        */}
        <JsonLd nodes={[personSchema(), websiteSchema()]} />
        <a href="#main" className="skiplink">
          skip to content
        </a>
        <SystemProvider>
          <CrtShell>
            <Nav />
            <main id="main" className="screen">
              {children}
            </main>
          </CrtShell>
        </SystemProvider>
        {/*
          Vercel Web Analytics. It returns null and appends its script to <head>,
          so sitting outside CrtShell buys lifetime, not layout: there is no node
          here to inherit the tube's transform in the first place.

          In development it loads Vercel's debug script from va.vercel-scripts.com
          and reports nothing, so local pottering never reaches the numbers. An ad
          blocker will log a failed load there; that is expected and harmless.

          On a deployment the loader and the beacon live on a per-deploy hashed
          path, NOT /_vercel/insights/script.js, which is only the fallback string
          in the package. Verify a deploy by watching the view beacon return 200 in
          a real browser, never by curling that path: it 404s while analytics is
          working perfectly, and that has cost a day before.
        */}
        <Analytics />
      </body>
    </html>
  );
}
