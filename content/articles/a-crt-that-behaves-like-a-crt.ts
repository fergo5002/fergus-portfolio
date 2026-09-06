import type { Article } from "../articles";

export const crtThatBehaves: Article = {
  slug: "a-crt-that-behaves-like-a-crt",
  title: "Building a CRT that behaves like a CRT",
  description: "The screen on this site keeps a buffer of fading light. How that works, what it actually simulates, and the boot bug that hid the whole page.",
  date: "2026-08-10",
  updated: "2026-09-06",
  tags: ["WebGL","Motion","Frontend","Craft"],
  summary: "Implementation notes from this site's CRT interface: two render targets hold fading light from effects, fixed bands approximate burn-in, and one shared clock coordinates scroll, graphics and physics.",
  body: `The first version of this site had scanlines and green glow. It looked like an old monitor in a screenshot, but scrolling didn't change much. I wanted the screen to respond to what was happening on it.

I used an electron beam painting phosphor as the starting point. Fast scrolling pulls the glow along with it. Changing routes triggers a burst of channel static. When the terminal's gravity command drops the page, an impact adds light where an object lands.

## Keeping the previous frame

The shader uses two render targets. On each frame it reads the previous buffer, fades the stored light, adds the current effects and writes the result into the other buffer. Then the buffers swap.

RGB holds the short-lived glow. Alpha holds a slower burn-in approximation. A second pass reads this buffer, softens it and draws it with the glass effects.

The text itself is still browser-rendered HTML. The shader isn't taking photographs of the page or storing a ghost of each letter. Its emitters are the beam sweep, pointer, taps, degauss rings and physics impacts. For burn-in, it uses horizontal bands at the navigation and status strips.

That distinction was missing from the first version of this article. The actual implementation is in [PhosphorScreen.tsx](https://github.com/fergo5002/fergus-portfolio/blob/3d9b44c42c820b35ef9ed0fc32c5a6c2189cea8e/components/system/PhosphorScreen.tsx).

The buffers run at half the canvas resolution. The persistence layer is blurred when it is drawn, so I can spend fewer pixels on it than on the final image.

## The brightness change that barely changed anything

I once halved the degauss constants and thought I'd made the flash much dimmer. The new values were in the served bundle, the tests passed, and the flash looked almost identical.

The buffer was clamping its values to 1.0 on every frame. It also accumulated repeated deposits. The old numbers were far above the ceiling, so halving them still left the buffer saturated.

Reading a strip of pixels from the canvas showed roughly a two per cent change. I had to work backwards from the light reaching the screen to get a useful reduction. The constants now look less tidy, but changing them changes the picture.

## One clock

Scroll, physics, sound and the shader share the frame loop in SystemProvider. It updates the frame values and calls the subscribers in order. A collision can therefore reach the shader and synth in the same frame.

The loop also bounds the timestep after a tab has been in the background. Without that, the physics solver could be handed a long interval to simulate at once.

Per-frame values live in a mutable reference. The parts CSS needs are published as custom properties. React state handles controls and other occasional changes.

## The page still has to work

With reduced motion enabled, the smooth-scroll library stays unmounted, the shader draws a static frame and the boot animation is skipped. Sound is off by default, and enabling it doesn't start a continuous background tone.

The boot path caused a less interesting but more serious bug. A pre-paint script hides the page while the machine starts. Skipping the animation without clearing that class left the whole site invisible.

The animated name caused another: the HTML contained separate letters where a text extractor needed a name. I now render it whole on the server and switch to the character layer after mount. That led to [the survey of server-rendered headings](/writing/split-text-audit-2026).

You can try the screen from the terminal on [the home page](/): \`degauss\` sends a ring across it, and \`gravity\` drops the page. Escape restores the page after gravity.`,
};
