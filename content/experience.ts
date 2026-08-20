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
    isNew: true,
    summary:
      "Running a sauna shouldn't be admin. Tigh Sauna takes it off them: bookings, payments and customers in one place, quick to set up, and built so people come back.",
    bullets: [
      "Co-founded with Connell Kennelly. He owns design and the business side, I own the backend and the platform.",
      "Built the whole thing: one booking and operations system every venue runs on, with each venue's storefront on Shopify so they take money the day they open.",
      "Merged three separate codebases into one product, one database and one login, so a venue signs in once and the software stops behaving like three tools stapled together.",
      "Being built with two Irish sauna businesses rather than in a vacuum, which is why the awkward parts got found early.",
    ],
    link: { label: "tighsauna.com", href: "https://tighsauna.com" },
  },
  {
    id: "presterly",
    org: "Presterly",
    role: "Co-Founder & CTO",
    dates: "May 2026 – Aug 2026",
    location: "Dublin, Ireland",
    summary:
      "Done-for-you retention for consumable Shopify brands, built inside the Hatch105 accelerator: predict each customer's run-out, nudge them over SMS and WhatsApp, convert with a one-tap pre-seeded checkout. Wound down in August 2026.",
    bullets: [
      "Took Presterly from first commit (12 June 2026) to its first live merchant brands in six weeks, inside Hatch105, the Dublin startup accelerator.",
      "Built the multi-tenant platform end to end: Shopify and Klaviyo integrations, token-on-order attribution, and a per-customer, per-product run-out prediction engine backtested against real order history.",
      "Reached 34 Shopify stores holding 423,000 customers between them, with nearly €19M of order history analysed.",
      "Took Presterly through Meta's approval as a WhatsApp Business Platform Tech Provider, so a merchant onboarded its own number through Embedded Signup and kept ownership of it.",
      "We wound it down in August 2026. The honest reason is founder-product fit rather than the technology, and I've written about it.",
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
