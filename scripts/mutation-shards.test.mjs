import { test } from "node:test";
import assert from "node:assert/strict";
import { selectShard } from "./mutation-shards.mjs";
test("four mutation jobs cover every case exactly once", () => {
  const cases = Array.from({ length: 198 }, (_, i) => i);
  const shards = [1, 2, 3, 4].map(part => selectShard(cases, `${part}/4`));
  assert.deepEqual(shards.flat().sort((a, b) => a - b), cases);
  assert.equal(new Set(shards.flat()).size, cases.length);
  assert.ok(shards.every(shard => shard.length >= 49 && shard.length <= 50));
});
test("ordinary runs retain the complete catalogue", () => {
  const cases = [1, 2, 3]; assert.deepEqual(selectShard(cases), cases);
});
test("invalid shard requests fail instead of silently skipping guards", () => {
  for (const shard of ["", "0/4", "5/4", "1/0", "one/four", "1/4/trailing", "1/33"])
    assert.throws(() => selectShard([1, 2, 3], shard));
});
