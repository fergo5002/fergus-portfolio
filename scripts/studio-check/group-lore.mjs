import { readFile } from "node:fs/promises";

/**
 * Group Lore, under reduced motion: the week first on the stage and lit, a
 * cell read by pointer and by keyboard, the messages opened from a cell, a
 * stretch chosen on the timeline that the week, the voices and the phrases
 * follow, a voice focused, a phrase and the search, both downloads with no
 * names and no message text, a Telegram import, an ambiguous WhatsApp file
 * that asks its date order, and back to the example.
 *
 * The phone half (the week lit and whole on a 390 and a 320 WebKit, and in
 * the server HTML) is `scripts/studio-boundaries/group-lore.mjs`.
 */
const DAY = /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d\d:00 · ([\d,]+ messages?|no messages)$/;

export default async function groupLore({ page, open, button, save, assert, report }) {
  await open("group-lore");
  // The server draws the week; the deck arrives with hydration, when its controls can answer.
  await page.locator(".lore__intake").waitFor();

  // The week is the first thing on the stage: no sentence or control above it.
  const first = await page.locator(".bench-stage").evaluate((stage) => {
    const week = stage.querySelector(".lore__week");
    const before = [...stage.querySelectorAll("p, output, input, button, label, select, textarea, h2, h3, legend, fieldset")].filter(
      (el) => week && el.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    return { week: !!week, before: before.map((el) => el.outerHTML.slice(0, 80)) };
  });
  assert.equal(first.week, true, "the stage has a week");
  assert.deepEqual(first.before, [], "nothing sits above the week on the stage");
  assert.deepEqual(
    await page.locator(".bench-stage *").evaluateAll((els) => els.filter((el) => getComputedStyle(el).textTransform === "uppercase").map((el) => el.className)),
    [],
    "no upper-case labels on the stage",
  );

  // It opens on the example, says so, and most of the week is lit.
  const figures = () => page.locator(".lore__figures").innerText();
  const example = await figures();
  assert.match(example, /An invented chat\./);
  assert.match(example, /Counts describe this export, not relationships\./);
  const exampleCount = example.match(/([\d,]+)\s+messages/)?.[1];
  assert.ok(exampleCount && Number(exampleCount.replace(/,/g, "")) > 900, example);
  assert.ok((await page.locator(".lore__cell:not([data-empty])").count()) >= 100, "the example lights most of the week");

  // The reading opens on the peak, and follows the pointer.
  const reading = () => page.locator(".lore__reading").innerText();
  assert.match(await reading(), DAY);
  await page.locator('.lore__cell[data-d="0"][data-h="3"]').hover();
  assert.match(await reading(), /^Monday 03:00 · /);
  await page.locator('.lore__cell[data-d="4"][data-h="21"]').hover();
  assert.match(await reading(), /^Friday 21:00 · [\d,]+ messages?$/);

  // The keyboard walks the week and Enter opens that hour.
  await page.locator(".lore__week").focus();
  await page.keyboard.press("ArrowRight");
  assert.match(await reading(), /^Friday 22:00 · /);
  await page.keyboard.press("Enter");
  await page.locator(".lore__explorer").waitFor();
  const hours = await page.locator(".lore-messages time").evaluateAll((els) =>
    els.map((el) => {
      const d = new Date(el.getAttribute("datetime"));
      return `${d.getDay()}-${d.getHours()}`;
    }),
  );
  assert.ok(hours.length > 0, "the hour has messages");
  assert.deepEqual([...new Set(hours)], ["5-22"], "every message opened from Friday 22:00 is on a Friday at 22:00");
  await button("Close the messages").click();
  assert.equal(await page.locator(".lore__explorer").count(), 0);

  // A click opens a cell's messages with a chip that takes the hour away again.
  await page.mouse.move(0, 0);
  await page.locator('.lore__cell[data-d="1"][data-h="21"]').click();
  await button("Remove Tue 21:00").waitFor();
  assert.ok((await page.locator(".lore-messages article").count()) > 0);
  await button("Close the messages").click();

  // A stretch: the timeline's thumbs choose May, and the week, voices, phrases and figures follow.
  const heat = () => page.locator(".lore__cell").evaluateAll((els) => els.map((el) => el.style.getPropertyValue("--heat")).join(","));
  const phrases = () => page.locator(".lore__phrase").allInnerTexts();
  const allHeat = await heat();
  const allPhrases = await phrases();
  const litBars = () => page.locator(".lore__bars rect.is-lit").count();
  const allBars = await litBars();
  await page.getByRole("slider", { name: "From", exact: true }).fill("95");
  await page.getByRole("slider", { name: "To", exact: true }).fill("116");
  await page.waitForFunction((n) => document.querySelectorAll(".lore__bars rect.is-lit").length < n, allBars);
  await page.waitForFunction((before) => !document.querySelector(".lore__figures")?.textContent?.includes(before), exampleCount);
  assert.notEqual(await heat(), allHeat, "the week follows the stretch");
  assert.notDeepEqual(await phrases(), allPhrases, "the phrases follow the stretch");
  const stretch = await figures();
  assert.ok(Number(stretch.match(/([\d,]+)\s+messages/)[1].replace(/,/g, "")) < Number(exampleCount.replace(/,/g, "")));
  // Its messages all fall inside the stretch.
  await button("Search the messages").click();
  const [from, to] = await page.locator(".inst-dates__readout output").allInnerTexts();
  const times = await page.locator(".lore-messages time").evaluateAll((els) => els.map((el) => new Date(el.getAttribute("datetime")).getTime()));
  const lo = new Date(`${from} 00:00`).getTime();
  const hi = new Date(`${to} 23:59:59`).getTime();
  assert.ok(times.length > 0 && times.every((t) => t >= lo && t <= hi), `${from} to ${to}`);
  await button("Close the messages").click();
  report.push({ name: "lore-stretch", from, to, figures: stretch.replace(/\s+/g, " ") });
  await page.getByRole("radio", { name: "Everything", exact: true }).check();
  await page.waitForFunction((before) => document.querySelector(".lore__figures")?.textContent?.includes(before), exampleCount);

  // A voice narrows the week to itself, and says so in the reading.
  await page.locator(".lore__voice").nth(1).click();
  await page.waitForFunction(() => /^Voice 2 · /.test(document.querySelector(".lore__reading")?.textContent ?? ""));
  assert.notEqual(await heat(), allHeat, "the week follows the voice");
  await page.locator(".lore__voice").nth(1).click();
  await page.waitForFunction((re) => new RegExp(re).test(document.querySelector(".lore__reading")?.textContent ?? ""), DAY.source);

  // Pseudonyms rename the labels, and only the labels.
  assert.match((await page.locator(".lore__voice-name").allInnerTexts()).join(","), /^Voice 1,Voice 2/);
  await page.getByRole("switch", { name: "Use pseudonyms" }).click();
  const names = await page.locator(".lore__voice-name").allInnerTexts();
  assert.ok(names.every((n) => !/^Voice \d/.test(n)), names.join(","));
  await page.getByRole("switch", { name: "Use pseudonyms" }).click();

  // A phrase opens the messages that say it.
  const phrase = page.locator("button.lore__phrase").first();
  const said = (await phrase.innerText()).match(/“(.+)”/)[1];
  await phrase.click();
  assert.equal(await page.getByLabel("Search message text", { exact: true }).inputValue(), said);
  // The list follows a deferred copy of the search, so it settles a render after the field.
  await page
    .waitForFunction(
      (s) => {
        const texts = [...document.querySelectorAll(".lore-messages article p")].map((p) => p.textContent.toLowerCase());
        return texts.length > 0 && texts.every((t) => t.includes(s));
      },
      said,
      { timeout: 10000 },
    )
    .catch(async () => {
      const texts = await page.locator(".lore-messages article p").allInnerTexts();
      assert.fail(`a phrase opened messages that do not say it: "${said}" / ${texts.filter((t) => !t.toLowerCase().includes(said)).slice(0, 3).join(" | ")}`);
    });

  // Both downloads hold counts only: no names, no message text, whatever the search says.
  await page.getByLabel("Search message text", { exact: true }).fill("pint");
  await page.waitForTimeout(200);
  const summaryText = await readFile(await save("Anonymous summary"), "utf8");
  const summary = JSON.parse(summaryText);
  assert.equal(summary.format, "group-lore-v2");
  assert.equal(summary.count, Number(exampleCount.replace(/,/g, "")), "the summary is the week on screen, not the search");
  assert.doesNotMatch(summaryText, /pint|usual|Aoife|Cian|Niamh|Rory|Saoirse/);
  const svg = await readFile(await save("Activity portrait"), "utf8");
  assert.ok(svg.includes("The shape of us"));
  assert.doesNotMatch(svg, /pint|usual|Aoife|Cian|Niamh|Rory|Saoirse/);
  await button("Close the messages").click();

  // A Telegram export replaces the example, and JSON never asks a date order.
  await page.getByLabel("Import a chat", { exact: true }).setInputFiles({
    name: "telegram.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        messages: [{ type: "message", date: "2026-09-01T10:00:00", from: "Private Name", text: ["hello ", { text: "there" }] }],
      }),
    ),
  });
  // innerText, not textContent: the figures are spans, and textContent runs them together ("1 message1 voice").
  await page.waitForFunction(() => /\b1\s+message\b/.test(document.querySelector(".lore__figures")?.innerText ?? ""));
  assert.doesNotMatch(await figures(), /An invented chat/);
  assert.equal(await page.getByRole("radio", { name: "Month / day / year" }).count(), 0, "JSON has its own dates");
  await button("Search the messages").click();
  assert.equal(await page.locator(".lore-messages article").count(), 1);
  await button("Close the messages").click();

  // A WhatsApp file that reads either way asks, and the answer moves the days.
  await page.getByLabel("Import a chat", { exact: true }).setInputFiles({
    name: "either-way.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("03/04/2026, 20:15 - Alex: first\n03/04/2026, 20:17 - Bea: second\n05/06/2026, 09:00 - Alex: third"),
  });
  await page.getByRole("radio", { name: "Day / month / year" }).waitFor();
  const dmy = await page.locator(".inst-dates__readout").innerText();
  assert.match(dmy, /3 Apr 2026/);
  await page.getByRole("radio", { name: "Month / day / year" }).check();
  await page.waitForFunction(() => document.querySelector(".inst-dates__readout")?.textContent?.includes("4 Mar 2026"));
  assert.equal(await page.getByRole("radio", { name: "Month / day / year" }).isChecked(), true, "the choice stays offered and holds");

  // Back to the example.
  await button("Explore an example").click();
  await page.waitForFunction((before) => document.querySelector(".lore__figures")?.textContent?.includes(before), exampleCount);
  assert.match(await figures(), /An invented chat\./);
}
