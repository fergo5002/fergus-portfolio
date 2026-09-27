"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, RenderTarget, Renderer, Triangle } from "ogl";
import { MAX_FRAME_IMPACTS, THEME_PHOSPHOR } from "@/lib/system";
import {
  boxToGl,
  ejectCase,
  ejectGeometry,
  ejectLayout,
  ejectLean,
  ejectScaleFor,
  ejectScreenRect,
  placeBox,
  powerOpen,
} from "@/lib/eject";
import type { EjectLayout } from "@/lib/eject";
import { BEAM_RADIUS, MAX_BEAM_POINTS, clearBeam } from "@/lib/beam";
import { useSystem } from "./SystemProvider";

/** The beam's capsule radius as a GLSL float literal: `toFixed` so a round number cannot arrive as an int. */
const BEAM_R = BEAM_RADIUS.toFixed(4);

/**
 * The tube itself.
 *
 * v5 splits this into two passes, because the single-pass version could only
 * ever draw what was happening *now*. Real phosphor keeps glowing after the
 * beam has moved on, and a real tube that has displayed the same nav bar for
 * ten minutes keeps a faint ghost of it forever. Neither is expressible without
 * somewhere to remember, so:
 *
 *  1. **Sim pass**: ping-pongs between two render targets at half resolution.
 *     RGB is short-lived persistence (decays over roughly a third of a second);
 *     alpha is burn-in, which accumulates over minutes and is only ever cleared
 *     by a degauss. Everything that emits light writes here: the beam, the
 *     pointer, taps, degauss rings, and physics impacts.
 *  2. **Present pass**: draws the rain at full resolution, adds the blurred
 *     persistence buffer over the top, then applies the glass: curvature,
 *     aperture grille, scanlines, chromatic aberration, vignette. Also owns the
 *     power-on line and, when the camera pulls back, the entire room.
 *
 * The half-resolution buffer is not a compromise. Persistence glow is diffuse by
 * definition, so sampling it soft and cheap is both faster and more correct than
 * sampling it sharp.
 */

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/* Shared GLSL. Concatenated into both programs rather than duplicated, so the
   two passes cannot drift apart on the geometry they both depend on. */
const COMMON = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform float uAspect;
uniform vec2  uPointer;
uniform float uPointerActive;
uniform float uScrollVel;
uniform float uDegauss;
uniform float uTap;
uniform vec2  uTapPos;
uniform vec3  uPhosphor;
uniform float uMobile;
uniform float uGravity;
uniform vec3  uImpacts[${MAX_FRAME_IMPACTS}];

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* Expanding shell used by both the degauss and a tap: a gaussian band whose
   radius grows with age and whose amplitude collapses. The sim uses it to drag
   the persistence buffer outwards and to scrub burn-in; the present pass uses
   it for the flash. One function so the light and the distortion can never
   disagree about where the wave is. */
float shockBand(float age, float dist, float speed, float width, float decay) {
  float radius = age * speed;
  return exp(-pow((dist - radius) * width, 2.0)) * exp(-age * decay);
}
`;

/* ── pass 1: persistence + burn-in ───────────────────────────────────────── */
const SIM_FRAG =
  COMMON +
  /* glsl */ `
uniform sampler2D tPrev;
uniform float uDecay;
uniform float uEmit;
uniform float uBurnRate;
uniform vec2  uNavBand;
uniform vec2  uStatusBand;
uniform float uLive;
uniform vec2  uBeamPts[${MAX_BEAM_POINTS}];
uniform float uBeamCount;
uniform float uBeamGain;

