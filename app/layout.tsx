import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
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
  title: `${profile.shortName} — Terminal`,
  description: `${profile.name} — technical founder, CS @ Trinity, builder. Projects, experience, and contact.`,
  openGraph: {
    title: `${profile.shortName} — Terminal`,
    description: `${profile.name} — technical founder, CS @ Trinity, builder.`,
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
          //     the flag) only mounts on "/" — other routes must never get stuck hidden.
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
      </body>
    </html>
  );
}
