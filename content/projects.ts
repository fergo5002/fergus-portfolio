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
   * Public path to the card image, e.g. "/img/larry.png".
   * Leave as "" to fall back to a procedural SignalPlate alignment card.
   */
  image: string;
  /**
   * Accessible description of that image. Required whenever `image` is set,
   * because these are not all screenshots — some are brand marks and some are
   * authored illustrations, and calling a logo a screenshot on a portfolio is a
   * factual claim about your own work.
   */
  imageAlt?: string;
};

export const projects: Project[] = [
  {
    slug: "tigh-sauna",
    title: "Tigh Sauna",
    tagline: "Running a sauna shouldn't be admin. Bookings, payments and customers in one place.",
    role: "Co-Founder, Engineering",
    year: "2026 – Present",
    bullets: [
      "One system a venue actually runs on: take a booking, take the money, know who turned up, and get them back again. Quick to set up, and nothing to wire together.",
      "Each venue's storefront is on Shopify, so they sell from day one, and the booking, the diary and the customer record all follow from the order without anyone retyping it.",
    ],
    stack: ["Next.js", "TypeScript", "Fastify", "PostgreSQL", "Supabase", "Shopify", "Railway", "Vercel"],
    links: [{ label: "live", href: "https://tighsauna.com" }],
    image: "/img/tigh-sauna.png",
    imageAlt: "The Tigh Sauna wordmark in steam teal, above the line 'booking and operations for saunas'",
  },
  {
    slug: "presterly",
    title: "Presterly",
    tagline: "Never miss a reorder: predictive retention for consumable Shopify brands.",
    role: "Co-Founder & CTO",
    year: "2026",
    bullets: [
      "Predicted when each customer would run out of each product, then reached them over SMS or WhatsApp at that moment with a one-tap pre-seeded checkout.",
      "Multi-tenant engine that reached 34 Shopify stores holding 423,000 customers, with nearly €19M of order history analysed. Wound down in August 2026.",
    ],
    stack: ["TypeScript", "React Router 7", "Prisma", "PostgreSQL", "Shopify", "Klaviyo", "Twilio", "Railway"],
    links: [{ label: "live", href: "https://presterly.com" }],
    image: "/img/presterly.png",
    imageAlt: "The Presterly logo mark",
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
    image: "/img/loira.png",
    imageAlt: "The Loira AI logo mark, a looping letter L",
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
    image: "/img/remand.png",
    imageAlt: "Illustration: a list of forum threads with vote counts, clustering into one rising demand signal",
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
    image: "/img/under-the-campanile.jpg",
    imageAlt: "Gameplay screenshot: Trinity College Front Square at night, the Campanile lit by a lamppost",
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
    image: "/img/contrabot.png",
    imageAlt: "Illustration: candlesticks falling while a crowd-sentiment line climbs against them",
  },
];
