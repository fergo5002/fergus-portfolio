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
    "Right now that mostly means Presterly, where I'm co-founder and CTO. We work out when a Shopify brand's customers are about to run out of what they bought, then reach them over SMS and WhatsApp at that moment. It's live across 34 merchant brands, with 426,000 customers under management and over €20M of order history analysed.",
    "I'm in third year of Computer Science and Business at Trinity College Dublin, on a 1.1 across first and second year.",
    "Before Presterly I was a founding engineer at Loira AI in Stockholm, building an AI execution layer for project management. I've also written a game engine's lighting system, a contrarian trading bot, and a booking and payments platform for saunas. I like starting things, and I like shipping them end to end.",
    "Outside the terminal you'll find me at a tennis court, in the mountains, or at the sea.",
  ],
  contact: [
    { label: "email", value: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    {
      label: "github (work)",
      value: "github.com/oreillyfergus",
      href: "https://github.com/oreillyfergus",
    },
    {
      label: "github (personal)",
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
};
