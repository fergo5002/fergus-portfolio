import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import CrtShell from "@/components/CrtShell";
import Nav from "@/components/Nav";
import SystemProvider from "@/components/system/SystemProvider";
import { profile } from "@/content/profile";
import JsonLd from "@/components/JsonLd";
import { bootInlineScript } from "@/lib/boot";
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
          // Built and documented in lib/boot.ts, where it can be executed by a
          // test. It was a string literal here, and that is precisely how a two
          // and a half second error in it reached production unnoticed: an
          // inline string is the one part of this file nothing can assert on.
          dangerouslySetInnerHTML={{ __html: bootInlineScript() }}
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
