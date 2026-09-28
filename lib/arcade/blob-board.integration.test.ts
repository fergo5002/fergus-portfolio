import { expect, it } from "vitest";
import { blobRepository, boardSecret } from "./blob-board";
import { emptyLedger, issueTicket, recordScore } from "./score-service";

it.skipIf(process.env.ARCADE_REAL_STORE_TEST !== "1")("stores two competing scores on real Blob and reads both immediately", async () => {
  const repo = blobRepository(), secret = boardSecret(), now = Date.now(), scope = "development";
  const initial = await repo.read();
  if (!initial.ledger) await repo.write(emptyLedger(now), initial.version);
  const first = { game: "poker", initials: "TST", score: 100, ticket: issueTicket("poker", scope, secret, now - 10000) };
  const second = { game: "poker", initials: "QAT", score: 110, ticket: issueTicket("poker", scope, secret, now - 10000) };
  await Promise.all([recordScore(repo, first, scope, secret, now), recordScore(repo, second, scope, secret, now)]);
  const stored = await repo.read();
  expect(stored.ledger?.boards["development:poker"].rows).toEqual(expect.arrayContaining([{ initials: "TST", score: 100 }, { initials: "QAT", score: 110 }]));
  const retry = await recordScore(repo, first, scope, secret, now);
  expect(retry.game).toBe("poker");
}, 60000);
