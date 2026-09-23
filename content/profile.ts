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
  // One line on desktop with room to spare, and shorter than the version it
  // replaced. "CS @ Trinity" used to sit in the middle segment and was cut, not
  // lost: the education line renders directly beneath this and already says
  // Trinity.
  tagline: "I build things. Then I scale them.",
  location: "Dublin, Ireland",
  education: "BA Computer Science & Business @ Trinity College Dublin · 1.1",
  /**
   * Three short paragraphs, cut from five long ones on 2026-09-13 because
   * Fergus read the old version and said it was too much to read. The first
   * one is load bearing twice over: `lib/seo.ts` publishes it as the Person
   * node's `description` and it is the first thing under `cat about.txt`, so
   * it has to survive being read on its own, at about 150 characters, without
   * the two beneath it.
   */
  bio: [
    "I build software that grows businesses. Right now that's Tigh Sauna: operations and growth solutions for saunas, built bespoke in collaboration with them.",
    "Third year Computer Science and Business at Trinity, 1.1 so far, building full time alongside it. Before this: CTO at Presterly, founding engineer at Loira AI in Stockholm.",
    "Otherwise: a tennis court, the mountains, or the sea.",
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
