/**
 * Proves the three stores answer, printing nothing that could be a secret.
 *
 * Run from the repo root with the variables in the environment:
 *
 *     set -a; . ./.env.local; set +a; node scripts/store-check.mjs
 *
 * Exit code 0 means every configured store answered. A store with no variable
 * set prints "not configured" and does not fail the run, because a laptop
 * without a Blob token is a normal state and this is a check, not a gate. A
 * store that is configured and does not answer fails the run: that is the
 * state that would take a live tool down.
 *
 * Every error message passes through `redact` before it is printed, so a
 * driver that echoes the connection string on a bad password cannot echo it
 * here. Two Redis commands (PING, DBSIZE) are spent per run.
 */
import { Redis } from "@upstash/redis";
import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";

const SECRET_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
  "KV_URL",
  "REDIS_URL",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PASSWORD",
  "PGPASSWORD",
  "BLOB_READ_WRITE_TOKEN",
  "RESEND_API_KEY",
];

function redact(text) {
  let out = String(text);
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join(`<${name}>`);
  }
  return out;
}

async function check(name, configured, run) {
  if (!configured) {
    console.log(`${name}: not configured`);
    return true;
  }
  try {
    console.log(`${name}: ${await run()}`);
    return true;
  } catch (error) {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`${name}: FAILED ${redact(text)}`);
    return false;
  }
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const results = await Promise.all([
  check("redis", Boolean(redisUrl && redisToken), async () => {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const pong = await redis.ping();
    const size = await redis.dbsize();
    return `${pong}, ${size} keys`;
  }),
  check("neon", Boolean(process.env.DATABASE_URL), async () => {
    const sql = neon(process.env.DATABASE_URL);
    const [{ version }] = await sql`select version()`;
    await sql`create extension if not exists vector`;
    const [{ extversion }] = await sql`select extversion from pg_extension where extname = 'vector'`;
    return `${version.split(" on ")[0]}, vector ${extversion}`;
  }),
  check("blob", Boolean(process.env.BLOB_READ_WRITE_TOKEN), async () => {
    const { blobs } = await list({ limit: 1 });
    return blobs.length === 0 ? "reachable, empty" : "reachable, has blobs";
  }),
]);

if (!results.every(Boolean)) process.exitCode = 1;