void main() {
  vec2 uv = vUv;

  // ── advection ────────────────────────────────────────────────────────────
  // Sampling the previous frame at an offset is what turns a decay buffer into
  // a smear: the whole glow is dragged with the beam. Scrolling fast pulls the
  // persistence up or down behind you, exactly like a slow tube being panned.
  vec2 src = uv;
  src.y -= uScrollVel * 0.0055;

  float dgDrag = 0.0;
  if (uDegauss < 2.4) {
    vec2 toC = uv - 0.5;
    toC.x *= uAspect;
    float d = length(toC);
    dgDrag = shockBand(uDegauss, d, 0.95, 7.5, 1.5);
    src += normalize(toC + 1e-5) * dgDrag * 0.045;
  }

  vec4 prev = texture2D(tPrev, clamp(src, 0.001, 0.999));
  vec3 energy = prev.rgb * uDecay;
  float burn = prev.a;

  // ── emitters ─────────────────────────────────────────────────────────────
  float add = 0.0;

  // The beam's own sweep. Faster scrolling means a brighter, longer streak.
  float absVel = min(abs(uScrollVel), 1.6);
  float beamY = fract(uTime * 0.11 + uScrollVel * 0.35);
  add += exp(-pow((uv.y - beamY) * 30.0, 2.0)) * (0.02 + absVel * 0.10);

  // Dialled back on 2026-08-20. Read these numbers with the clamp in mind, or
  // they look wrong.
  //
  // This buffer is 8-bit and clamped to 1.0 on every frame, and it integrates
  // roughly twenty frames of deposit at 60fps (uDecay is 0.045^(dt/1000), about
  // 0.9496, so a sustained deposit multiplies by ~19.9). The old ring constants
  // sat about fourteen times over that ceiling, which means they had stopped
  // describing a brightness at all: halving 0.85 to 0.425 left the degauss
  // saturating exactly as before and moved the picture by about two percent. A
  // code review caught that after the "half" had already been written, tested
  // and proved shipped, which is the whole lesson.
  //
  // So these are solved backwards from what lands on screen rather than divided
  // by two, and each keeps its old sim-to-present ratio so only the level moved.
  // Peak green in the buffer before the clamp, at the 60fps reference:
  //   degauss   5.93 -> 0.42
  //   tap       3.86 -> 0.38
  //   pointer   1.99 -> 0.99   (a resting cursor, which is its worst case)
  //
  // uEmit is what makes those numbers mean anything on a real machine. See the
  // note where it is computed: the deposits used to be per frame while the decay
  // was per second, so brightness scaled with the visitor's refresh rate. The
  // same constants ran at half strength on a 60Hz laptop and full strength on a
  // 120Hz monitor, and at 165Hz the degauss clipped white again, which would
  // have made this whole change invisible to anyone on a fast display. A second
  // review caught that. Normalised, all three are now flat within one percent
  // from 30fps to 165fps.
  //
  // The beam above and the impacts below are deliberately NOT normalised. They
  // were not part of what was asked for, they have never been tuned against a
  // reference rate, and quietly rescaling them here would change two effects
  // nobody complained about.
  //
  // The advection above and the burn-in scrub below read the same dgDrag and are
  // deliberately untouched, so the wave still drags the picture and a degauss
  // still clears burn-in, which is the entire reason that button ever existed.
  if (uPointerActive > 0.01) {
    vec2 toP = uv - uPointer;
    toP.x *= uAspect;
    add += exp(-length(toP) * 9.0) * 0.05 * uEmit * uPointerActive;
  }

  if (uTap < 1.6) {
    vec2 toT = uv - uTapPos;
    toT.x *= uAspect;
    add += shockBand(uTap, length(toT), 0.72, 9.0, 2.2) * 0.11 * uEmit;
  }

  add += dgDrag * 0.06 * uEmit;

  // ── impacts ──────────────────────────────────────────────────────────────
  // A word hitting the floor is a physical event on the other side of the
  // glass, so it deposits light here rather than being drawn as a sprite. The
  // persistence buffer then smears it exactly like everything else.
  for (int i = 0; i < ${MAX_FRAME_IMPACTS}; i++) {
    vec3 im = uImpacts[i];
    if (im.z <= 0.0) continue;
    vec2 toI = uv - im.xy;
    toI.x *= uAspect;
    float d = length(toI);
    add += exp(-d * 42.0) * im.z * 1.6;
    add += exp(-pow((d - 0.012) * 90.0, 2.0)) * im.z * 0.5;
  }

  // ── the beam ─────────────────────────────────────────────────────────────
  // Anything drawing with the gun rather than with the page (lib/beam.ts)
  // hands over the path the beam swept since the last frame, and it lands
  // here as a capsule of light around that polyline, measured with x
  // stretched by the aspect so the glow is round. The gain arrives already
  // normalised for frame rate from the CPU and is not scaled again here. It
  // goes into the energy, so a trail decays behind the beam like everything
  // else on this tube, and never into burn-in.
  if (uBeamCount > 0.5) {
    vec2 bq = vec2(uv.x * uAspect, uv.y);
    vec2 ba = vec2(uBeamPts[0].x * uAspect, uBeamPts[0].y);
    float bd = length(bq - ba);
    for (int i = 1; i < ${MAX_BEAM_POINTS}; i++) {
      if (float(i) >= uBeamCount) break;
      vec2 bb = vec2(uBeamPts[i].x * uAspect, uBeamPts[i].y);
      vec2 bv = bb - ba;
      float bh = clamp(dot(bq - ba, bv) / max(dot(bv, bv), 1e-8), 0.0, 1.0);
      bd = min(bd, length(bq - ba - bv * bh));
      ba = bb;
    }
    float bk = bd / ${BEAM_R};
    add += exp(-bk * bk) * uBeamGain;
  }

  energy += uPhosphor * add;

  // ── burn-in ──────────────────────────────────────────────────────────────
  // Only the chrome that never moves burns in: the nav strip and the status
  // strip. That is the honest model: a ghost of the body text would be wrong,
  // because the body text scrolls.
  float staticMask =
    step(uNavBand.x, uv.y) * step(uv.y, uNavBand.y) +
    step(uStatusBand.x, uv.y) * step(uv.y, uStatusBand.y);
  burn = burn * 0.99992 + staticMask * uBurnRate * uLive;

  // A degauss is the only thing that clears it, which is the entire reason
  // people used to press that button.
  burn *= 1.0 - clamp(dgDrag * 3.5, 0.0, 1.0);

  gl_FragColor = vec4(clamp(energy, 0.0, 1.0), clamp(burn, 0.0, 1.0));
}
`;

/* ── pass 2: present ─────────────────────────────────────────────────────── */
const PRESENT_FRAG =
  COMMON +
  /* glsl */ `
uniform sampler2D tSim;
uniform float uRain;
uniform float uLive;
uniform float uIntensity;
uniform float uScanlines;
uniform float uPower;      // 0..1 power-on ramp; 1 = fully up
uniform float uEject;      // 0..1 camera pull-back
uniform vec4  uScreenRect; // x0, y0, x1, y1 in GL uv (y up)
// The monitor, all from lib/eject.ts, which places the DOM controls from the
// same numbers. Sizes are in viewport heights, rectangles in GL uv.
uniform vec4  uCase;       // bezel side, bezel top, chin, outer corner radius
uniform vec2  uCaseB;      // the glass's corner radius, the base's height
uniform vec4  uDeck;       // the recess the controls are set into
uniform vec4  uGrille;     // the speaker grille; zero width where there is none
uniform vec3  uLed;        // the power LED's centre, then its level
uniform vec2  uLean;       // the pointer's lean, -1..1, y down as CSS has it, scaled by the eject
uniform float uLineFade;   // 1, except once the monitor's own switch has turned the tube off

const vec3 BASE = vec3(0.039, 0.055, 0.039);

/* GL uv to the room's space: viewport heights, centred, y up. */
vec2 toQ(vec2 p) {
  return (p - 0.5) * vec2(uAspect, 1.0);
}

vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 off = abs(c.yx) / vec2(7.0, 6.0);
  c += c * off * off;
  return c * 0.5 + 0.5;
}

