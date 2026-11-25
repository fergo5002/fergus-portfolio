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
    id: "stealth",
    org: "Stealth",
    role: "Building in stealth",
    dates: "Oct 2026 to Present",
    location: "Ireland",
    bullets: [],
  },
  {
    id: "tigh-sauna",
    org: "Tigh Sauna",
    role: "Ex-co-founder & CTO",
    dates: "Aug 2026 to Oct 2026",
    location: "Dublin, Ireland",
    summary: "The operating and growth layer for saunas.",
    bullets: [
      "I built the backend and the platform: bookings, payments, customers, and the messaging that brings them back.",
      "Every site and system was built with the saunas themselves.",
    ],
    link: { label: "tighsauna.com", href: "https://tighsauna.com" },
  },
  {
    id: "hatch105",
    org: "Hatch105",
    role: "Technical founder",
    dates: "Jun 2026 to Aug 2026",
    location: "Dublin, Ireland",
    summary:
      "A ten-week accelerator founded by Jack Pierse, co-founder of Wayflyer and HappyStack. 1,700 applied and I was one of nine.",
    bullets: [
      "One goal: $10k in monthly revenue by week ten. No time to build first and sell later, so we did both at once.",
      "We might not have reached the number... but I learned more at Hatch than anywhere or anything I had done before and that was the real value. #Hatch",
    ],
    link: { label: "hatch105.com", href: "https://hatch105.com" },
  },
  {
    id: "presterly",
    org: "Presterly",
    role: "Co-Founder & CTO",
    dates: "May 2026 to Aug 2026",
    location: "Dublin, Ireland",
    summary:
      "Predictive reorder messaging for Shopify brands, built inside the Hatch105 accelerator in Dublin.",
    bullets: [
      "We went from idea to paying customers in 5 weeks. I built the platform end to end.",
      "34 stores, 423,000 customers, nearly €19M of order history analysed.",
    ],
    link: { label: "presterly.com", href: "https://presterly.com" },
  },
  {
    id: "loira",
    org: "Loira AI (formerly Larry)",
    role: "Founding Engineer",
    dates: "Feb 2026 to Jun 2026",
    location: "Stockholm, Sweden",
    summary:
      "AI project management: turns what gets said in meetings, email and chat into tracked work.",
    bullets: [
      "Founding engineer. Next.js, Fastify, BullMQ, Postgres and Redis, with LLMs pulling the tasks out.",
      "Drove our selection into SSE Business Lab at the Stockholm School of Economics.",
    ],
    link: { label: "loira.ai", href: "https://loira.ai" },
  },
];
