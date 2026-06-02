import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import "./globals.css";
import CrtShell from "@/components/CrtShell";
import Nav from "@/components/Nav";
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
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <head>
        <script
          // Runs before first paint: only on the landing page ("/"), if this session
          // hasn't booted and the user allows motion, mark <html> as .booting so CSS
          // hides content until the boot overlay takes over. Prevents the content-
          // flash-then-boot bug. Path-gated because BootSequence (which clears the
          // flag) only mounts on "/" — other routes must never get stuck hidden.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(location.pathname!=='/')return;" +
              "var b=sessionStorage.getItem('fergusos_booted');" +
              "var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;" +
              "if(!b&&!r){document.documentElement.classList.add('booting');}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <CrtShell>
          <Nav />
          <main className="screen">{children}</main>
        </CrtShell>
      </body>
    </html>
  );
}