float rain(vec2 uv, float t, float smear) {
  // 48 rather than 32 on a phone. At 32 columns across a 0.6 dpr buffer a cell
  // was about 12 CSS pixels square and the rain read as blocky green dirt
  // behind the text on both mobile engines (2026-09-06). Finer cells and the
  // gain in tubeImage bring it back to texture. Fergus chose toning it down
  // over removing it.
  float cols = mix(54.0, 48.0, uMobile);
  float rows = cols * (uResolution.y / max(uResolution.x, 1.0)) * 1.25;

  vec2 grid = vec2(cols, rows);
  vec2 cellPos = uv * grid;
  vec2 id = floor(cellPos);
  vec2 f = fract(cellPos);

  float speed = 0.05 + hash11(id.x) * 0.19;
  float off = hash11(id.x + 41.3) * 10.0;

  float cellY = id.y / rows;
  float tail = fract(cellY + t * speed + off);

  float sharpness = mix(20.0, 5.0, clamp(smear, 0.0, 1.0));
  float body = pow(tail, sharpness);
  float head = smoothstep(0.984, 1.0, tail);

  vec2 d = floor(f * vec2(3.0, 5.0));
  vec2 dIn = fract(f * vec2(3.0, 5.0));
  float ink =
    step(0.16, dIn.x) * step(dIn.x, 0.84) *
    step(0.10, dIn.y) * step(dIn.y, 0.90);
  float lit = step(0.44, hash21(id * 3.1 + d * 17.3 + floor(t * 5.0)));

  return (body * 0.62 + head * 1.0) * ink * lit;
}

/* Persistence, sampled as a small cross. Four extra taps buys a soft bloom for
   far less than a separate blur pass would cost. */
vec4 persistence(vec2 uv) {
  vec2 px = 2.4 / uResolution;
  vec4 c = texture2D(tSim, uv) * 0.36;
  c += texture2D(tSim, uv + vec2(px.x, 0.0)) * 0.16;
  c += texture2D(tSim, uv - vec2(px.x, 0.0)) * 0.16;
  c += texture2D(tSim, uv + vec2(0.0, px.y)) * 0.16;
  c += texture2D(tSim, uv - vec2(0.0, px.y)) * 0.16;
  return c;
}

/* Rounded box SDF: negative inside, positive outside. */
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

/* ── the tube's own image, in screen space ─────────────────────────────────
   Everything from here to the room boundary works in suv, which is the full
   viewport when docked and the monitor's rectangle when ejected. lineScale
   keeps the scanline pitch constant on the physical display as the image
   shrinks: a smaller picture with the same line count is technically more
   correct but aliases into moire the moment it is scaled. */
vec3 tubeImage(vec2 suv, float lineScale) {
  vec2 uv = suv;
  float t = uTime;
  float glow = 0.0;
  // The phone's rain at a bit over half strength, on every sample below, so
  // the chromatic split cannot end up brighter than the centre.
  float rainGain = mix(1.0, 0.55, uMobile);

  // Moved alongside the deposits in the sim pass, and it has to be both: the
  // persistence buffer is what smears behind the pointer, so dimming one and
  // not the other would leave the lagging trail brighter than the thing casting
  // it. See the long note in SIM_FRAG for why the ring numbers are not simply
  // halves. Every uv offset below is deflection rather than light and is
  // untouched, which is what keeps the glass feeling pressed on rather than
  // merely dimmer.
  if (uPointerActive > 0.01) {
    vec2 toP = uv - uPointer;
    toP.x *= uAspect;
    float d = length(toP);
    float ripple = sin(d * 34.0 - t * 2.6) * exp(-d * 7.0);
    uv += normalize(toP + 1e-5) * ripple * 0.0045 * uPointerActive;
    glow += exp(-d * 5.0) * 0.025 * uPointerActive;
  }

  if (uTap < 1.6) {
    vec2 toT = uv - uTapPos;
    toT.x *= uAspect;
    float d = length(toT);
    float band = shockBand(uTap, d, 0.72, 9.0, 2.2);
    uv += normalize(toT + 1e-5) * band * 0.04;
    glow += band * 0.10;
  }

  if (uDegauss < 2.4) {
    vec2 toC = uv - 0.5;
    toC.x *= uAspect;
    float d = length(toC);
    float band = shockBand(uDegauss, d, 0.95, 7.5, 1.5);
    uv += normalize(toC + 1e-5) * band * 0.055;
    glow += band * 0.05;
  }

  uv = curve(uv);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(0.0);
  }

  float absVel = min(abs(uScrollVel), 1.6);
  float r = rain(uv, t, absVel * 0.9) * uRain * rainGain;
  float hum = pow(sin((uv.y + t * 0.045) * 6.2831) * 0.5 + 0.5, 14.0) * 0.05;

  vec3 col = BASE + uPhosphor * (r + hum + glow);

  // Persistence and burn-in, both read from the sim buffer.
  vec4 sim = persistence(uv);
  col += sim.rgb * (1.0 + uGravity * 0.6);

  // The ghost is faintest on a bright screen and unmistakable on a dark one,
  // which is exactly when anyone has ever noticed burn-in on a real monitor.
  float ghost = sim.a * (0.035 + 0.42 * (1.0 - uLive));
  col += uPhosphor * ghost;

  if (uMobile < 0.5) {
    float ca = absVel * 0.0022;
    float rr = rain(uv + vec2(ca, 0.0), t, absVel * 0.9) * uRain * rainGain;
    float bb = rain(uv - vec2(ca, 0.0), t, absVel * 0.9) * uRain * rainGain;
    col.r += uPhosphor.r * (rr - r) * 0.8;
    col.b += uPhosphor.b * (bb - r) * 0.8;
  }

  float sl = mix(1.0, 0.78 + 0.22 * sin(uv.y * uResolution.y * lineScale * 3.14159), uScanlines);
  col *= sl;

  // The grille is a physical mask at the tube's own pitch, so unlike the
  // scanlines it cannot be rescaled: it is faded out instead as the image
  // shrinks past the point where three device pixels still resolve it.
  if (uMobile < 0.5) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 grille = vec3(
      1.0 - 0.28 * step(1.0, m),
      1.0 - 0.28 * (1.0 - step(1.0, m) * step(m, 2.0)),
      1.0 - 0.28 * step(m, 2.0)
    );
    col *= mix(vec3(1.0), grille, uScanlines * 0.7 * (1.0 - uEject * 0.85));
  }

  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 26.0, 0.0, 1.0), 0.22);

  col = mix(BASE, col, clamp(uLive, 0.0, 1.0) * uIntensity);
  return col;
}

