/**
 * Dead Signal's smoke, shared by the arcade checks: prove through the room's
 * real input that moving is what fires, and that standing still does not.
 *
 * The canvas is opaque to a script and there are no test hooks in the room,
 * so this reads the hidden status line the room writes about once a second
 * ("N points. wave N. hull N of 3."). It moves left and right in turns until
 * a kill scores, then lets go of everything and requires the score to hold
 * while it stands still, after a settle for shots already in flight.
 *
 * Headless browsers render the tube in software and game time runs at a third
 * to a quarter of wall time there, so the waits are in wall seconds and
 * generous. It never calls `.focus()`: the key or tap that started the run
 * must already have put focus where it belongs.
 */
import { statusPoints } from "./arcade-panic-smoke.mjs";

/** Hold a direction for `ms` through the keyboard, or through the on-screen pad on a touch screen. */
async function hold(page, direction, ms, touch) {
  if (!touch) {
    const key = { left: "ArrowLeft", right: "ArrowRight" }[direction];
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    return;
  }
  const button = page.locator(".arcade-dpad").getByRole("button", { name: direction === "left" ? "←" : "→", exact: true });
  const box = await button.boundingBox();
  if (!box) throw new Error("signal smoke: the direction pad is not on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Moves until a kill scores; returns the points. Throws with what it read if nothing scores in `seconds`. */
export async function moveUntilScored(page, { touch = false, seconds = 45 } = {}) {
  const deadline = Date.now() + seconds * 1000;
  let turn = 0, points = null;
  while (Date.now() < deadline) {
    await hold(page, turn++ % 2 ? "left" : "right", 700, touch);
    points = await statusPoints(page);
    if (points > 0) return points;
  }
  throw new Error(`signal smoke: moved for ${seconds}s and scored nothing (status points: ${points})`);
}

/** Stands still and requires the score not to move: the beam is dark. Returns the score it held at. */
export async function stillScoresNothing(page, { settle = 3000, watch = 5000, steady = 3, cap = 30_000 } = {}) {
  await page.waitForTimeout(settle);
  // Then wait until the score has held for `steady` readings a second apart.
  // Game time here runs at a quarter of wall time or slower, so a shot fired
  // just before letting go can land after a wall-clock settle (a run on
  // 2026-09-27 scored one kill, 25 to 50, then held). A beam that really
  // fires while standing still keeps scoring and never gets steady.
  const until = Date.now() + cap;
  let last = await statusPoints(page), held = 0;
  while (held < steady) {
    if (Date.now() > until) throw new Error(`signal smoke: still scoring after ${cap / 1000}s of standing still (at ${last}), so the beam fires without a move`);
    await page.waitForTimeout(1000);
    const now = await statusPoints(page);
    held = now === last ? held + 1 : 0;
    last = now;
  }
  // A run that has ended or paused also scores nothing, and would pass for a
  // dark beam. The watch counts only while the run is in play (code review,
  // 2026-09-27).
  const inPlay = () =>
    page.evaluate(() => document.querySelector(".arcade-play")?.dataset.phase === "play" && !document.querySelector(".arcade-pause"));
  if (!(await inPlay())) throw new Error("signal smoke: the run was not in play before the still watch, so it proves nothing");
  const before = await statusPoints(page);
  await page.waitForTimeout(watch);
  const after = await statusPoints(page);
  if (before === null || after === null) throw new Error("signal smoke: the status line has no points to read");
  if (!(await inPlay())) throw new Error("signal smoke: the run ended or paused during the still watch, so it proves nothing");
  if (after !== before) throw new Error(`signal smoke: standing still scored (${before} to ${after}), so the beam fired without a move`);
  return after;
}
