/**
 * Mutation check.
 *
 * Started as a contact-form guard and now also covers the brightness numbers,
 * because those are the ones most likely to drift back: a shader constant is
 * the least reviewable line in the repo.
 *
 * Not part of the build and not run by `npm test`. Like `Dockerfile.parity`,
 * it exists to be run deliberately before shipping a change to this feature.
 *
 * **Why it is committed rather than thrown away.** The claim "the tests would
 * catch that" is worth exactly nothing unless somebody has tried. This repo has
 * already shipped a guard whose test was the implementation restated and could
 * therefore never fail, and `docs/PROGRESS.md` used to assert a mutation count
 * that nothing in the repo could reproduce. This file is that assertion turned
 * into something anyone can re-run:
 *
 *     node scripts/mutation-check.mjs
 *
 * Each entry breaks one guard on purpose, runs the suite, and restores the file.
 * A guard that survives its own mutation is decoration, and the run says so.
 *
 * Two rules learnt the hard way, both encoded below:
 *  - **Anchors are regexes tolerant of CRLF.** `app/globals.css` uses CRLF, and
 *    an anchor written with a bare "\n" silently matched nothing.
 *  - **A missing anchor is a failure, never a skip.** A SKIP line in a column of
 *    REDs reads as a pass at a glance, which is how the first version of this
 *    hid a mutation that was never actually applied.
 *
 * Restoration writes the original text back rather than running `git checkout`,
 * so an unrelated uncommitted change in the same file cannot be destroyed by a
 * mutation run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each: break one guard, expect the suite to notice. */
