import { ImageResponse } from "next/og";
import { profile } from "@/content/profile";
import { experience } from "@/content/experience";

/**
 * The default share card for the site, in the phosphor language: near-black
 * ground, green text, scanlines, a prompt.
 *
 * There was no OG image at all before this, which meant every link to the site
 * unfurled as a bare title on Slack, LinkedIn, iMessage and everywhere else. A
 * card is a click-through multiplier on exactly the channels this site is
 * shared through.
 *
 * Generated rather than a static file so it cannot fall out of step with
 * `content/profile.ts`. `next/og` ships with Next, so this costs no dependency.
 *
 * Note the constraints of the renderer: it is Satori, not a browser. Flexbox
 * only, no `gap` on some versions, no external fonts unless fetched and passed
 * in, and every element with more than one child needs an explicit `display`.
 * Keep it simple and it stays reliable.
 */

export const alt = `${profile.name}, ${profile.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0e0a";
const GREEN = "#33ff66";
const GREEN_BRIGHT = "#6effa3";
const GREEN_DIM = "#1f8f3a";
const AMBER = "#ffb000";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "64px 72px",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* Scanlines. A repeating-linear-gradient is the one CRT effect Satori
            can actually render, and at this size it reads correctly. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(51,255,102,0.06) 0px, rgba(51,255,102,0.06) 1px, transparent 1px, transparent 4px)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: GREEN_DIM, fontSize: 26 }}>
            {profile.user}@{profile.host}:~$ whoami
          </div>
          <div
            style={{
              display: "flex",
              color: GREEN_BRIGHT,
              fontSize: 92,
              fontWeight: 700,
              marginTop: 28,
              letterSpacing: "-2px",
            }}
          >
            {profile.shortName}
          </div>
          <div style={{ display: "flex", color: GREEN, fontSize: 36, marginTop: 18 }}>
            {profile.tagline}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 2,
              background: GREEN_DIM,
              marginBottom: 24,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", color: AMBER, fontSize: 28 }}>
              {/* Derived, not typed. A hardcoded role here would go on
                  advertising a stale one from every shared link. */}
              {experience[0] ? `${experience[0].role} @ ${experience[0].org}` : profile.jobTitle}
            </div>
            <div style={{ display: "flex", color: GREEN_DIM, fontSize: 28 }}>
              fergusoreilly.dev
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
