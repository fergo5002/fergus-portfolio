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
    id: "hatch105",
    org: "Hatch105 × HappyStack",
    // TODO: replace with your confirmed title + dates.
    role: "[ ROLE — TBC ]",
    dates: "[ DATES — TBC ]",
    location: "Dublin, Ireland",
    isNew: true,
    summary:
      "Building software for ecommerce within the Hatch105 accelerator, in collaboration with HappyStack.",
    bullets: [
      "Joined the Hatch105 accelerator working alongside HappyStack to build software for ecommerce.",
      "[ Add the specifics of your role and what you're building once confirmed. ]",
    ],
  },
  {
    id: "larry",
    org: "Larry",
    role: "CTO & Co-Founder",
    dates: "Feb 2025 – Present",
    location: "Dublin, Ireland",
    bullets: [
      "Co-founded a pre-seed AI startup building an autonomous execution layer for project management — replacing manual coordination with intelligent automation across meetings, email, and chat. Live at larry-pm.com.",
      "Architected and built the full platform as a TypeScript monorepo: Next.js frontend, Fastify v5 API, BullMQ worker pipeline, PostgreSQL, and Redis, integrating LLMs for real-time task extraction and status inference.",
      "Led a team of 3 engineers through agile sprints — establishing development workflows, code-review standards, and CI/CD to ship an investor-ready MVP on deadline.",
      "Designed and shipped Slack, Google Calendar, and email integrations enabling live signal ingestion from enterprise communication tools.",
    ],
    link: { label: "larry-pm.com", href: "https://larry-pm.com" },
  },
  {
    id: "tsmf",
    org: "Trinity Student Managed Fund",
    role: "Junior Analyst — Tech Hardware",
    dates: "2024 – 2025",
    location: "Dublin, Ireland",
    bullets: [
      "Analysed semiconductor and tech-hardware equities for a student fund with AUM > €700,000 using quantitative and qualitative valuation frameworks.",
      "Led an inter-sector pitch team, building and presenting investment theses to fund leadership.",
    ],
  },
];
