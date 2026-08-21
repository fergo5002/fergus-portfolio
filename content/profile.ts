export type ContactLink = {
  label: string;
  value: string;
  href: string;
};

export type Profile = {
  /** Full legal name. */
  name: string;
  /** Friendlier display name. */
  shortName: string;
  /** Terminal user (left of the @ in the prompt). */
  user: string;
  /** Terminal host (right of the @ in the prompt). */
  host: string;
  tagline: string;
  location: string;
  education: string;
  /** Bio paragraphs — first person. */
  bio: string[];
  contact: ContactLink[];
  /**
   * Public path to your portrait, e.g. "/img/portrait.jpg".
   * Leave as "" to show a placeholder box until you add the file.
   */
  portrait: string;
  /**
   * Job title as a search engine and an answer engine should read it. Kept
   * separate from `tagline`, which is written to sound like a person rather
   * than to be parsed: schema.org wants the plain noun.
   */
  jobTitle: string;
  /**
   * Subjects this person is a credible source on, for the `knowsAbout` edge of
   * the Person graph. This is the field that decides which questions an answer
   * engine considers him relevant to, so keep it to things actually evidenced
   * on the site and do not pad it with keywords.
   */
  knowsAbout: string[];
  /**
   * Booking URL for the "talk" call to action. Empty ships a `mailto:` with a
   * pre-filled subject instead, which is a real call to action rather than a
   * placeholder. Set this and it takes over with no other change needed.
   */
  booking: string;
  /** Subject line pre-filled on the mailto fallback. */
  bookingSubject: string;
};

export const profile: Profile = {
  name: "Patrick Fergus O'Reilly",
  shortName: "Fergus O'Reilly",
  user: "fergus",
  host: "portfolio",
  // One line on desktop with ~74px to spare. "CS @ Trinity" used to sit in the
  // middle segment and was cut, not lost: the education line renders directly
  // beneath this and already says Trinity.
  tagline: "Technical Founder · Builds beautiful things that scale",
  location: "Dublin, Ireland",
  education:
    "BA Computer Science (Major) & Business (Minor) @ Trinity College Dublin, First Class Honours (1.1)",
  bio: [
    "I'm a builder. I like making things that are genuinely nice to look at, and I like making them hold up once real traffic turns up. Those two pull against each other most days, and getting both is the part I actually enjoy.",
    "Right now I'm building Tigh Sauna with Connell Kennelly. Running a sauna shouldn't be admin. So we took the admin off it: bookings, payments and customers in one place, quick to set up, and built so people come back instead of visiting once and drifting off. We're building it with two Irish sauna businesses.",
    "I'm starting third year of Computer Science and Business at Trinity College Dublin, on a 1.1 so far, and building full time alongside it.",
    "Before this I was co-founder and CTO of Presterly, which predicted when a Shopify brand's customers would run out and reached them over SMS and WhatsApp at that moment. We wound it down in August 2026. Before that I was a founding engineer at Loira AI in Stockholm. I've also written a game engine's lighting system and a contrarian trading bot. I like starting things, and I like shipping them end to end.",
    "Outside the terminal you'll find me at a tennis court, in the mountains, or at the sea.",
  ],
  /**
   * These links are the site's `sameAs` edges, which is to say they are the
   * evidence that the person described here is the same person found elsewhere.
   * That makes an empty profile actively harmful rather than merely useless: an
   * engine that follows the edge and finds a blank page learns the opposite of
   * what the field is for, and this is the same reasoning `knowsAbout` below is
   * already held to.
   *
   * `github.com/oreillyfergus` was listed here and was removed on 2026-08-21.
   * Checked against the GitHub API rather than assumed: zero public
   * repositories, zero followers, no display name, no linked site. It was the
   * Presterly-era account and its work was never public. Worse, it was labelled
   * "github (work)", so every engine reading `/llms.txt` was being pointed at
   * the empty one in preference to the one with the code on it.
   *
   * The other half of this is off-site and is Fergus's to do: setting the
   * display name and the website field on the remaining account is what makes
   * the link reciprocal, and a one-directional identity claim is the weaker
   * half of a pair.
   */
  contact: [
    { label: "email", value: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    {
      label: "github",
      value: "github.com/fergo5002",
      href: "https://github.com/fergo5002",
    },
    {
      label: "linkedin",
      value: "in/patrickfergusoreilly",
      href: "https://www.linkedin.com/in/patrickfergusoreilly/",
    },
  ],
  portrait: "/img/portrait.jpg",
  jobTitle: "Technical Founder",
  // Every entry here is evidenced somewhere on the site: a venture, a project,
  // or an article. An answer engine that follows this edge and finds nothing
  // behind it learns the opposite of what the field is for.
  knowsAbout: [
    "Software engineering",
    "Startups",
    "Shopify app development",
    "Multi-tenant SaaS architecture",
    "TypeScript",
    "Next.js",
    "PostgreSQL",
    "AI coding agents",
    "Booking and payments systems",
    "WebGL and motion design",
  ],
  booking: "",
  bookingSubject: "Hello from fergusoreilly.dev",
};
