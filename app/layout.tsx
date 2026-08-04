import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import CrtShell from "@/components/CrtShell";
import Nav from "@/components/Nav";
import SystemProvider from "@/components/system/SystemProvider";
import { profile } from "@/content/profile";

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

export const metadata: Metadata = {
  // Derived from content/profile.ts, never retyped. AGENTS.md keeps copy in the
  // content layer, and a hand-written duplicate here would quietly go on
  // advertising the old tagline in search results after the hero was updated.
  title: `${profile.shortName} · Terminal`,
  // Trinity is appended rather than left to the tagline: the tagline was
  // shortened to fit one line in the hero, which is a pixel decision that should
  // not quietly cost the page its strongest search keyword.
  description: `${profile.name}: ${profile.tagline}. CS & Business @ Trinity College Dublin. Projects, experience, and contact.`,
  openGraph: {
    title: `${profile.shortName} · Terminal`,
    description: `${profile.name}: ${profile.tagline}. CS & Business @ Trinity College Dublin.`,
    type: "website",
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