/**
 * How brightly the tube is lighting the room, without re-rendering it.
 *
 * The obvious implementation: call tubeImage again and take its luminance,
 * costs three more rain evaluations on every single room pixel, which is most
 * of the screen once ejected. The persistence buffer already holds a blurred
 * record of everything the tube emitted, which is precisely what a room would
 * be lit by, so it is both cheaper and closer to right.
 */
float tubeGlow(vec2 suv) {
  vec4 sim = texture2D(tSim, clamp(suv, 0.0, 1.0));
  float base = 0.075 + dot(sim.rgb, vec3(0.34)) * 0.9;
  return base * clamp(uLive, 0.0, 1.0) * uIntensity;
}

/* ── the room ─────────────────────────────────────────────────────────────
   Drawn only when the camera has pulled back. Everything is 2D signed-distance
   work in aspect-corrected space, lit by the tube's own output: the monitor is
   the only light source in the room, which is what makes the pull-back land.

   The monitor is an object now (2026-09-27): a case with a chin deep enough to
   hold working controls, a base standing on a desk whose back edge is behind
   it, a side that shows as you lean, and a light off the glass that follows
   you. Every size arrives as a uniform from lib/eject.ts, which places the DOM
   controls from the same numbers, so the plastic and the knobs set into it
   agree by construction. The numbers left in here are light, not geometry. */
