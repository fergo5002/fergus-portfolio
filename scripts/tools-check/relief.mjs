/**
 * `/tools/relief`: the terrain comes first; point at it, move the crosshair by
 * keyboard, switch views, take all three exports in both views, then a CSV,
 * then a refused one.
 */
export default async function relief({ page, go, shot, download, upload, assert, width }) {
  await go("relief");
  const plate = page.locator(".relief__plate");
  await plate.waitFor();

  // The terrain is the first thing on the stage: no text or control before it.
  const firstOnStage = await page.locator(".bench-stage").evaluate((stage) => {
    const canvas = stage.querySelector("canvas.relief__plate");
    const before = [...stage.querySelectorAll("p, output, input, button, label, select, h2, h3, legend, fieldset")].filter(
      (el) => canvas && (el.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    return { canvas: !!canvas, before: before.map((el) => el.outerHTML.slice(0, 80)) };
  });
  assert.equal(firstOnStage.canvas, true, "the stage has a terrain");
  assert.deepEqual(firstOnStage.before, [], "nothing sits above the terrain on the stage");
  // No small capitals anywhere on the stage: the browser half of the eyebrow ban.
  assert.deepEqual(
    await page.locator(".bench-stage *").evaluateAll((els) => els.filter((el) => getComputedStyle(el).textTransform === "uppercase").map((el) => el.className)),
    [],
    "no upper-case labels on the stage",
  );
  // The demo says what it is, on the stage, beside the figures.
  await page.locator(".relief__caption", { hasText: "Generated, not measured" }).waitFor();

  const readout = () => page.locator(".relief__cell").innerText();
  assert.match(await readout(), /^week \d+ · \d\d:00 · \d+ events?$/, "the crosshair opens on a reading");

  // Pointing: a mouse hovers, a finger taps. Two places, two different cells.
  const box = await plate.boundingBox();
  const touch = width < 700;
  const point = async (fx, fy) => {
    const x = box.x + box.width * fx;
    const y = box.y + box.height * fy;
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
  };
  await point(0.12, 0.92);
  const near = await readout();
  await point(0.8, 0.35);
  const far = await readout();
  assert.notEqual(near, far, "pointing at two places reads two cells");
  assert.match(near, /^week (4[0-9]|5[0-2]) · 0[0-3]:00/, "the front of the terrain is the end of the year, the left is midnight");

  // The keyboard path to the same crosshair.
  const week = page.getByRole("slider", { name: /^Week/ });
  await week.focus();
  await page.keyboard.press("Home");
  assert.match(await readout(), /^week 1 · /);
  await page.keyboard.press("ArrowRight");
  assert.match(await readout(), /^week 2 · /);
  await page.getByRole("slider", { name: /^Hour/ }).focus();
  await page.keyboard.press("End");
  assert.match(await readout(), /^week 2 · 23:00 · /);

  // Exports from the ridgeline: the SVG is the ridgeline's visible strokes, one group a week.
  for (const [label, ext] of [["PNG", ".png"], ["SVG in millimetres", ".svg"], ["Binary STL mesh", ".stl"]]) {
    const file = await download(page.getByRole("button", { name: label, exact: true }));
    assert.ok(file.name.endsWith(ext)); assert.ok(file.bytes.length > 100);
    if (ext === ".stl") assert.equal(file.bytes.length, 84 + file.bytes.readUInt32LE(80) * 50);
    if (ext === ".svg") { assert.match(file.bytes.toString(), /<svg/); assert.match(file.bytes.toString(), /id="week-01"/); assert.match(file.name, /-ridges-/); }
  }
  await shot("relief");

  // The contour plate is one choice away, and its SVG is the contours.
  await page.getByRole("radio", { name: "Contour", exact: true }).check();
  assert.match(await plate.getAttribute("aria-label"), /contour plate/i);
  const contourSvg = await download(page.getByRole("button", { name: "SVG in millimetres", exact: true }));
  assert.match(contourSvg.bytes.toString(), /id="level-0"/);
  await shot("relief-contour");
  await page.getByRole("radio", { name: "Ridgeline", exact: true }).check();

  // A CSV of dated rows becomes the year on the sheet.
  await page.getByRole("radio", { name: "CSV", exact: true }).check();
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 19 * 3600_000).toISOString());
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("dated-events.csv", "date,note\n" + dates.map(date => `${date},WorkbenchFixture`).join("\n")));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "SVG in millimetres" && !button.disabled));
  const csvPlate = await download(page.getByRole("button", { name: "SVG in millimetres", exact: true }));
  assert.match(csvPlate.name, /csv/);
  assert.match(csvPlate.bytes.toString(), /<svg/);
  assert.equal(await page.locator(".relief__caption").count(), 0, "a CSV year is not captioned as generated");

  // A year too thin to draw is refused and the exports wait.
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("too-thin.csv", "date\n2026-08-01"));
  await page.getByText("No new landscape is ready.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), true);
  await page.getByRole("radio", { name: "Demo", exact: true }).check();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), false);
}
