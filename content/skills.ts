export type SkillGroup = {
  label: string;
  items: string[];
};

export const skills: SkillGroup[] = [
  { label: "languages", items: ["TypeScript", "Python", "Java", "C", "SQL", "ARM Assembly"] },
  { label: "frameworks", items: ["React", "Next.js", "Node.js", "Fastify", "FastAPI"] },
  { label: "data & infra", items: ["PostgreSQL", "Redis", "Supabase", "BullMQ", "Docker", "WebSockets"] },
  { label: "ai", items: ["OpenAI API", "Anthropic API", "semantic search (pgvector)"] },
  { label: "graphics", items: ["Phaser 3", "GLSL / WebGL shaders"] },
  { label: "tools", items: ["Git", "Vercel"] },
  { label: "spoken", items: ["English (native)", "French (advanced)"] },
  { label: "interests", items: ["Poker (probability & game theory)", "Cuisine", "Gaelic football"] },
];
