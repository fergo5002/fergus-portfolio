import { bounded, random } from "./random";
export type ServiceConfig = {
  arrivalsPerHour: number;
  duration: number;
  servers: number;
  service: number;
  turnover: number;
  capacity: number;
  mode: "queue" | "session";
  seed: number;
};
export function simulateService(c: ServiceConfig) {
  bounded(c.arrivalsPerHour, 1, 200);
  bounded(c.duration, 30, 720);
  bounded(c.servers, 1, 12);
  bounded(c.service, 1, 180);
  bounded(c.turnover, 0, 60);
  bounded(c.capacity, 1, 40);
  const rng = random(c.seed),
    available = Array.from({ length: Math.floor(c.servers) }, () => 0),
    slots = new Map<number, number>();
  const people: {
    id: number;
    arrival: number;
    start: number | null;
    end: number | null;
    server: number;
  }[] = [];
  let arrival = 0;
  while (
    (arrival +=
      (-Math.log(Math.max(1e-9, 1 - rng())) * 60) / c.arrivalsPerHour) <
      c.duration &&
    people.length < 5000
  ) {
    let start: number,
      server = 0;
    if (c.mode === "queue") {
      server = available.indexOf(Math.min(...available));
      start = Math.max(arrival, available[server]);
      available[server] = start + c.service + c.turnover;
    } else {
      const cycle = c.service + c.turnover;
      start = Math.ceil(arrival / cycle) * cycle;
      while (
        (slots.get(start) ?? 0) >=
        Math.floor(c.capacity) * Math.floor(c.servers)
      )
        start += cycle;
      slots.set(start, (slots.get(start) ?? 0) + 1);
      server = Math.floor(((slots.get(start) ?? 1) - 1) / c.capacity);
    }
    people.push({
      id: people.length,
      arrival,
      start: start < c.duration ? start : null,
      end: start < c.duration ? start + c.service : null,
      server,
    });
  }
  const started = people.filter((p) => p.start !== null),
    waits = started.map((p) => p.start! - p.arrival).sort((a, b) => a - b);
  return {
    people,
    averageWait: waits.reduce((a, b) => a + b, 0) / (waits.length || 1),
    p90: waits[Math.floor(waits.length * 0.9)] ?? 0,
    completed: people.filter((p) => p.end !== null && p.end <= c.duration)
      .length,
    unserved: people.filter((p) => p.start === null).length,
    timeline: Array.from(
      { length: Math.floor(c.duration / 5) + 1 },
      (_, i) => ({
        minute: i * 5,
        queue: people.filter(
          (p) => p.arrival <= i * 5 && (p.start === null || p.start > i * 5),
        ).length,
      }),
    ),
  };
}
