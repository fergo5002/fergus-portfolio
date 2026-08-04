# v5 "Mass" — design

**Date:** 2026-08-04
**Supersedes nothing.** Extends `2026-08-03-phosphor-motion-system-design.md`; every rule in
that document still holds.

## The problem with v4

v4 made the site behave like a tube. It was good, and it was finished: there was no obvious
next effect to add, only more of the same kind. Asked to push it much further, the honest
answer was not "more shader tricks" but that v4's premise had a ceiling built into it.

A cathode ray tube is a display. It has no memory of what it showed a second ago, no weight,
and no sound. v4 modelled the beam faithfully and therefore inherited all three limits. Every
effect it could still gain would have been another way of drawing light *now*.

## The premise for v5

**It is not a tube, it is a machine.** A machine is an object in a room. It has:

| Property | What it buys | Subsystem |
|---|---|---|
| Memory | Persistence, trails, burn-in, a degauss worth pressing | `PhosphorScreen` sim pass |
| Mass | Content that can be dropped, thrown and stacked | `lib/physics.ts` + `GravityStage` |
| Voice | Flyback whine, mains hum, relay clunks, the degauss sweep | `lib/audio.ts` |
| Body | A bezel, a desk, a room, a power LED | `lib/eject.ts` + the room shader |

Each is a property of the object, not an effect layered on it. That is the test for anything
added later: if it is not a consequence of the machine being a physical object, it does not go
in.

## Memory: the persistence buffer

Two passes, ping-ponging between two half-resolution render targets.

- **RGB is persistence.** Decays with a ~0.3s time constant, resolved per frame from a
  per-second rate so it lasts the same wall-clock time at 30fps as at 120.
- **Alpha is burn-in.** Accumulates over about a minute, decays over hours, and is cleared only
  by a degauss.
- **The buffer is advected.** It is sampled at an offset driven by scroll velocity, so the glow
  smears behind a fast scroll, and dragged radially by a degauss ring, so the ghost image is
  physically pulled apart before it is scrubbed.

Only the nav and status strips burn in, because they are the only chrome that never moves.
Burning in the body text would be wrong — it scrolls.

**8-bit targets, not half-float.** WebGL1 needs `OES_texture_half_float` *and*
`OES_texture_half_float_linear`, and a meaningful share of mobile GPUs advertise one without
honouring the other. The present pass dithers by ±1/255, which buys back the precision the
slow decay actually needed and is cheaper than the extension dance.

**Everything that emits light writes here.** The beam sweep, the pointer, taps, degauss rings
and physics impacts all deposit into the sim rather than being drawn in the present pass. That
is what keeps them physically consistent: they all smear, bloom and decay identically because
they are all the same quantity in the same buffer.

## Mass: the solver

`lib/physics.ts` is a real engine, not an approximation: oriented boxes, SAT with a clipped
two-point manifold, sequential impulses with warm starting, Coulomb friction, restitution and
sleeping. Structure follows Box2D-Lite with two deliberate departures, both documented in the
file — split impulses (so a restitution-0 word does not hop when it lands) and fixed
sub-stepping (so a backgrounded tab cannot teleport the pile through the floor).

Fake physics was considered and rejected. A CSS fall reads as an animation within about two
seconds of someone grabbing a word and trying to stack it on another one, and the whole point
is that they *can*.

`GravityStage` never mutates the live page. Word boxes are measured with `Range` rectangles,
which needs no wrapper spans and cannot disturb layout; the clones carry the real text in the
real font, so the pile is still readable when it settles. The original stays exactly where it
was, faded and `inert`, so returning is a deletion rather than a reassembly.

## Voice: the synth

Every sound is generated at runtime. There are no audio files in the repo and there must not
be — partly taste, mostly necessity: the beam hiss tracks scroll velocity continuously and the
degauss has to sweep on the same curve the shader's shockwave expands on. Neither is a sample.

Off by default. Every browser blocks audio before a gesture anyway, and a portfolio that starts
humming at someone in an open-plan office has misjudged the room. The affordance pulses instead.

## Body: the pull-back

`lib/eject.ts` is the single definition of where the screen sits, because two completely
different renderers have to agree on it: CSS scales the live DOM into a rectangle, and the
fragment shader draws the bezel, desk, dust and light spill around that same rectangle. A few
pixels of disagreement and the text visibly hangs over the plastic.

The room is lit entirely by the tube's own output, sampled from the persistence buffer. That is
both cheaper than re-rendering the tube per room pixel and closer to right: the glow is what
would actually light a dark room.

Scrolling was the awkward part. A fixed assembly takes its content out of flow, so the document
collapses and the page cannot scroll. Rather than reimplementing scrolling, a spacer restores
the original document height — native scrollbar, wheel, keyboard and Lenis all keep working —
and the content is translated by the live scroll position each frame. The site stays fully
usable while you are looking at it from across the room, which is most of the point.

## Boot

The tube is genuinely off. It strikes a bright horizontal line, opens vertically over about a
second and a half while the vertical hold rolls before locking, and the BIOS types into the
opening band. About 5.4 seconds, skippable at any point.

v4 hid the canvas during boot, which was correct then (the tube had nothing to say before the
desktop appeared) and became the bug that made all of this invisible. The canvas now stays up
and the overlay is transparent.

## What is deliberately not here

- **A physics library.** 90 kB to drop some words on the floor is the wrong trade for a
  portfolio, and the solver needed a specific departure from the standard one anyway.
- **Ambient always-on physics.** Considered and rejected: it never sits still for someone
  trying to read a CV.
- **Gravity and eject at once.** The pile is measured in viewport coordinates; scaling the
  viewport into a bezel underneath it would leave words falling through a floor that has moved.
  They are mutually exclusive by construction.
- **Anything at all under `prefers-reduced-motion`.** There is no still version of "the page
  falls on the floor", so it is refused rather than degraded, and the terminal says so instead
  of printing a confident line about something that is not going to happen.