vec3 room(vec2 uv, vec2 rectMin, vec2 rectMax, float screenLuma) {
  vec2 q = toQ(uv);
  vec2 rc = toQ((rectMin + rectMax) * 0.5);
  vec2 rh = (rectMax - rectMin) * 0.5 * vec2(uAspect, 1.0);

  float dScreen = sdRoundBox(q - rc, rh, uCaseB.x);

  // The case: a bezel either side and above, the chin below.
  vec2 bh = vec2(rh.x + uCase.x, rh.y + (uCase.y + uCase.z) * 0.5);
  vec2 bc = rc - vec2(0.0, (uCase.z - uCase.y) * 0.5);
  float dBezel = sdRoundBox(q - bc, bh, uCase.w);
  float caseFoot = bc.y - bh.y;
  // Where the base meets the desk.
  float floorY = caseFoot - uCaseB.y;

  // ── light spill ──────────────────────────────────────────────────────────
  // The tube lights its own surroundings. Falls off fast, flickers gently with
  // the mains hum, and picks up whatever the phosphor colour currently is.
  float flicker = 0.94 + 0.06 * sin(uTime * 6.2831 * 0.7) + 0.03 * hash11(floor(uTime * 24.0));
  float spill = exp(-max(dScreen, 0.0) * 5.2) * screenLuma * 5.5 * flicker;

  // The wall: near black, lit only by the tube.
  vec3 col = vec3(0.012, 0.013, 0.016);
  col += uPhosphor * spill * 0.6;

  // ── desk ─────────────────────────────────────────────────────────────────
  // Its back edge is behind the monitor, so the monitor stands on the desk
  // rather than on the lip of a slab. The strip beside it recedes into the
  // dark; the part in front catches a pool of the screen's light.
  float horizon = floorY + bh.y * 0.2;
  float onDesk = smoothstep(horizon + 0.0015, horizon - 0.0015, q.y);
  float ahead = floorY - q.y;
  if (onDesk > 0.0) {
    vec3 desk = vec3(0.030, 0.028, 0.025);
    // Wood-ish grain, very low contrast, and not worth a hash on the cheap path.
    if (uMobile < 0.5) desk *= 0.85 + 0.3 * hash21(vec2(q.x * 90.0, floor(q.y * 260.0)));
    desk *= mix(0.5, 1.0, smoothstep(horizon, floorY - 0.02, q.y));

    // The pool: brightest at the base, spreading wider than the case and
    // foreshortened, because the desk is seen at a low angle.
    float across = max(abs(q.x - bc.x) - bh.x * 0.85, 0.0);
    float pool = exp(-max(ahead, 0.0) * 4.2) * exp(-across * 4.0);
    desk += uPhosphor * screenLuma * pool * 3.8 * flicker;
    // Behind the base, the spill that clears the case.
    desk += uPhosphor * spill * 0.22;

    // Reflection, mirrored where the base meets the desk. The chin and the base
    // reflect first, as dark plastic, and the glass's glow only below that, the
    // way a lacquered desk shows it. The persistence buffer is the tube's own
    // image, so it is sampled in screen space.
    if (ahead > 0.0) {
      float sx = (uv.x - rectMin.x) / max(rectMax.x - rectMin.x, 1e-4);
      float lift = (rc.y - rh.y) - floorY;
      float my = (ahead - lift) / max(rh.y * 2.0, 1e-4);
      vec4 refl = texture2D(tSim, clamp(vec2(sx, my), 0.0, 1.0));
      float reflFade = exp(-ahead * 6.0) * step(0.0, sx) * step(sx, 1.0) * smoothstep(0.0, 0.03, my);
      desk += (refl.rgb + uPhosphor * screenLuma * 0.5) * reflFade * 0.55;
    }
    col = mix(col, desk, onDesk);
  }
  // The desk's back edge catches a thread of the spill.
  col += uPhosphor * spill * 0.35 * exp(-abs(q.y - horizon) * 900.0);

  // Contact shadow round the base.
  vec2 cs = vec2((q.x - bc.x) / (bh.x * 0.62), (q.y - floorY) / max(uCaseB.y * 1.1, 1e-4));
  col *= 1.0 - 0.6 * onDesk * exp(-dot(cs, cs) * 1.6);

  // ── dust in the beam ─────────────────────────────────────────────────────
  // Only visible where the light is, which is the only place dust is ever
  // visible in a dark room. Skipped entirely on the cheap path: it is four
  // hashes and a sin per pixel for something nobody resolves on a phone, and
  // unbudgeted per-pixel work on mobile is how this project lost v4.
  if (uMobile < 0.5) {
  vec2 dg = q * 26.0 + vec2(0.0, uTime * 0.09);
  vec2 dcell = floor(dg);
  vec2 dfrac = fract(dg) - 0.5;
  float dseed = hash21(dcell);
  vec2 dpos = (vec2(hash11(dseed * 7.1), hash11(dseed * 3.3)) - 0.5) * 0.7;
  float mote = exp(-length(dfrac - dpos) * 42.0);
  mote *= step(0.93, dseed) * (0.5 + 0.5 * sin(uTime * 1.7 + dseed * 40.0));
  col += uPhosphor * mote * spill * 2.2;
  }

  // ── the side of the case, as you lean ────────────────────────────────────
  // Lean right and you see past the right edge: the case's side, tapering
  // towards the back the way a tube's housing does. No tilt of the glass, so
  // the screen stays the rectangle the DOM is scaled into.
  float lx = uLean.x;
  if (abs(lx) > 0.01) {
    float sgn = sign(lx);
    float depth = bh.y * 0.08 * abs(lx);
    float t = ((q.x - bc.x) * sgn - bh.x) / max(depth, 1e-5);
    if (t > 0.0 && t < 1.0) {
      float topY = bc.y + bh.y - uCase.w - t * bh.y * 0.3;
      float botY = caseFoot + uCase.w * 0.5 + t * bh.y * 0.06;
      float inY = smoothstep(botY - 0.001, botY + 0.001, q.y) * smoothstep(topY + 0.001, topY - 0.001, q.y);
      // Darker than the front and darker still towards the back, catching
      // the screen's spill along the edge that faces it.
      vec3 flank = vec3(0.072, 0.070, 0.066) * mix(0.85, 0.35, t);
      flank += uPhosphor * spill * mix(0.16, 0.04, t);
      col = mix(col, flank, inY);
    }
  }

  // ── the base ─────────────────────────────────────────────────────────────
  float baseH = uCaseB.y;
  float dBase = sdRoundBox(q - vec2(bc.x, caseFoot - baseH * 0.5), vec2(bh.x * 0.5, baseH * 0.5), baseH * 0.4);
  float baseMask = smoothstep(0.0015, -0.0015, dBase);
  if (baseMask > 0.0) {
    // In the case's shadow at the top, catching the desk's glow at the bottom.
    vec3 foot = vec3(0.072, 0.070, 0.066) * mix(0.62, 0.3, smoothstep(floorY, caseFoot, q.y));
    foot += uPhosphor * screenLuma * 0.05;
    col = mix(col, foot, baseMask);
  }

  // ── the bezel itself ─────────────────────────────────────────────────────
  float bezelMask = smoothstep(0.002, -0.002, dBezel) * smoothstep(-0.002, 0.002, dScreen);
  if (bezelMask > 0.0) {
    vec3 plastic = vec3(0.072, 0.070, 0.066);
    // Injection-moulded grain.
    if (uMobile < 0.5) plastic *= 0.9 + 0.2 * hash21(q * 420.0);

    // Lit from above and from the screen itself: the inner edge catches the
    // phosphor, which is the single detail that makes plastic read as plastic.
    //
    // Note the sign. dScreen is positive everywhere on the bezel and grows with
    // distance from the glass, so exp(+dScreen * 60) runs away to a blown-out
    // neon frame within a few millimetres. It has to decay.
    float up = smoothstep(-0.02, 0.06, q.y - rc.y);
    plastic *= 0.72 + 0.5 * up;
    plastic += uPhosphor * exp(-dScreen * 90.0) * 0.22;

    // A light somewhere behind you, caught by the case: it slides along the
    // rim and across the face as you lean, the way a window's reflection moves
    // across a monitor when you shift in your chair.
    vec2 lamp = bc + vec2(uLean.x * bh.x * 0.9, bh.y * (1.25 - uLean.y * 0.35));
    float near = exp(-length(q - lamp) * 2.4);
    float rim = smoothstep(0.006, 0.0, abs(dBezel + 0.004));
    plastic += vec3(0.05) * rim * (0.4 + 0.6 * up) * (0.45 + 1.3 * near);
    plastic += vec3(0.014) * near;

    // The recess the controls are set into: darker, its upper lip in shadow
    // and its lower lip catching the light.
    vec2 dk0 = toQ(uDeck.xy);
    vec2 dk1 = toQ(uDeck.zw);
    float lip = uCase.w * 0.18;
    float dDeck = sdRoundBox(q - (dk0 + dk1) * 0.5, (dk1 - dk0) * 0.5 + vec2(lip), lip);
    plastic *= 1.0 - 0.3 * smoothstep(0.0008, -0.0008, dDeck);
    float edge = smoothstep(lip * 0.5, 0.0, abs(dDeck));
    float below = step(q.y, (dk0.y + dk1.y) * 0.5);
    plastic += vec3(0.022) * edge * below;
    plastic *= 1.0 - 0.3 * edge * (1.0 - below);

    // The speaker grille. The tube has a voice.
    if (uGrille.z > uGrille.x) {
      vec2 g0 = toQ(uGrille.xy);
      vec2 g1 = toQ(uGrille.zw);
      float pitch = (g1.y - g0.y) / 5.0;
      vec2 gc = (q - g0) / pitch;
      float inGrille = step(0.0, gc.x) * step(gc.x, (g1.x - g0.x) / pitch) * step(0.0, gc.y) * step(gc.y, 5.0);
      float hole = smoothstep(0.27, 0.2, length(fract(gc) - 0.5));
      plastic *= 1.0 - 0.62 * hole * inGrille;
    }

    // Power LED, where lib/eject.ts puts it beside the power button, dimming
    // with the tube.
    float dLed = length(q - toQ(uLed.xy));
    plastic += uPhosphor * exp(-dLed * 300.0) * 1.3 * uLed.z;
    plastic += uPhosphor * exp(-dLed * 60.0) * 0.09 * uLed.z;

    col = mix(col, plastic, bezelMask);
  }

  // Room vignette.
  vec2 vv = uv * (1.0 - uv.yx);
  col *= pow(clamp(vv.x * vv.y * 20.0, 0.0, 1.0), 0.30);

  return col;
}

