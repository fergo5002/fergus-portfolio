import type { Article } from "../articles";

export const qualcommOverlay: Article = {
  slug: "a-qualcomm-overlay-appeared-in-our-dungeon",
  title: "A Qualcomm overlay appeared in our dungeon",
  description: "A vendor logo appeared over our roguelike during lighting work. Then a benchmark said it ran at two frames per second. Neither result was straightforward.",
  date: "2026-09-01",
  updated: "2026-09-06",
  tags: ["WebGL","Graphics","Debugging","Phaser"],
  summary: "Two debugging incidents from a Phaser roguelike: an unexpected overlay required both the custom lighting pipeline and bloom, and a headless frame-rate reading barely responded to changes in rendering quality. The binding-level cause and hardware performance remained unverified.",
  body: `Partway through building the lighting for a roguelike, a Qualcomm-branded overlay appeared on top of the game.

The game was set under Trinity's Campanile. There were eight of us on the team, and our mentor was a graphics engineer from Qualcomm. So a Qualcomm logo turning up in the dungeon felt like a fairly strong clue.

## Turning the lighting off

The test environment was using an ANGLE software renderer. Between that and the logo, I initially suspected the graphics stack.

I detached my lighting pipeline. The overlay disappeared. I tried the engine's built-in bloom on its own, and that was clean too. The artefact needed both passes together.

My best explanation was texture-unit crosstalk. The lighting pass used units 1 to 3 for occluder, normal and emissive textures; I suspected bloom was reading a binding left behind by that pass.

I didn't instrument the binding calls to prove it. The control narrowed the problem to the combination of pipelines. It didn't establish exactly which call was responsible, and the logo on its own hadn't helped.

## The two-frame-per-second benchmark

I also set up frame-rate sampling in a headless browser. The result came back between 1.1 and 2.4 frames per second.

That looked disastrous. But the rate barely changed across four quality tiers, even when switching off entire rendering passes.

The callbacks in that test setup were being throttled. Counting them wasn't giving me a useful measure of the shader's cost. I discarded the benchmark rather than treating those numbers as the game's frame rate.

That left a gap. I estimated the cost of each quality tier by counting texture taps and comparing them against a reference figure for an older integrated GPU. I didn't get a hardware measurement to confirm the estimate. A chart of those estimates appeared in the first version of this article; I've removed it because it looked more conclusive than the evidence was.

Both investigations took me about a day. Detaching the lighting pass and comparing the quality tiers were small checks, but I tried them after spending time on much more elaborate explanations.`,
};
