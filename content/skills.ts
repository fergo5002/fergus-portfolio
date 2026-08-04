export type SkillGroup = {
  label: string;
  items: string[];
};

/**
 * Grounded in what is actually in the repos, not in what sounds good. Checked
 * 2026-08-04 against the dependency manifests and source of renovo-app
 * (Presterly), sauna-os, firespark and hearth. Shopify Polaris is deliberately
 * absent: only its types package is installed, nothing in `app/` uses it, and
 * an interviewer can open the repo.
 */
export const skills: SkillGroup[] = [
  {
    label: "languages",
    items: ["TypeScript", "JavaScript", "Python", "Java", "C", "SQL", "Bash", "ARM Assembly"],
  },
  {
    label: "frameworks",
    items: ["React", "Next.js", "React Router 7", "Node.js", "Tailwind CSS", "Fastify", "FastAPI"],
  },
  {
    label: "commerce & messaging",
    items: [
      "Shopify (App Bridge, Admin GraphQL)",
      "Klaviyo",
      "WhatsApp Business Platform",
      "Twilio",
      "Stripe Connect",
    ],
  },
  {
    label: "data & infra",
    items: [
      "PostgreSQL",
      "Prisma",
      "Kysely",
      "Supabase",
      "Redis",
      "pgvector",
      "BullMQ",
      "WebSockets",
    ],
  },
  {
    label: "ai",
    items: [
      "Anthropic API",
      "OpenAI API",
      "Google Gemini",
      "Vercel AI SDK",
      "semantic search (pgvector)",
    ],
  },
  { label: "graphics", items: ["Phaser 3", "GLSL / WebGL shaders"] },
  {
    label: "tools",
    items: ["Git", "Docker", "Vercel", "Railway", "Vitest", "Playwright", "Zod"],
  },
  { label: "spoken", items: ["English (native)", "French (advanced)"] },
];
