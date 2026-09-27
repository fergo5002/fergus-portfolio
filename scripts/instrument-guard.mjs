/**
 * The browser half of the instrument redesign's promise: no stock form
 * controls on a tool page. Shared by `tools-check.mjs` and `studio-check.mjs`.
 *
 * Returns a list of offenders, each a short description, for the caller to
 * assert empty:
 *   - any `<input type="date">` at all (the kit's DateRange replaced them)
 *   - a file input a visitor can see (the kit keeps one behind a label,
 *     visually hidden, so the designed button is what shows)
 *   - a range input still wearing the browser's own appearance (the kit
 *     either redraws it with `appearance: none` or hides it under a dial)
 *
 * Closed `<details>` count too: a stock control is stock whether or not its
 * panel happens to be open when the page is photographed.
 */
export async function stockControls(page) {
  return page.evaluate(() => {
    const out = [];
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className ? "." + String(el.className).split(" ").join(".") : ""}`;
    for (const el of document.querySelectorAll('input[type="date"]')) out.push(`stock date input ${name(el)}`);
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown = r.width > 2 && r.height > 2 && cs.opacity !== "0" && cs.visibility !== "hidden" && cs.display !== "none";
      if (shown) out.push(`visible stock file input ${name(el)}`);
    }
    for (const el of document.querySelectorAll('input[type="range"]')) {
      const cs = getComputedStyle(el);
      const redrawn = cs.appearance === "none" || cs.webkitAppearance === "none";
      const hidden = cs.opacity === "0";
      if (!redrawn && !hidden) out.push(`stock range ${name(el)}`);
    }
    return out;
  });
}