const MUTATIONS = [
  // ── the regression a code review caught: timing allowed to discard again ──
  {
    name: "THE REGRESSION: a fast submission silently dropped instead of marked",
    file: "lib/contact-server.ts",
    pattern: /(if \(honeypotFilled\(\{ honeypot: formData\.get\(HONEYPOT_FIELD\) \}\)\))/,
    replace:
      "if (honeypotFilled({ honeypot: formData.get(HONEYPOT_FIELD) }) || filledImplausiblyFast({ elapsed: formData.get(ELAPSED_FIELD) }))",
  },
  {
    name: "timing check stops failing open when no timing is present",
    file: "lib/contact.ts",
    pattern: /(  if \(value === ""\) return false;)/,
    replace: "  // $1",
  },
  {
    name: "check order swapped, so a bot gets a per-field critique",
    file: "lib/contact-server.ts",
    pattern: /if \(honeypotFilled\(\{ honeypot: formData\.get\(HONEYPOT_FIELD\) \}\)\) \{/,
    replace: "if (false) {",
  },

  // ── the module that holds the key ──
  {
    name: "the server module loses its runtime browser fence",
    file: "lib/contact-server.ts",
    pattern: /if \(typeof window !== "undefined"\) \{\r?\n  throw new Error\([^\n]*\r?\n\}/,
    replace: "// fence removed",
  },
  {
    name: "the client-safe half starts reading the environment",
    file: "lib/contact.ts",
    pattern: /(export const MESSAGE_MIN = 10;)/,
    replace: "$1\nexport const LEAK = process.env.RESEND_API_KEY;",
  },

  // ── the form's fragile tricks, none of which look load-bearing ──
  {
    name: "inputs stop re-keying, so a rejected submission wipes the form",
    file: "components/ContactForm.tsx",
    pattern: /key=\{`\$\{field\.name\}-\$\{state\.seq\}`\}/,
    replace: "key={field.name}",
  },
  {
    name: "client errors seeded as {} instead of null (hydration mismatch)",
    file: "components/ContactForm.tsx",
    pattern: /useState<FieldErrors \| null>\(null\)/,
    replace: "useState<FieldErrors | null>({})",
  },
  {
    name: "copy button rendered whether or not the clipboard API exists",
    file: "components/ContactForm.tsx",
    pattern: /\{canCopy && \(/,
    replace: "{true && (",
  },
  {
    name: "field errors lose the role a screen reader acts on",
    file: "components/ContactForm.tsx",
    pattern: /(<p className="cform__error" id=\{errorId\}) role="alert"(>)/,
    replace: "$1$2",
  },
  {
    name: "elapsed stamped as a timestamp rather than a duration",
    file: "components/ContactForm.tsx",
    pattern: /String\(Date\.now\(\) - startedAt\.current\)/,
    replace: "String(Date.now())",
  },

  // ── what actually gets posted ──
  {
    name: "reply_to spelled the SDK way, so replies go to the wrong address",
    file: "lib/contact.ts",
    pattern: /    reply_to: fields\.email,/,
    replace: "    replyTo: fields.email,",
  },
  {
    name: "the [fast] marker silently dropped from the subject",
    file: "lib/contact.ts",
    pattern: /\$\{opts\.flagged \? " \[fast\]" : ""\}/,
    replace: "",
  },
  {
    name: "honeypot renamed to something a browser autofill recognises",
    file: "lib/contact.ts",
    pattern: /export const HONEYPOT_FIELD = "hp";/,
    replace: 'export const HONEYPOT_FIELD = "website";',
  },
  {
    name: "invalid submissions posted to Resend anyway",
    file: "lib/contact-server.ts",
    pattern: /if \(!validation\.ok\) \{/,
    replace: "if (!validation.ok && false) {",
  },
  {
    name: "mailto stops sharing one definition with the copy button",
    file: "lib/contact.ts",
    pattern: /encodeURIComponent\(messageBody\(fields\)\)/,
    replace: "encodeURIComponent(fields.message)",
  },

  // ── the surfaces around it ──
  {
    name: "form labels dimmed back below the contrast floor",
    file: "app/globals.css",
    pattern: /(\.cform__label \{\r?\n  color: var\()--green(\);)/,
    replace: "$1--green-dim$2",
  },
  {
    name: "/contact dropped from the sitemap",
    file: "app/sitemap.ts",
    pattern: /\{ url: absolute\("\/contact"\)[^}]*\},\r?\n/,
    replace: "",
  },
  {
    name: "the call to action points at the wrong route",
    file: "components/Talk.tsx",
    pattern: /<Link className="talk__cta" href="\/contact">/,
    replace: '<Link className="talk__cta" href="/">',
  },
  {
    name: "the call to action reverts to a mailto, which is the original bug",
    file: "components/Talk.tsx",
    pattern: /<Link className="talk__cta" href="\/contact">/,
    replace: '<a className="talk__cta" href={`mailto:x@example.com`}>',
  },

  // ── how hard the tube flashes, and how much light follows the cursor ──
  // Halved on 2026-08-20. Each of these creeps the brightness back the way a
  // plausible-looking commit would, one number at a time.
  // Named groups, not $1/$2. `"$10.5$2"` reads as group 10 before it falls back
  // to group 1, which is fine with two groups and silently wrong with ten.
  {
    name: "the periodic flicker creeps back to full strength",
    file: "app/globals.css",
    pattern: /(?<lead>98% \{\r?\n      opacity: )0\.25(?<tail>;)/,
    replace: "$<lead>0.5$<tail>",
  },
  {
    name: "the channel-change band creeps back to full strength",
    file: "app/globals.css",
    pattern: /(?<lead>top: -26vh;\r?\n      opacity: )0\.5(?<tail>;)/,
    replace: "$<lead>1$<tail>",
  },
  {
    name: "the pointer halo brightens in the present pass only",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /glow \+= exp\(-d \* 5\.0\) \* 0\.025 \* uPointerActive;/,
    replace: "glow += exp(-d * 5.0) * 0.05 * uPointerActive;",
  },
  {
    name: "the pointer halo brightens in the persistence buffer only",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /add \+= exp\(-length\(toP\) \* 9\.0\) \* 0\.05 \* uEmit \* uPointerActive;/,
    replace: "add += exp(-length(toP) * 9.0) * 0.10 * uEmit * uPointerActive;",
  },
  {
    name: "the degauss deposit goes back to blinding",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /add \+= dgDrag \* 0\.06 \* uEmit;/,
    replace: "add += dgDrag * 0.85 * uEmit;",
  },
  {
    name: "the degauss present-pass glow goes back up",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /glow \+= band \* 0\.05;/,
    replace: "glow += band * 0.7;",
  },
  {
    name: "the tap and degauss glows are swapped over",
    file: "components/system/PhosphorScreen.tsx",
    // The reason those two are asserted inside their own brace-matched blocks:
    // against the whole pass, a straight swap satisfies both assertions.
    pattern: /glow \+= band \* 0\.10;([\s\S]*?)glow \+= band \* 0\.05;/,
    replace: "glow += band * 0.05;$1glow += band * 0.10;",
  },
  {
    name: "dimming the degauss also stops it scrubbing burn-in",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /burn \*= 1\.0 - clamp\(dgDrag \* 3\.5, 0\.0, 1\.0\);/,
    replace: "burn *= 1.0 - clamp(dgDrag * 1.75, 0.0, 1.0);",
  },
  {
    name: "the contact form goes silent again",
    file: "components/ContactForm.tsx",
    pattern: /            onKeyDown: onKey,\r?\n/,
    replace: "",
  },
  {
    // The one a review had to catch by hand: the original assertion was a bare
    // `audio.key()` against the whole file, and the docblock above the handler
    // says `audio.key()` too, so emptying the handler stayed green.
    name: "the key handler is emptied but its docblock stays",
    file: "components/ContactForm.tsx",
    pattern: /      audio\.key\(\);\r?\n/,
    replace: "",
  },
  {
    name: "the form's key filter drifts away from the shell's",
    file: "components/ContactForm.tsx",
    pattern: /e\.key === "Backspace" \|\| e\.key === "Tab"/,
    replace: 'e.key === "Backspace"',
  },
  {
    // The absence test that used to pass by slicing three characters. Moving the
    // handler onto the form is the change it exists to stop.
    name: "the key handler is hoisted onto the form, so the submit button clicks",
    file: "components/ContactForm.tsx",
    pattern: /(<form\r?\n        className="cform__form")/,
    replace: "$1\n        onKeyDown={onKey}",
  },

  // ── the frame-rate normalisation a second review had to catch ──
  {
    name: "deposits go back to per frame, so brightness follows the refresh rate",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /su\.uEmit\.value = \(1 - su\.uDecay\.value\) \/ \(1 - Math\.pow\(0\.045, 1 \/ 60\)\);/,
    replace: "su.uEmit.value = 1;",
  },
  {
    name: "the pointer halo drops out of the normalisation",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* 0\.05 \* uEmit \* uPointerActive;/,
    replace: "* 0.05 * uPointerActive;",
  },

  // ── the constants this change deliberately did NOT touch ──
  // The test file calls these "just as important", so they have to bite too.
  // Without them, 30/30 RED read as full coverage while seven asserted numbers
  // had never been shown to matter.
  {
    name: "the channel-change static creeps back up",
    file: "app/globals.css",
    pattern: /(?<lead>@keyframes channel-static \{\r?\n    from \{\r?\n      opacity: )0\.425(?<tail>;)/,
    replace: "$<lead>0.85$<tail>",
  },
  {
    name: "a tap's deposit is raised on its own",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /2\.2\) \* 0\.11 \* uEmit;/,
    replace: "2.2) * 0.55 * uEmit;",
  },
  {
    name: "the pointer's deflection ripple is dimmed along with its light",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* ripple \* 0\.0045 \* uPointerActive;/,
    replace: "* ripple * 0.00225 * uPointerActive;",
  },
  {
    name: "the degauss stops dragging the persistence buffer",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /src \+= normalize\(toC \+ 1e-5\) \* dgDrag \* 0\.045;/,
    replace: "src += normalize(toC + 1e-5) * dgDrag * 0.0225;",
  },
  {
    name: "a tap stops warping the picture",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /uv \+= normalize\(toT \+ 1e-5\) \* band \* 0\.04;/,
    replace: "uv += normalize(toT + 1e-5) * band * 0.02;",
  },
  {
    name: "a degauss stops warping the picture",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /uv \+= normalize\(toC \+ 1e-5\) \* band \* 0\.055;/,
    replace: "uv += normalize(toC + 1e-5) * band * 0.0275;",
  },
  {
    name: "the power-on strike is dimmed too, which nobody asked for",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* strike \* 1\.4;/,
    replace: "* strike * 0.7;",
  },
];

let caught = 0;
const survived = [];

for (const mutation of MUTATIONS) {
  const path = join(ROOT, mutation.file);
  const original = readFileSync(path, "utf8");
  const mutated = original.replace(mutation.pattern, mutation.replace);

  if (mutated === original) {
    // Not a skip. An anchor that no longer matches means this guard is not
    // being tested at all, and saying so quietly is how that gets missed.
    console.log(`ANCHOR-MISS  ${mutation.name}  (${mutation.file})`);
    survived.push(`${mutation.name} [anchor no longer matches]`);
    continue;
  }

  writeFileSync(path, mutated, "utf8");
  let red = false;
  try {
    execSync("npx vitest run --silent", { cwd: ROOT, stdio: "pipe" });
  } catch {
    red = true;
  } finally {
    writeFileSync(path, original, "utf8");
  }

  if (red) caught++;
  else survived.push(mutation.name);
  console.log(`${red ? "RED  " : "GREEN"}  ${mutation.name}`);
}

console.log(`\n${caught}/${MUTATIONS.length} mutations caught.`);
if (survived.length) {
  console.log("Survived (each one is a guard that does nothing):");
  for (const name of survived) console.log(` - ${name}`);
  process.exitCode = 1;
}