void main() {
  vec2 uv = vUv;

  // ── power-on ─────────────────────────────────────────────────────────────
  // A cold tube does not fade up; it strikes a bright horizontal line and then
  // opens vertically as the vertical deflection comes back. Everyone who ever
  // switched off a television knows this shape in reverse.
  float openT = smoothstep(0.05, 0.62, uPower);
  float halfBand = mix(0.0016, 0.5, openT);
  float yFromMid = uv.y - 0.5;
  // Vertical hold not quite locked yet: the picture rolls a couple of times
  // before it settles. Skipped entirely once locked, so a fully powered tube
  // never pays for a fract() that would map its top row onto its bottom one.
  float roll = (1.0 - smoothstep(0.55, 0.98, uPower)) * 0.9;
  float strikeMask = 1.0;

  vec3 col;

  if (uEject > 0.001) {
    // Ejected, the same collapse happens inside the glass. The room stays, lit
    // by whatever the tube still gives off, so the monitor and its power button
    // are there to switch it back on.
    vec2 rectMin = uScreenRect.xy;
    vec2 rectMax = uScreenRect.zw;
    vec2 span = max(rectMax - rectMin, 1e-4);
    vec2 suv = (uv - rectMin) / span;
    vec2 rc = toQ((rectMin + rectMax) * 0.5);
    vec2 rh = span * 0.5 * vec2(uAspect, 1.0);
    float sy = suv.y - 0.5;
    yFromMid = sy * span.y;
    strikeMask = uLineFade * step(0.0, suv.x) * step(suv.x, 1.0);

    if (sdRoundBox(toQ(uv) - rc, rh, uCaseB.x) < 0.0) {
      if (abs(sy) > halfBand) {
        // A dark tube: the glass, and the burn-in, which a dark screen is the
        // only time anybody ever sees.
        col = BASE * 0.3 + uPhosphor * texture2D(tSim, suv).a * 0.1;
      } else {
        suv.y = 0.5 + sy / max(halfBand * 2.0, 1e-4);
        if (roll > 0.0) suv.y = fract(suv.y + roll * uTime * 0.55);
        col = tubeImage(suv, span.y);
      }
    } else {
      col = room(uv, rectMin, rectMax, tubeGlow(suv) * openT);
    }
  } else {
    if (abs(yFromMid) > halfBand) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    uv.y = 0.5 + yFromMid / max(halfBand * 2.0, 1e-4);
    if (roll > 0.0) uv.y = fract(uv.y + roll * uTime * 0.55);
    col = tubeImage(uv, 1.0);
  }

  // The bright strike along the scan line while the tube is opening.
  float strike = (1.0 - smoothstep(0.0, 0.42, uPower)) *
                 exp(-pow(yFromMid * 240.0, 2.0));
  strike *= strikeMask;
  col += (uPhosphor * 0.9 + vec3(0.35)) * strike * 1.4;

  // Dither. The persistence buffer is 8-bit for compatibility, and without a
  // little noise its slow decay bands visibly across large dark areas.
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** The persistence buffer runs at half the canvas. Glow is diffuse; sharp is waste. */
const SIM_SCALE = 0.5;

export default function PhosphorScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { frame, settings, reducedMotion, onFrame } = useSystem();

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const isSmall = coarse || window.innerWidth < 768;
    const targetDpr = isSmall ? 0.6 : Math.min(window.devicePixelRatio || 1, 2);

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        dpr: targetDpr,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    const gl = renderer.gl;
    gl.canvas.className = "phosphor__canvas";
    host.appendChild(gl.canvas);

    const root = document.documentElement;
    root.classList.add("webgl-ok");

    const onContextLost = (event: Event) => {
      event.preventDefault();
      root.classList.remove("webgl-ok");
    };
    const onContextRestored = () => {
      root.classList.add("webgl-ok");
    };
    gl.canvas.addEventListener("webglcontextlost", onContextLost);
    gl.canvas.addEventListener("webglcontextrestored", onContextRestored);

    // Uniform wrappers are shared by reference between the two programs, so a
    // single assignment updates both passes and they can never disagree about
    // what frame it is.
    const shared = {
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
      uAspect: { value: 1 },
      uPointer: { value: [0.5, 0.5] },
      uPointerActive: { value: 0 },
      uScrollVel: { value: 0 },
      uDegauss: { value: 999 },
      uTap: { value: 999 },
      uTapPos: { value: [0.5, 0.5] },
      uPhosphor: { value: THEME_PHOSPHOR.green },
      uMobile: { value: 0 },
      uGravity: { value: 0 },
      uImpacts: { value: new Array(MAX_FRAME_IMPACTS * 3).fill(0) },
      uLive: { value: 1 },
    };

    const simProgram = new Program(gl, {
      vertex: VERT,
      fragment: SIM_FRAG,
      uniforms: {
        ...shared,
        tPrev: { value: null },
        uDecay: { value: 0.9 },
        uEmit: { value: 1 },
        uBurnRate: { value: 0.00035 },
        uNavBand: { value: [0.94, 1.0] },
        uStatusBand: { value: [0.0, 0.04] },
        uBeamPts: { value: new Array(MAX_BEAM_POINTS * 2).fill(0) },
        uBeamCount: { value: 0 },
        uBeamGain: { value: 0 },
      },
    });

    const presentProgram = new Program(gl, {
      vertex: VERT,
      fragment: PRESENT_FRAG,
      uniforms: {
        ...shared,
        tSim: { value: null },
        uRain: { value: 1 },
        uIntensity: { value: 1 },
        uScanlines: { value: 0.55 },
        uPower: { value: 1 },
        uEject: { value: 0 },
        uScreenRect: { value: [0, 0, 1, 1] },
        uCase: { value: [0, 0, 0, 0] },
        uCaseB: { value: [0, 0] },
        uDeck: { value: [0, 0, 0, 0] },
        uGrille: { value: [0, 0, 0, 0] },
        uLed: { value: [0, 0, 0] },
        uLean: { value: [0, 0] },
        uLineFade: { value: 1 },
      },
    });

    const geometry = new Triangle(gl);
    const simMesh = new Mesh(gl, { geometry, program: simProgram });
    const presentMesh = new Mesh(gl, { geometry, program: presentProgram });
    const su = simProgram.uniforms;
    const pu = presentProgram.uniforms;

    let targets: [RenderTarget, RenderTarget] | null = null;
    let read = 0;

    /**
     * Size the persistence buffers, allocating them only once.
     *
     * `new RenderTarget` on every resize would leak: ogl has no dispose on
     * either RenderTarget or Texture (its Texture.js still carries a
     * `// TODO: delete texture`), so the old framebuffer and its two textures
     * are simply dropped on the floor. A desktop window drag fires `resize` for
     * every pixel of the drag, which is a few hundred orphaned framebuffers in a
     * couple of seconds and eventually a lost context. `setSize` reuses the
     * existing objects and is a no-op when the dimensions have not moved.
     */
    const sizeTargets = (w: number, h: number) => {
      const width = Math.max(2, Math.round(w * SIM_SCALE));
      const height = Math.max(2, Math.round(h * SIM_SCALE));
      if (targets) {
        targets[0].setSize(width, height);
        targets[1].setSize(width, height);
        return;
      }
      const opts = {
        width,
        height,
        depth: false,
        stencil: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        // Deliberately 8-bit. Half-float render targets need two extensions in
        // WebGL1 (storage and linear filtering) that a meaningful share of
        // phones advertise incorrectly, and the present pass dithers, which
        // buys back the precision this actually needed.
        type: gl.UNSIGNED_BYTE,
      };
      targets = [new RenderTarget(gl, opts), new RenderTarget(gl, opts)];
    };

    let degraded = false;
    let lowFrames = 0;

    let lastW = 0;
    let lastH = 0;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (isSmall && w === lastW && Math.abs(h - lastH) < 120) return;
      lastW = w;
      lastH = h;
      renderer.setSize(w, h);
      shared.uResolution.value = [gl.canvas.width, gl.canvas.height];
      shared.uAspect.value = gl.canvas.width / Math.max(gl.canvas.height, 1);
      shared.uMobile.value = degraded || isSmall || w < 768 ? 1 : 0;

      // The bands that burn in. Read from the live CSS rather than hard-coded,
      // so changing --nav-h does not silently misplace the ghost.
      const cs = getComputedStyle(document.documentElement);
      const navH = parseFloat(cs.getPropertyValue("--nav-h")) || 44;
      const statusH = parseFloat(cs.getPropertyValue("--status-h")) || 26;
      su.uNavBand.value = [1 - navH / h, 1];
      su.uStatusBand.value = [0, statusH / h];

      sizeTargets(gl.canvas.width, gl.canvas.height);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const minFrameMs = isSmall ? 1000 / 30 : 0;
    let lastDrawn = -Infinity;
    const impacts = shared.uImpacts.value as number[];
    /** The ejected monitor's layout for the current viewport, built on first need. */
    let layout: EjectLayout | null = null;
    /** When the monitor's own switch finished collapsing the raster, or -1. */
    let offAt = -1;

    const draw = (time: number) => {
      if (time - lastDrawn < minFrameMs) return;
      const dt = Math.min(64, time - lastDrawn);
      lastDrawn = time;

      const f = frame.current;
      const s = settingsRef.current;
      const now = performance.now();

      shared.uTime.value = time / 1000;
      shared.uTap.value = Number.isFinite(f.tapAt) ? (now - f.tapAt) / 1000 : 999;
      shared.uTapPos.value = [f.tapX, 1 - f.tapY];
      shared.uPointer.value = [f.pointerX, 1 - f.pointerY];
      shared.uPointerActive.value = f.pointerActive;
      shared.uScrollVel.value = f.scrollVelocity;
      shared.uDegauss.value = Number.isFinite(f.degaussAt) ? (now - f.degaussAt) / 1000 : 999;
      shared.uLive.value = f.live;
      shared.uPhosphor.value = THEME_PHOSPHOR[s.theme];
      shared.uGravity.value = f.gravity;

      pu.uIntensity.value = s.crtEnabled ? 1 : 0;
      pu.uScanlines.value = s.scanlines;
      pu.uRain.value = now < f.rainBoostUntil ? 1 : 0.32;
      pu.uPower.value = f.boot;
      pu.uEject.value = f.eject;

      // The screen rectangle, from the same function CSS is using this frame.
      // Computed unconditionally: `tubeImage` reads its height as the scanline
      // scale, so leaving a stale rect behind after returning from eject would
      // leave the docked tube with the wrong line pitch.
      const [px, py] = ejectLean(f.pointerX, f.pointerY, f.pointerActive, coarse);
      const g = ejectGeometry(f.eject, px, py, ejectScaleFor(window.innerWidth));
      const r = ejectScreenRect(g);
      // GL's origin is bottom-left, so the CSS-space rect flips in y.
      pu.uScreenRect.value = [r.x0, 1 - r.y1, r.x1, 1 - r.y0];

      // The monitor around it: case, chin, base, the recess the DOM controls
      // sit in and the LED beside the power button, all from lib/eject.ts, the
      // same layout EjectHardware places the controls from.
      if (f.eject > 0.001) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (!layout || layout.vw !== vw || layout.vh !== vh) layout = ejectLayout(vw, vh);
        const c = ejectCase(g, layout);
        pu.uCase.value = c.uCase;
        pu.uCaseB.value = [c.glass, c.base];
        pu.uDeck.value = boxToGl(placeBox(c, layout.deck), vw, vh);
        pu.uGrille.value = layout.grille ? boxToGl(placeBox(c, layout.grille), vw, vh) : [0, 0, 0, 0];
        const led = placeBox(c, { x: layout.led.x, y: layout.led.y, w: 0, h: 0 });
        pu.uLed.value = [led.x / vw, 1 - led.y / vh, 0.12 + 0.88 * powerOpen(f.boot)];
        pu.uLean.value = [px * g.e, py * g.e];
      }

      // The monitor's own power switch leaves the tube off, not striking a line
      // for ever: once the raster has collapsed, the line fades like the
      // afterglow it is. Only for that switch. The boot and the arcade's
      // power-cycle also drive `bootTarget` to zero, and they run docked.
      const switchedOff = f.ejectTarget === 1 && f.bootTarget === 0;
      if (switchedOff && f.boot === 0) {
        if (offAt < 0) offAt = now;
      } else {
        offAt = -1;
      }
      pu.uLineFade.value = offAt < 0 ? 1 : Math.exp(-(now - offAt) / 320);

      // Impacts are consumed here: written by the physics stage during its own
      // step, drained by whichever of the shader and the audio engine runs
      // second. Both read the same list in the same frame.
      for (let i = 0; i < MAX_FRAME_IMPACTS; i++) {
        const p = f.impacts[i];
        impacts[i * 3] = p ? p.x : 0;
        impacts[i * 3 + 1] = p ? 1 - p.y : 0;
        impacts[i * 3 + 2] = p ? p.energy : 0;
      }

      // Decay is expressed per second and resolved per frame, so persistence
      // lasts the same wall-clock time at 30fps as at 120.
      su.uDecay.value = Math.pow(0.045, dt / 1000);

      // Decay was already per second. The deposits were not, and that made the
      // brightness of every emitter a function of the visitor's refresh rate: a
      // steady deposit settles at K / (1 - uDecay), which is ~19.9K at 60fps and
      // ~39.2K at 120. So the ring and halo constants tuned on 2026-08-20 landed
      // at half strength on a 60Hz laptop and full strength on a 120Hz monitor,
      // where "half as bright" would have been no change at all. This scales the
      // three tuned emitters back to their 60fps reference. Flat within one
      // percent from 30fps to 165fps, verified by simulation.
      su.uEmit.value = (1 - su.uDecay.value) / (1 - Math.pow(0.045, 1 / 60));

      if (!degraded) {
        if (f.uptimeMs > 1000 && f.fps < 40) lowFrames += 1;
        else lowFrames = Math.max(0, lowFrames - 1);
        if (lowFrames > 90) {
          degraded = true;
          shared.uMobile.value = 1;
        }
      }

      if (!targets) return;

      // The beam (lib/beam.ts): the path whatever is drawing with the gun has
      // swept since the last draw, flipped into GL's y-up space. Consumed below
      // once the sim pass has deposited it, like the impacts above, so a writer
      // running faster than the tube (a phone draws at 30fps) extends the path
      // instead of losing every other frame of it.
      const bp = su.uBeamPts.value as number[];
      for (let i = 0; i < MAX_BEAM_POINTS; i++) {
        bp[i * 2] = f.beamPts[i * 2];
        bp[i * 2 + 1] = 1 - f.beamPts[i * 2 + 1];
      }
      su.uBeamCount.value = f.beamCount;
      su.uBeamGain.value = f.beamGain;

      const prev = targets[read];
      const next = targets[read ^ 1];
      su.tPrev.value = prev.texture;
      renderer.render({ scene: simMesh, target: next });
      clearBeam(f);
      read ^= 1;

      pu.tSim.value = next.texture;
      renderer.render({ scene: presentMesh });
    };

    if (reducedMotion) {
      // No persistence loop at all: one sim frame to seed the buffer, one
      // present. The texture and the mask are the look; the motion is not.
      pu.uRain.value = 0.22;
      su.uBurnRate.value = 0;
      draw(0);
      draw(16);
      return () => {
        window.removeEventListener("resize", resize);
        gl.canvas.removeEventListener("webglcontextlost", onContextLost);
        gl.canvas.removeEventListener("webglcontextrestored", onContextRestored);
        root.classList.remove("webgl-ok");
        gl.canvas.remove();
        renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    }

    const unsubscribe = onFrame(draw);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.canvas.removeEventListener("webglcontextrestored", onContextRestored);
      root.classList.remove("webgl-ok");
      gl.canvas.remove();
      // ogl frees nothing itself, so the framebuffers and their textures are
      // released explicitly before the context goes.
      for (const t of targets ?? []) {
        gl.deleteFramebuffer(t.buffer);
        for (const tex of t.textures) gl.deleteTexture(tex.texture);
      }
      targets = null;
      renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [frame, onFrame, reducedMotion]);

  return <div ref={hostRef} className="phosphor" aria-hidden="true" />;
}
