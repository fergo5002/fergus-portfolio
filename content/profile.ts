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
  tagline: "Technical Founder · CS @ Trinity · Builder",
  location: "Dublin, Ireland",
  education:
    "BA Computer Science (Major) & Business (Minor) @ Trinity College Dublin — First Class Honours (1.1)",
  bio: [
    "I'm a builder. I'm co-founder and CTO of Presterly, built inside the Hatch105 accelerator: we keep customers of consumable Shopify brands reordering by predicting when each one will run out of each product, then nudging them over SMS and WhatsApp at exactly that moment. Six weeks after first commit it's live with seven merchant brands and over 127,000 customers under management.",
    "I'm in my third year of Computer Science & Business at Trinity College Dublin, holding a 1.1 average across first and second year.",
    "Before Presterly I was a founding engineer at Loira AI (SSE Business Lab, Stockholm), building an AI execution layer for project management. I like shipping real things end-to-end: AI products, a game engine's lighting system, contrarian trading bots.",
    "Outside the terminal you'll find me at a tennis court, in the mountains, or at the sea.",
  ],
  contact: [
    { label: "email", value: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    { label: "github", value: "github.com/oreillyfergus", href: "https://github.com/oreillyfergus" },
    {
      label: "linkedin",
      value: "in/patrickfergusoreilly",
      href: "https://www.linkedin.com/in/patrickfergusoreilly/",
    },
  ],
  portrait: "/img/portrait.jpg",
};
