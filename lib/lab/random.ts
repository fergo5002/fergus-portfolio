export function random(seed: number) {
  let a = seed | 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function bounded(n: number, min: number, max: number, label = "Value") {
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}
