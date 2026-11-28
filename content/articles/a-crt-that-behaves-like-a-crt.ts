import type { Article } from "../articles";

export const crtThatBehaves: Article = {
  slug: "a-crt-that-behaves-like-a-crt",
  title: "Building a CRT that behaves like a CRT",
  description:
    "Most CRT effects are a scanline overlay and some glow. I built mine from one idea, a beam painting phosphor, and it looks way better for it.",
  date: "2026-08-07",

  updated: "2026-11-25",
  tags: ["WebGL", "Motion", "Frontend", "Craft"],
  summary:
    "How I built a CRT-styled website from one physical idea instead of a stack of effects: a ping-pong persistence buffer for phosphor decay and burn-in, scroll speed as beam speed, one shared frame clock, and reduced motion that drops to a single still frame.",
  body: `Search for a CRT effect and you get the same recipe every time: a gradient for scanlines, a text-shadow for glow, a vignette. It reads as an old screen and it's fine. But it looks like a sticker, because none of the effects know about each other, so nothing reacts to anything and the illusion falls apart the second you touch the page.

## What does committing to one premise buy you?

I rebuilt mine from one idea: an electron beam painting phosphor behind glass. Every effect has to come from that or it doesn't go in.

That rule is the whole trick, because it stops you adding tricks. Choices that used to be taste start having right answers.

Where the usual recipe paints a scanline gradient, the beam idea says scroll speed is beam speed, so scrolling fast smears. Where it adds a text-shadow glow, phosphor keeps glowing after the beam's gone. The vignette turns into burn-in under anything that sits still long enough, and changing page turns into changing channel.

I didn't think of those and then justify them. They just fall out of the idea, and that's what makes it feel like one system instead of a pile of effects.

## Phosphor has memory

This is the effect doing most of the work, and the usual recipe can't do it at all. A tube that's shown the same nav bar for ten minutes keeps a faint ghost of it, and CSS has no idea what was on screen a moment ago.

A shader can, if you give it somewhere to remember. Render into a texture, read it back next frame, fade it, add the new content on top, and ping-pong between two buffers so you never read and write the same one.

\`\`\`glsl
vec4 prev = texture2D(uPrev, uv);
vec4 next = texture2D(uSource, uv);

// RGB decays fast: the visible smear behind moving content.
vec3 lit = max(next.rgb, prev.rgb * uDecay);

// Alpha accumulates slowly: burn-in under anything static.
float burn = min(prev.a + next.a * uBurnRate, uBurnMax);

gl_FragColor = vec4(lit, burn);
\`\`\`

The trick is two decay rates in one buffer. RGB fades over a few frames, which gives you the trail behind moving text. Alpha builds up over minutes and never quite clears, which is the burn-in. Run it at half resolution, because nobody has ever noticed a glow is soft.

The rule that came out of it: nothing else gets to write light straight to the screen. My first version drew impact flashes directly to the output and they looked wrong, because they were the only thing on screen with no memory.

## Why should every effect share one clock?

Because once two parts each run their own frame loop, the order they run in isn't defined any more.

Scrolling, the shader and the physics all want a frame loop. Let each one call [\`requestAnimationFrame\`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) itself and it works, until you notice scroll speed gets worked out after the shader's already read it, so the smear lags the scroll by exactly one frame. One loop at the top, everything subscribes, and the order is explicit.

Clamp the timestep while you're at it, or a backgrounded tab hands the physics a thirty-second step and everything teleports through the floor.

## What happens when someone turns motion off?

A screen that flickers, drifts and smears is exactly what [\`prefers-reduced-motion\`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) is there to protect people from, and respecting it means more than pausing an animation.

Under \`reduce\` the smooth-scroll library never gets mounted, the shader draws one still frame and stops, reveals happen instantly and the boot sequence doesn't run.

That last one caught me out. The boot hides the page until it's done, using a class set before first paint. Skip the animation but leave the class and you've built a page that's permanently invisible to the people who most needed it.

## What would I tell someone building one?

Pick one idea and say no to anything that doesn't come from it. Saying no is what makes it look designed. I cut a cursor trail and an ambient audio bed late on, and I liked both, but neither came from anything.

Simulate the material, not the symptom. Scanlines are a symptom. Phosphor is the material, and if you get the material right you get the symptom for free, plus effects you'd never have drawn by hand.

Then still reach for CSS first. Most of this site is keyframes and an IntersectionObserver, and the WebGL is only there for the one thing CSS can't do.

One warning. An effect that breaks text up breaks it up for machines too, which cost me my own headline in search until I built [a tool to catch it](/tools/headline-check).`,
};
