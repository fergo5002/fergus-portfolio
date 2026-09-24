export type ExperienceLink = {
  label: string;
  href: string;
};

export type ExperienceEntry = {
  id: string;
  org: string;
  role: string;
  dates: string;
  location?: string;
  /** Shows an amber NEW badge when true. */
  isNew?: boolean;
  summary?: string;
  bullets: string[];
  link?: ExperienceLink;
};

export const experience: ExperienceEntry[] = [
  {
    id: "tigh-sauna",
    org: "Tigh Sauna",
    role: "Co-Founder, Engineering",
    dates: "Aug 2026 – Present",
    location: "Dublin, Ireland",
    summary: "Operations & Growth solutions for Saunas",
    bullets: [
      "I own the backend and the platform: bookings, payments, customers, and the messaging that brings them back.",
      "Merged three codebases into one product, one database, one login.",
      "Every site and system is built bespoke in collaboration with saunas.",
    ],
    link: { label: "tighsauna.com", href: "https://tighsauna.com" },
  },
  {
    id: "hatch105",
    org: "Hatch105",
    role: "Technical founder",
    dates: "Jun 2026 – Aug 2026",
    location: "Dublin, Ireland",
    summary:
      "A ten-week accelerator founded by Jack Pierse, co-founder of Wayflyer and HappyStack. 1,700 applied and I was one of nine.",
    bullets: [
      "One goal: $10k in monthly revenue by week ten. No time to build first and sell later, so we did both at once.",
      "We missed the number, but chasing it got Presterly from first commit to live merchants in six weeks.",
    ],
  },
  {
    id: "presterly",
    org: "Presterly",
    role: "Co-Founder & CTO",
    dates: "May 2026 – Aug 2026",
    location: "Dublin, Ireland",
    summary:
      "Predictive reorder messaging for Shopify brands, built inside the Hatch105 accelerator in Dublin.",
    bullets: [
      "First commit to first live merchants in six weeks. I built the platform end to end.",
      "34 stores, 423,000 customers, nearly €19M of order history analysed.",
      "Approved by Meta as a WhatsApp Business Platform Tech Provider, so a merchant kept its own number.",
      "We wound it down in August 2026. Founder-product fit, not the technology, and I wrote about why.",
    ],
    link: { label: "presterly.com", href: "https://presterly.com" },
  },
  {
    id: "loira",
    org: "Loira AI (formerly Larry)",
    role: "Founding Engineer",
    dates: "Feb 2026 – Jun 2026",
    location: "Stockholm, Sweden",
    summary:
      "AI project management: turns what gets said in meetings, email and chat into tracked work.",
    bullets: [
      "Founding engineer. Next.js, Fastify, BullMQ, Postgres and Redis, with LLMs pulling the tasks out.",
      "Drove our selection into SSE Business Lab at the Stockholm School of Economics.",
      "Shipped the Slack, Calendar and email integrations, and set the team's code review and CI/CD.",
    ],
    link: { label: "loira.ai", href: "https://loira.ai" },
  },
];
