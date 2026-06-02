export type SkillGroup = {
  label: string;
  items: string[];
};

export const skills: SkillGroup[] = [
  { label: "languages", items: ["TypeScript", "JavaScript", "Python", "Java", "C", "SQL", "Bash", "ARM Assembly"] },
  { label: "frameworks", items: ["React", "Next.js", "Node.js", "Fastify", "FastAPI", "Phaser 3"] },
  { label: "data & infra", items: ["PostgreSQL", "Redis", "Supabase", "pgvector", "BullMQ", "Stripe", "WebSockets"] },
  { label: "ai", items: ["OpenAI API", "Anthropic API", "Google Gemini", "Vercel AI SDK", "semantic search (pgvector)"] },
  { label: "graphics", items: ["Phaser 3", "GLSL / WebGL shaders"] },
  { label: "tools", items: ["Git", "GitHub", "Docker", "Vercel", "Railway", "Playwright", "Vitest"] },
  { label: "spoken", items: ["English (native)", "French (advanced)"] },
];
