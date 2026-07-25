export type ProjectLink = {
  label: string;
  href: string;
};

export type Project = {
  slug: string;
  title: string;
  tagline: string;
  role: string;
  year?: string;
  bullets: string[];
  stack: string[];
  links: ProjectLink[];
  /**
   * Public path to a screenshot, e.g. "/img/larry.png".
   * Leave as "" to show a placeholder box until you add the file.
   */
  image: string;
};

export const projects: Project[] = [
  {
    slug: "presterly",
    title: "Presterly",
    tagline: "Never miss a reorder: predictive retention for consumable Shopify brands.",
    role: "Co-Founder & CTO",
    year: "2026 – Present",
    bullets: [
      "Predicts when each customer will run out of each product, then nudges them over SMS or WhatsApp at exactly that moment with a one-tap pre-seeded checkout.",
      "Multi-tenant engine live on seven merchant brands: 127,000 customers under management, over €18M of order history analysed, ~240,000 predictions refreshed daily.",
    ],
    stack: ["TypeScript", "React Router", "Prisma", "PostgreSQL", "Shopify", "Klaviyo", "Railway"],
    links: [{ label: "live", href: "https://presterly.com" }],
    image: "",
  },
  {
    slug: "loira",
    title: "Loira AI (Larry)",
    tagline: "AI-native project management: an autonomous execution layer for teams.",
    role: "Founding Engineer",
    year: "Feb – Jun 2026",
    bullets: [
      "Turns signals from meetings, email, and chat into tracked, assigned work, replacing manual coordination with intelligent automation.",
      "TypeScript monorepo: Next.js frontend, Fastify API, BullMQ workers, PostgreSQL + Redis, with LLMs driving task extraction and status inference.",
    ],
    stack: ["TypeScript", "Next.js", "Fastify", "BullMQ", "PostgreSQL", "Redis", "LLMs"],
    links: [{ label: "live", href: "https://loira.ai" }],
    image: "",
  },
  {
    slug: "remand",
    title: "Remand",
    tagline: "Where ideas meet discussion: AI market intelligence from online noise.",
    role: "Full-stack / AI",
    year: "HackEurope 2026",
    bullets: [
      "Surfaces high-intent market opportunities from scattered online discussion using semantic search and growth-momentum mapping.",
      "An embedded AI agent synthesises demand signals into positioning, feature ideas, and go-to-market angles.",
    ],
    stack: ["Next.js", "React 19", "FastAPI", "Supabase", "pgvector", "OpenAI", "Anthropic"],
    links: [{ label: "live", href: "https://nybblers.vercel.app" }],
    image: "",
  },
  {
    slug: "under-the-campanile",
    title: "Under the Campanile",
    tagline: "A procedurally generated dungeon crawler beneath Trinity's Campanile.",
    role: "Shaders & Lighting Engineer",
    year: "TCD × Qualcomm",
    bullets: [
      "Top-down roguelike built from scratch in a team of 8, mentored by a Qualcomm staff engineer specialising in graphics commercialisation.",
      "Implemented dynamic lighting, shadow casting, and custom GLSL shader effects in a TypeScript engine on Phaser 3.",
    ],
    stack: ["TypeScript", "Phaser 3", "GLSL", "WebGL"],
    links: [],
    image: "",
  },
  {
    slug: "sauna-os",
    title: "Sauna OS",
    tagline: "Booking and operations platform for modern sauna businesses.",
    role: "Founder / Engineer",
    bullets: [
      "Multi-tenant booking and operations system with memberships and native upsells.",
      "Stripe Connect payments so each venue gets paid directly.",
    ],
    stack: ["Next.js", "TypeScript", "Supabase", "Stripe Connect"],
    links: [],
    image: "",
  },
  {
    slug: "contrabot",
    title: "ContraBot",
    tagline: "A contrarian trading bot that fades the crowd.",
    role: "Personal project",
    bullets: [
      "Monitors Reddit sentiment via the Anthropic Claude API, inverts crowd signals, and executes paper trades through Alpaca.",
      "Position management and P&L tracking, with a backtest and dry-run harness.",
    ],
    stack: ["Python", "Anthropic API", "Alpaca"],
    links: [],
    image: "",
  },
];
