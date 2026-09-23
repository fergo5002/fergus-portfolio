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
    tagline: "Operations & Growth solutions for Saunas",
    role: "Co-Founder, Engineering",
    year: "2026 – Present",
    bullets: [
      "Every site and system is built bespoke in collaboration with saunas.",
      "Built to be the last software your sauna needs, helping you run the day-to-day and bring guests back.",
    ],
    stack: ["Next.js", "TypeScript", "Fastify", "PostgreSQL", "Supabase", "Shopify", "Railway", "Vercel"],
    links: [{ label: "live", href: "https://tighsauna.com" }],
    image: "/img/tigh-sauna.png",
    imageAlt:
      "The new Tigh wordmark beside the brass ribbon sculpture from tighsauna.com, on evergreen",
  },
  {
    slug: "presterly",
    title: "Presterly",
    tagline: "Predictive reorder messaging for Shopify brands. SMS and WhatsApp, one-tap checkout.",
    role: "Co-Founder & CTO",
    year: "2026",
    bullets: [
      "34 stores, 423,000 customers, nearly €19M of order history analysed.",
      "Wound down in August 2026.",
    ],
    stack: ["TypeScript", "React Router 7", "Prisma", "PostgreSQL", "Shopify", "Klaviyo", "Twilio", "Railway"],
    links: [{ label: "live", href: "https://presterly.com" }],
    image: "/img/presterly.png",
    imageAlt: "The Presterly logo mark",
  },
  {
    slug: "loira",
    title: "Loira AI (Larry)",
    tagline: "AI project management. Turns what gets said in meetings into tracked work.",
    role: "Founding Engineer",
    year: "Feb – Jun 2026",
    bullets: [
      "Founding engineer in Stockholm. I built the pipeline that reads the meeting and files the work.",
    ],
    stack: ["TypeScript", "Next.js", "Fastify", "BullMQ", "PostgreSQL", "Redis", "LLMs"],
    links: [{ label: "live", href: "https://loira.ai" }],
    image: "/img/loira.png",
    imageAlt: "The Loira AI logo mark, a looping letter L",
  },
  {
    slug: "remand",
    title: "Remand",
    tagline: "Finds the market demand hiding in online noise.",
    role: "Full-stack / AI",
    year: "HackEurope 2026",
    bullets: [
      "Semantic search over scattered discussion, with an agent that turns the signal into positioning.",
    ],
    stack: ["Next.js", "React 19", "FastAPI", "Supabase", "pgvector", "OpenAI", "Anthropic"],
    links: [{ label: "live", href: "https://nybblers.vercel.app" }],
    image: "/img/remand.png",
    imageAlt: "Remand illustration: Reddit questions about lost notes and chasing updates converge on a positioning idea, Handover without the chase",
  },
  {
    slug: "under-the-campanile",
    title: "Under the Campanile",
    tagline: "A dungeon crawler under Trinity's Campanile.",
    role: "Shaders & Lighting Engineer",
    year: "TCD × Qualcomm",
    bullets: [
      "I wrote the lighting: dynamic lights, shadow casting, custom GLSL.",
      "Team of 8, mentored by a Qualcomm graphics engineer.",
    ],
    stack: ["TypeScript", "Phaser 3", "GLSL", "WebGL"],
    links: [],
    image: "/img/under-the-campanile.jpg",
    imageAlt: "Gameplay screenshot: Trinity College Front Square at night, the Campanile lit by a lamppost",
  },
  {
    slug: "contrabot",
    title: "ContraBot",
    tagline: "A trading bot that fades the crowd.",
    role: "Personal project",
    bullets: [
      "Reads Reddit sentiment with Claude, inverts it, paper trades through Alpaca.",
    ],
    stack: ["Python", "Anthropic API", "Alpaca"],
    links: [],
    image: "/img/contrabot.png",
    imageAlt: "Illustration: candlesticks falling while a crowd-sentiment line climbs against them",
  },
];
