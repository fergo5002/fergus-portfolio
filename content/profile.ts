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
    "I'm a builder. I co-founded Larry, where I'm the technical founder — I architected and built the whole platform and lead a small engineering team shipping an AI execution layer for project management.",
    "I'm in my third year of Computer Science & Business at Trinity College Dublin, holding a 1.1 average across first and second year and sitting the Foundation Scholarship examinations.",
    "I like shipping real things end-to-end: AI products, a game engine's lighting system, contrarian trading bots — and now ecommerce software at the Hatch105 accelerator.",
    "Outside the terminal you'll find me at a poker table, in the kitchen, or on a Gaelic football pitch.",
  ],
  contact: [
    { label: "email", value: "oreillferg@gmail.com", href: "mailto:oreillferg@gmail.com" },
    { label: "github", value: "github.com/fergo5002", href: "https://github.com/fergo5002" },
    {
      label: "linkedin",
      value: "in/patrickfergusoreilly",
      href: "https://www.linkedin.com/in/patrickfergusoreilly/",
    },
  ],
  portrait: "",
};
