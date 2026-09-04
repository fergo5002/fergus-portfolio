import { describe, it, expect } from "vitest";
import { BOARD_SIZE } from "@/lib/arcade/board";
import { boardKey, parseZrange, readBoards, writeScore } from "@/lib/arcade/board-store";
import type { BoardRedis } from "@/lib/arcade/board-store";

function fakeRedis(data: Record<string, (string | number)[]> = {}) {
  const calls: string[] = [];
  const redis: BoardRedis = {
    zadd: async (key, entry) => {
      calls.push(`zadd ${key} ${entry.score} ${entry.member}`);
    },
    zrange: async (key) => data[key] ?? [],
    zremrangebyrank: async (key, start, stop) => {
      calls.push(`trim ${key} ${start} ${stop}`);
    },
  };
  return { redis, calls };
}

describe("the key", () => {
  it("is namespaced, so nothing else in the database can collide with it", () => {
    expect(boardKey("pong")).toBe("arcade:board:pong");
  });
});

describe("parseZrange", () => {
  it("reads the flat member, score, member, score array Upstash returns", () => {
    expect(parseZrange(["FOR#a1b2c3d4", 4200, "CKK#deadbeef", 910])).toEqual([
      { initials: "FOR", score: 4200 },
      { initials: "CKK", score: 910 },
    ]);
  });

  it("takes the score as a number even when the transport made it a string", () => {
    expect(parseZrange(["FOR#a1b2c3d4", "4200"])).toEqual([{ initials: "FOR", score: 4200 }]);
  });

  it("skips a row it cannot read rather than putting NaN on the board", () => {
    expect(parseZrange(["FOR#x", "not a number", "TOOLONG#x", 5, "CKK#x", 10])).toEqual([
      { initials: "CKK", score: 10 },
    ]);
  });

  it("survives an odd-length array", () => {
    expect(parseZrange(["FOR#x"])).toEqual([]);
  });
});

describe("readBoards", () => {
  it("asks for the top twenty of each game, highest first", () => {
    const seen: unknown[] = [];
    const redis: BoardRedis = {
      zadd: async () => {},
      zrange: async (key, start, stop, opts) => {
        seen.push([key, start, stop, opts]);
        return [];
      },
      zremrangebyrank: async () => {},
    };
    return readBoards(redis, ["pong"]).then(() => {
      expect(seen[0]).toEqual(["arcade:board:pong", 0, BOARD_SIZE - 1, { rev: true, withScores: true }]);
    });
  });

  it("returns one board per game, in the order asked", async () => {
    const { redis } = fakeRedis({ "arcade:board:pong": ["FOR#x", 1] });
    const boards = await readBoards(redis, ["pong", "snake"]);
    expect(boards.map((b) => b.game)).toEqual(["pong", "snake"]);
    expect(boards[1].rows).toEqual([]);
  });
});

describe("writeScore", () => {
  it("adds the entry then trims everything below the top twenty", async () => {
    const { redis, calls } = fakeRedis();
    await writeScore(redis, "pong", "FOR", 4200, "a1b2c3d4");
    expect(calls).toEqual([
      "zadd arcade:board:pong 4200 FOR#a1b2c3d4",
      `trim arcade:board:pong 0 ${-(BOARD_SIZE + 1)}`,
    ]);
  });
});
