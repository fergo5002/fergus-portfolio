import type { Article } from "../articles";

export const qualcommOverlay: Article = {
  slug: "a-qualcomm-overlay-appeared-in-our-dungeon",
  title: "A Qualcomm overlay appeared in our dungeon",
  description:
    "Two bugs from one game's lighting work that were both the measuring instrument rather than the thing being measured, and the habit that catches them.",
  date: "2026-09-01",
  tags: ["WebGL", "Graphics", "Debugging", "Phaser"],
  summary:
    "Two debugging stories from the lighting system of a Phaser 3 roguelike: a vendor-branded debug overlay that turned out to be the engine's own bloom pass leaking GPU state rather than a driver fault, and a frame-rate benchmark that returned the same number for every quality tier because headless Chromium throttles requestAnimationFrame. Both were faults in the instrument, not the renderer.",
  body: `I wrote the lighting for a top-down roguelike set under Trinity's Campanile, built by a team of eight and mentored by a graphics engineer from Qualcomm. Partway through the shader work a Qualcomm-branded debug overlay started rendering on top of the game. Not in the art. Painted over the finished frame, in a build where nobody had asked for a debugger.

## Where did the overlay actually come from?

The tempting read was the obvious one. A vendor name on screen, in a test environment running an ANGLE software renderer, points at the graphics stack, and the mentor sitting across from us worked at that vendor. Every arrow lined up.

The arrows were wrong, and one test settled it. The overlay was only present when my lighting pipeline was attached. Detach it and the artefact went, and the engine's built-in bloom pass on its own was clean. So the fault needed both, which rules out a driver rendering a logo at us and points squarely at two pieces of code fighting over the same GPU state.

The best explanation I had was texture-unit crosstalk. My lighting pass binds units 1 to 3 for its occluder, normal and emissive textures, and the engine's bloom in that version reads from a unit it does not own. I want to be careful here: that is a mechanism consistent with what I saw, not one I proved by instrumenting the binding calls. What I did prove is that the vendor was innocent.

## Why is a headless frame rate not a frame rate?

The second one was worse, because it produced a number and numbers are persuasive. I wired up frame-rate sampling in a headless browser to check the shader chain against its budget, and it came back between 1.1 and 2.4 frames per second.

Read that as a performance result and you would tear the renderer apart. It is not a performance result. Headless Chromium throttles \`requestAnimationFrame\` to roughly 1 Hz when the page is not focused, so I was timing the browser's power-saving behaviour with the game attached as a passenger.

The tell was in the shape of the data, not the size of it. The figure barely moved across four quality tiers that add and remove entire passes. A renderer that renders the same speed with the expensive work switched off is not a renderer you are measuring.

## What did we ship on the strength of estimates?

Having thrown the benchmark away, I had no hardware numbers at all, so the budget came from counting texture taps per pixel per tier and comparing against a published reference figure for an older integrated GPU.

\`\`\`chart
{
  "kind": "bar",
  "title": "Estimated post-processing cost per quality tier",
  "unit": "ms",
  "categories": ["q=0", "q=1", "q=2", "q=3"],
  "series": [{ "label": "PostFX", "values": [0, 0.6, 1.0, 1.6] }],
  "baseline": 16.6,
  "baselineLabel": "16.6 ms frame budget",
  "caption": "Estimated by counting texture taps against a reference figure for a 2018 integrated GPU. Never confirmed on real hardware."
}
\`\`\`

That is a comfortable-looking chart and it is entirely arithmetic. The honest version of the sign-off says the budget was met in theory and the measurement was deferred, which is what we wrote down at the time. It is a weaker claim than a green bar chart implies, and the gap between those two things is exactly where a team talks itself into believing it has tested something.

## What is the rule?

Prove the instrument before you accuse the object. A timeout, a null, an odd reading or a logo on your dungeon floor is evidence about the measuring path until you have shown that path is healthy, and taking one control reading is usually enough to tell you which.

Both of these cost me a day and both were findable in minutes. Detaching one pipeline told me the overlay needed my code to appear. Looking across the quality tiers instead of at the headline number told me the frame counter was not responding to the thing it was supposed to be counting. Neither of those is clever, and I did the clever thing first in both cases.

The one that still catches me is the second, because a broken instrument that returns a plausible number is far more dangerous than one that errors. A blank reading makes you suspicious. A confident wrong reading makes you productive in the wrong direction for a day.`,
};
