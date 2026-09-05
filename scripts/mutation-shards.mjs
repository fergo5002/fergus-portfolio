/** Deterministic partitioning: every catalogue entry belongs to exactly one job. */
export function selectShard(cases, shard) {
  if (shard === undefined) return cases;
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  if (!match) throw new Error("Use --shard PART/TOTAL, for example 1/4");
  const part = Number(match[1]), total = Number(match[2]);
  if (part > total || total > 32) throw new Error("Invalid mutation shard");
  return cases.filter((_, index) => index % total === part - 1);
}
