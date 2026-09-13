import type { Article } from "../articles";

export const crtThatBehaves: Article = {
  slug: "a-crt-that-behaves-like-a-crt",
  title: "Building a CRT that behaves like a CRT",
  description:
    "Most CRT effects are a scanline overlay and some glow. Deriving everything from one premise, a beam painting phosphor, gets you somewhere better.",
  date: "2026-08-06",

  updated: "2026-09-13",
  tags: ["WebGL", "Motion", "Frontend", "Craft"],
  summary:
    "Technique for a CRT-styled web interface built from one physical premise rather than a stack of effects: a ping-pong persistence buffer for phosphor decay and burn-in, scroll velocity as beam velocity, one shared frame clock, and reduced-motion handling that degrades to a single static frame.",
  body: `Search for a CRT effect and you get the same recipe every time: a gradient for scanlines, a text-shadow for glow, a vignette. It reads as old screen and it is fine. It also looks like a sticker, because every effect is independent, so nothing responds to anything else and the illusion drops the moment you touch the page.

## What does committing to one premise buy you?

I rebuilt mine from a single idea: an electron beam painting phosphor behind glass. Every effect has to follow from that or it doesn't go in.

That constraint is the whole trick, because it stops you adding tricks. Decisions that were aesthetic start having correct answers.

Where the usual recipe paints a scanline gradient, the premise says scroll velocity is beam velocity, so fast scrolling smears. Where it paints a text-shadow glow, the premise says phosphor keeps glowing after the beam has gone. The vignette becomes burn-in under anything that sits still long enough, and a route change becomes a channel change.

None of that is something I thought of and then justified. It falls out. That is the difference between a system and a pile of effects.

## Phosphor has memory

This is the effect doing most of the work, and the usual recipe cannot express it at all. A tube that has shown the same navigation bar for ten minutes keeps a faint ghost of it, and CSS has no way to know what was on screen a moment ago.

A shader can, if you give it one. Render into a texture, read it back next frame, fade it, add the new content on top, and ping-pong between two buffers so you never read and write the same one.

\`\`\`glsl
vec4 prev = texture2D(uPrev, uv);
vec4 next = texture2D(uSource, uv);

// RGB decays fast: the visible smear behind moving content.
vec3 lit = max(next.rgb, prev.rgb * uDecay);

// Alpha accumulates slowly: burn-in under anything static.
float burn = min(prev.a + next.a * uBurnRate, uBurnMax);

gl_FragColor = vec4(lit, burn);
\`\`\`

Two decay rates in one buffer is the idea. RGB fades over a few frames, which is the trail behind moving text. Alpha climbs over minutes and never quite clears, which is the burn-in. Run it at half resolution: nobody has ever noticed that a glow is soft.

The rule that fell out of it: nothing else may write light straight to the screen. The first version drew impact flashes direct to the output and they looked wrong, because they were the only thing with no memory.

## Why should every effect share one clock?

Because the moment two subsystems each schedule their own frame, the order they run in stops being defined.

The scrolling, the shader, the physics and the readouts all want a frame loop. Let each one call [\`requestAnimationFrame\`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) itself and it works, until you notice scroll velocity is computed after the shader read it and the smear lags the scroll by exactly one frame. One loop at the top, everything subscribes, order is explicit.

Clamp the timestep while you are in there, or a backgrounded tab hands the physics solver a thirty-second step and every object teleports through the floor.

## What happens when someone turns motion off?

A screen that flickers, drifts and smears is exactly what [\`prefers-reduced-motion\`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) exists to protect people from, and honouring it is more than pausing an animation.

Under \`reduce\` the smooth-scroll library is never mounted, the shader draws one static frame and stops, reveals apply instantly, and the boot sequence doesn't run.

That last one caught me out. The boot hides the page until it finishes, using a class set before first paint. Skip the animation but keep the class and you have built a page that is permanently invisible to the people who most needed the accommodation.

## What would I tell someone building one?

Pick a premise and refuse anything that doesn't follow from it. The refusals are what make it look designed. I cut a cursor trail and an ambient audio bed late on, both of which I liked, because neither followed from anything.

Simulate the material rather than painting the symptom. Scanlines are a symptom, phosphor is the material, and the material gets you the symptom free along with effects you would never have hand-drawn.

Then reach for CSS first anyway. Most of this site is keyframes and an IntersectionObserver, and the WebGL is there for the one thing CSS cannot do.

One warning. An effect that fragments text fragments it for machines too, which cost me my own headline in search until I built [a tool to catch it](/tools/headline-check).`,
};
