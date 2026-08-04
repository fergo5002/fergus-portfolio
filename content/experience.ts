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
    id: "presterly",
    org: "Presterly",
    role: "Co-Founder & CTO",
    dates: "May 2026 – Present",
    location: "Dublin, Ireland",
    isNew: true,
    summary:
      "Done-for-you retention for consumable Shopify brands, built inside the Hatch105 accelerator: predict each customer's run-out, nudge them over SMS and WhatsApp, convert with a one-tap pre-seeded checkout.",
    bullets: [
      "Took Presterly from first commit (12 June 2026) to live merchant brands in six weeks, inside Hatch105, the Dublin startup accelerator.",
      "Built the multi-tenant platform end to end: Shopify and Klaviyo integrations, token-on-order attribution, and a per-customer, per-product run-out prediction engine backtested against real order history.",
      "Live today across 34 merchant brands: 426,000 customers under management, over €20M of order history analysed, and roughly 296,000 run-out predictions kept current.",
      "Took Presterly through Meta's approval as a WhatsApp Business Platform Tech Provider, so a merchant onboards its own number through Embedded Signup and keeps ownership of it.",
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
      "AI startup building an autonomous execution layer for project management, selected into SSE Business Lab at the Stockholm School of Economics.",
    bullets: [
      "Founding engineer on a platform that turns signals from meetings, email, and chat into tracked, actioned work, replacing manual coordination.",
      "Architected the platform as a TypeScript monorepo (Next.js frontend, Fastify API, BullMQ worker pipeline, PostgreSQL, Redis), integrating LLMs for real-time task extraction and status inference.",
      "Drove the company's selection into SSE Business Lab, the Stockholm School of Economics' startup incubator, and set the founding team's engineering workflows, code review standards, and CI/CD.",
      "Shipped Slack, Google Calendar, and email integrations for live signal ingestion.",
    ],
    link: { label: "loira.ai", href: "https://loira.ai" },
  },
  {
    id: "tsmf",
    org: "Trinity Student Managed Fund",
    role: "Junior Analyst, Tech Hardware",
    dates: "2024 – 2025",
    location: "Dublin, Ireland",
    bullets: [
      "Analysed semiconductor and tech-hardware equities for a student fund with AUM > €700,000 using quantitative and qualitative valuation frameworks.",
      "Led an inter-sector pitch team, building and presenting investment theses to fund leadership.",
    ],
  },
];
