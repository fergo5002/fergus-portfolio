import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import MeetingCalendar from "@/components/MeetingCalendar";
import MeetingCards from "@/components/MeetingCards";
import SocialLinks from "@/components/SocialLinks";
import { meetingCopy } from "@/content/meeting";
import { contactCopy } from "@/content/contact";
import { profile } from "@/content/profile";
import { availability } from "@/lib/calendar";
import { takenSlots } from "@/lib/meeting";
import { OG_IMAGE, breadcrumbSchema, canonical, contactPageSchema } from "@/lib/seo";

const DESCRIPTION = `Grab a coffee or jump on a call with ${profile.shortName}, booked straight into his calendar, or find him on LinkedIn, GitHub or email.`;

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Contact",
  description: DESCRIPTION,
  alternates: canonical("/contact"),
  openGraph: {
    title: `Contact · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/contact",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/contact`: a coffee or a call, then LinkedIn, GitHub and email
 * (Fergus, 2026-11-25: "there should just be grab a coffee, jump on a call and
 * then under it 3 more smaller boxes").
 *
 * `?meet=coffee` or `?meet=call` opens the calendar. Its free times are read
 * from Fergus's Google calendars on the server (`lib/calendar.ts`), and a pick
 * is booked there by the server action. The page is sent only which offered
 * half hours are taken (`takenSlots`), never the calendars' own busy times. With no calendar to read, production
 * says so and prints the email address rather than offering a time it made
 * up; `MeetingCalendar` draws that state.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ meet?: string }> }) {
  const { meet } = await searchParams;
  const kind = meet === "coffee" || meet === "call" ? meet : null;
  const now = new Date();
  const calendar = kind ? await availability(now) : null;
  return (
    <div className={`stack contact-page${kind ? " contact-page--meet" : ""}`}>
      <JsonLd
        nodes={[
          contactPageSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
        ]}
      />
      <PromptLine command={contactCopy.command} path={contactCopy.path} />
      <h1 className="page__title">
        <Scramble text={kind ? meetingCopy[kind] : contactCopy.title} speed={34} />
      </h1>
      {kind && <p className="page__lede">{meetingCopy.intro}</p>}

      {kind && calendar ? (
        <MeetingCalendar
          key={kind}
          kind={kind}
          now={now.toISOString()}
          busy={calendar.mode === "down" ? null : takenSlots(now, calendar.busy)}
        />
      ) : (
        <>
          <div className="contact-meetings">
            <MeetingCards />
          </div>
          <SocialLinks variant="boxes" networks={["linkedin", "github", "email"]} />
        </>
      )}
    </div>
  );
}
