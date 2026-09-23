import assert from "node:assert/strict";

const base = process.env.LAB_URL || "http://localhost:3000";
const canonical = "https://fergusoreilly.dev";
const slugs = ["atlas", "group-lore", "pocket-redact", "prove-it", "resonance"];
async function read(path, status = 200) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, status, path);
  return response.text();
}
const [index, sitemap, llms] = await Promise.all([read("/tools"), read("/sitemap.xml"), read("/llms.txt")]);
for (const slug of slugs) {
  const path = `/tools/${slug}`;
  assert.equal(index.includes(`href="${path}"`), slug !== "prove-it", `${slug} follows the curated board selection`);
  assert.ok(sitemap.includes(`${canonical}${path}`), `${slug} is in the sitemap`);
  assert.ok(llms.includes(`${canonical}${path}`), `${slug} is in the agent index`);
  const html = await read(path);
  assert.ok(html.includes(`rel="canonical" href="${canonical}${path}"`), `${slug} canonical`);
  assert.ok(!/<meta[^>]+name="robots"[^>]+noindex/.test(html), `${slug} permits indexing`);
  const schema = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
  assert.ok(schema.some(s => JSON.stringify(s).includes('WebApplication') && JSON.stringify(s).includes(`${canonical}${path}`)), `${slug} structured data`);
  assert.ok(html.includes('data-studio-host'), `${slug} has its workbench`);
  assert.ok(html.includes('<noscript>'), `${slug} explains the JavaScript requirement`);
}
assert.ok(!sitemap.includes('/lab'), 'experiments stay outside the sitemap');
await read('/lab', 404);
await read('/lab/atlas', 404);
console.log('Five public studios: curated board, canonical metadata and discovery pass; local lab remains closed.');
