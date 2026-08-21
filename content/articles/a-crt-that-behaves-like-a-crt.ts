import type { Article } from "../articles";

export const crtThatBehaves: Article = {
  slug: "a-crt-that-behaves-like-a-crt",
  title: "Building a CRT that behaves like a CRT",
  description:
    "Most CRT effects are a scanline overlay and some glow. Deriving everything from one premise, a beam painting phosphor, gets you somewhere better.",
  date: "2026-08-10",
  tags: ["WebGL", "Motion", "Frontend", "Craft"],
  summary:
    "Technique for a CRT-styled web interface built from one physical premise rather than a stack of effects: a ping-pong persistence buffer for phosphor decay and burn-in, scroll velocity as beam velocity, and reduced-motion handling that degrades to a single static frame.",
  body: `Search for a CRT effect and you get the same recipe every time. A repeating linear gradient for scanlines, a text-shadow for glow, maybe a barrel-distortion filter, and a vignette. It reads as "old screen" and it's fine.

It also looks like a sticker. Every effect is independent, so nothing responds to anything else, and the moment you interact with the page the illusion drops.

I rebuilt mine from a single premise instead: **an electron beam painting phosphor behind glass.** Every effect has to follow from that or it doesn't go in. That constraint turned out to be the whole trick, because it stops you adding tricks.

## What does committing to the premise buy you?

Once you commit, a lot of decisions stop being aesthetic choices and start having correct answers.

Scroll velocity is beam velocity, so fast scrolling smears and hisses. A route change is a channel change. Idle time is a burn-in risk, so a screensaver isn't a gimmick, it's what the object would do. The cursor is a magnet near the tube. Text that lands hard should light the phosphor where it hits.

None of those are things I thought of and then justified. They fall out of the premise. That's the difference between a system and a pile of effects, and you can feel it as a user even if you'd never articulate why.

## Phosphor has memory

This is the effect that does most of the work, and it's the one the usual recipe can't express at all.

Phosphor keeps glowing after the beam has passed. A tube that has displayed the same navigation bar for ten minutes retains a faint ghost of it. A CSS overlay has no way to know what was on screen a moment ago, because CSS has no memory.

A shader can, if you give it one. Render into a texture, then next frame read that texture back, fade it slightly, and add the new content on top. Ping-pong between two buffers so you're never reading and writing the same one.

\`\`\`glsl
// Persistence pass, running at half resolution.
vec4 prev = texture2D(uPrev, uv);
vec4 next = texture2D(uSource, uv);

// RGB decays fast: that's the visible smear behind moving content.
vec3 lit = max(next.rgb, prev.rgb * uDecay);

// Alpha accumulates slowly: that's burn-in under anything static.
float burn = min(prev.a + next.a * uBurnRate, uBurnMax);

gl_FragColor = vec4(lit, burn);
\`\`\`

Two decay rates in one buffer is the whole idea. RGB fades over a few frames and gives you the trail behind moving text. Alpha climbs over minutes and never quite clears, giving you a permanent faint ghost under the header and the status bar. Same texture, two timescales, because that's genuinely what the material does.

Half resolution, because it's a glow. Nobody has ever noticed the persistence buffer is soft, and it's four times fewer pixels.

The rule that came out of this: **nothing else may write light directly to the screen.** Every effect deposits into the simulation buffer and lets it decay. The first version had impact flashes drawn straight to the output, and they looked wrong precisely because they were the only thing on screen with no memory.

## Why should every effect share one clock?

Because the moment two subsystems each schedule their own frame, the order they run in stops being defined, and you get a smear that lags the scroll by exactly one frame. If you take one practical thing from this, take this one.

Every subsystem here wants a frame loop. The smooth-scrolling library, the shader, the physics solver, the status readouts. The obvious approach is for each to call \`requestAnimationFrame\` itself, and it works, and then you find scroll velocity is computed after the shader read it, so the smear lags the scroll by exactly one frame.

One loop, at the top, and everything subscribes:

\`\`\`ts
const subscribers = new Set<(dt: number) => void>();

function tick(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30); // clamp a backgrounded tab
  last = now;
  for (const fn of subscribers) fn(dt);
  raf = requestAnimationFrame(tick);
}
\`\`\`

Order is now explicit and everything sees the same frame. The clamp matters more than it looks: without it, a tab that was backgrounded for thirty seconds hands the physics solver a thirty-second timestep and every object teleports through the floor.

The other rule is that per-frame values never go through React state. Sixty state updates a second will cost you the frame budget on their own. Mutate a ref, publish to a CSS custom property, and let the compositor read it:

\`\`\`ts
frame.current.velocity = v;
root.style.setProperty("--scroll-v", String(v));
\`\`\`

## What happens when someone turns motion off?

A screen that flickers, drifts and smears is exactly what \`prefers-reduced-motion\` exists to protect people from. Getting this right is not optional and it's more than pausing an animation.

Under \`reduce\`: the smooth-scroll library is never mounted at all, the shader draws exactly one static frame and stops, scroll reveals apply instantly rather than transitioning, and the boot sequence doesn't run.

The last one caught me out. The boot animation hides page content until it finishes, via a class set before first paint. Skip the animation but keep the class and you've built a page that is permanently invisible to the people who most needed the accommodation. Any pre-paint script that hides content needs a guaranteed path that reveals it again, and that path has to be the *first* thing you test, not the last.

## What would I tell someone building one?

One warning if you build anything like this: an effect that fragments text fragments it for machines too, which cost me my own headline in search. That is [its own article](/writing/split-text-is-costing-you-search).

**Pick a premise and refuse things that don't follow from it.** The refusals are what make it look designed. I cut a cursor trail and an ambient audio bed late on, both of which I liked, because neither followed from anything and both read as noise.

**Simulate the material, don't paint the symptom.** Scanlines are a symptom. Phosphor persistence is the material. Simulating the material gets you the symptom for free, plus every second-order effect you would never have thought to hand-draw.

**Reach for CSS first anyway.** Most of this site is CSS keyframes and an IntersectionObserver. The WebGL is there for the one thing CSS genuinely cannot do, which is remember what it was showing a second ago. Using a shader for a fade would be showing off, and it would cost you a frame budget you'll want later.`,
};
