/** `/tools/relief`: explore the demo by keyboard, take all three exports, then a CSV, then a refused one. */
export default async function relief({ page, go, shot, download, upload, assert }) {
  await go("relief");
  await page.locator(".relief__plate").waitFor();
  const readout = await page.locator(".relief__cell").innerText();
  await page.getByRole("slider", { name: /^Week/ }).focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await page.locator(".relief__cell").innerText(), readout);
  for (const [label, ext] of [["PNG", ".png"], ["SVG in millimetres", ".svg"], ["Binary STL mesh", ".stl"]]) {
    const file = await download(page.getByRole("button", { name: label, exact: true }));
    assert.ok(file.name.endsWith(ext)); assert.ok(file.bytes.length > 100);
    if (ext === ".stl") assert.equal(file.bytes.length, 84 + file.bytes.readUInt32LE(80) * 50);
    if (ext === ".svg") assert.match(file.bytes.toString(), /<svg/);
  }
  await shot("relief");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 19 * 3600_000).toISOString());
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("dated-events.csv", "date,note\n" + dates.map(date => `${date},WorkbenchFixture`).join("\n")));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "SVG in millimetres" && !button.disabled));
  const csvPlate = await download(page.getByRole("button", { name: "SVG in millimetres", exact: true }));
  assert.match(csvPlate.name, /csv/);
  assert.match(csvPlate.bytes.toString(), /<svg/);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload("too-thin.csv", "date\n2026-08-01"));
  await page.getByText("No new landscape is ready.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "PNG", exact: true }).isDisabled(), false);
}
