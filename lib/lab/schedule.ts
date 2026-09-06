import { bounded, random } from "./random";
export type Player = { id: string; name: string; skill: number };
export type Round = { matches: { a: string[]; b: string[] }[]; rest: string[] };
export function scheduleDoubles(
  players: Player[],
  courts: number,
  total: number,
  preserved: Round[] = [],
  seed = 1,
): Round[] {
  bounded(players.length, 4, 40, "Players");
  bounded(courts, 1, 10, "Courts");
  bounded(total, 1, 20, "Rounds");
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("Player IDs must be unique.");
  const active =
      Math.min(Math.floor(courts), Math.floor(players.length / 4)) * 4,
    rng = random(seed),
    counts = new Map(players.map((p) => [p.id, 0])),
    pairs = new Map<string, number>(),
    opponents = new Map<string, number>(),
    rounds = [...preserved];
  const pair = (a: string, b: string) => [a, b].sort().join("|");
  const record = (r: Round) =>
    r.matches.forEach((m) => {
      [...m.a, ...m.b].forEach((id) =>
        counts.set(id, (counts.get(id) ?? 0) + 1),
      );
      [m.a, m.b].forEach((t) =>
        pairs.set(pair(t[0], t[1]), (pairs.get(pair(t[0], t[1])) ?? 0) + 1),
      );
      m.a.forEach((a) =>
        m.b.forEach((b) =>
          opponents.set(pair(a, b), (opponents.get(pair(a, b)) ?? 0) + 1),
        ),
      );
    });
  preserved.forEach(record);
  while (rounds.length < total) {
    const selected = players
      .map((p) => ({ ...p, tie: rng() }))
      .sort(
        (a, b) =>
          (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.tie - b.tie,
      )
      .slice(0, active);
    let best: Round["matches"] = [],
      bestCost = Infinity;
    for (let attempt = 0; attempt < 160; attempt++) {
      const order = selected
        .map((p) => ({ p, r: rng() }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.p);
      let cost = 0;
      const matches: Round["matches"] = [];
      for (let i = 0; i < order.length; i += 4) {
        const [a, b, c, d] = order.slice(i, i + 4);
        cost +=
          20 *
            ((pairs.get(pair(a.id, b.id)) ?? 0) +
              (pairs.get(pair(c.id, d.id)) ?? 0)) +
          Math.abs(a.skill + b.skill - c.skill - d.skill) * 2;
        [a, b].forEach((x) =>
          [c, d].forEach((y) => (cost += opponents.get(pair(x.id, y.id)) ?? 0)),
        );
        matches.push({ a: [a.id, b.id], b: [c.id, d.id] });
      }
      if (cost < bestCost) {
        best = matches;
        bestCost = cost;
      }
    }
    const ids = new Set(selected.map((p) => p.id)),
      round = {
        matches: best,
        rest: players.filter((p) => !ids.has(p.id)).map((p) => p.id),
      };
    rounds.push(round);
    record(round);
  }
  return rounds;
}
