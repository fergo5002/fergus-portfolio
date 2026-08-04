"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, RenderTarget, Renderer, Triangle } from "ogl";
import { MAX_FRAME_IMPACTS, THEME_PHOSPHOR } from "@/lib/system";
import { ejectGeometry, ejectScaleFor, ejectScreenRect } from "@/lib/eject";
import { useSystem } from "./SystemProvider";

/**
 * The tube itself.
 *
 * v5 splits this into two passes, because the single-pass version could only
 * ever draw what was happening *now*. Real phosphor keeps glowing after the
 * beam has moved on, and a real tube that has displayed the same nav bar for
 * ten minutes keeps a faint ghost of it forever. Neither is expressible without
 * somewhere to remember, so:
 *
 *  1. **Sim pass** — ping-pongs between two render targets at half resolution.
 *     RGB is short-lived persistence (decays over roughly a third of a second);
 *     alpha is burn-in, which accumulates over minutes and is only ever cleared
 *     by a degauss. Everything that emits light writes here: the beam, the
 *     pointer, taps, degauss rings, and physics impacts.
 *  2. **Present pass** — draws the rain at full resolution, adds the blurred
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
uniform float uBurnRate;
uniform vec2  uNavBand;
uniform vec2  uStatusBand;
uniform float uLive;

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

  if (uPointerActive > 0.01) {
    vec2 toP = uv - uPointer;
    toP.x *= uAspect;
    add += exp(-length(toP) * 9.0) * 0.10 * uPointerActive;
  }

  if (uTap < 1.6) {
    vec2 toT = uv - uTapPos;
    toT.x *= uAspect;
    add += shockBand(uTap, length(toT), 0.72, 9.0, 2.2) * 0.55;
  }

  add += dgDrag * 0.85;

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

  energy += uPhosphor * add;

  // ── burn-in ──────────────────────────────────────────────────────────────
  // Only the chrome that never moves burns in: the nav strip and the status
  // strip. That is the honest model — a ghost of the body text would be wrong,
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

const vec3 BASE = vec3(0.039, 0.055, 0.039);

vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 off = abs(c.yx) / vec2(7.0, 6.0);
  c += c * off * off;
  return c * 0.5 + 0.5;
}

float rain(vec2 uv, float t, float smear) {
  float cols = mix(54.0, 32.0, uMobile);
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
   shrinks — a smaller picture with the same line count is technically more
   correct but aliases into moire the moment it is scaled. */
vec3 tubeImage(vec2 suv, float lineScale) {
  vec2 uv = suv;
  float t = uTime;
  float glow = 0.0;

  if (uPointerActive > 0.01) {
    vec2 toP = uv - uPointer;
    toP.x *= uAspect;
    float d = length(toP);
    float ripple = sin(d * 34.0 - t * 2.6) * exp(-d * 7.0);
    uv += normalize(toP + 1e-5) * ripple * 0.0045 * uPointerActive;
    glow += exp(-d * 5.0) * 0.05 * uPointerActive;
  }

  if (uTap < 1.6) {
    vec2 toT = uv - uTapPos;
    toT.x *= uAspect;
    float d = length(toT);
    float band = shockBand(uTap, d, 0.72, 9.0, 2.2);
    uv += normalize(toT + 1e-5) * band * 0.04;
    glow += band * 0.5;
  }

  if (uDegauss < 2.4) {
    vec2 toC = uv - 0.5;
    toC.x *= uAspect;
    float d = length(toC);
    float band = shockBand(uDegauss, d, 0.95, 7.5, 1.5);
    uv += normalize(toC + 1e-5) * band * 0.055;
    glow += band * 0.7;
  }

  uv = curve(uv);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(0.0);
  }

  float absVel = min(abs(uScrollVel), 1.6);
  float r = rain(uv, t, absVel * 0.9) * uRain;
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
    float rr = rain(uv + vec2(ca, 0.0), t, absVel * 0.9) * uRain;
    float bb = rain(uv - vec2(ca, 0.0), t, absVel * 0.9) * uRain;
    col.r += uPhosphor.r * (rr - r) * 0.8;
    col.b += uPhosphor.b * (bb - r) * 0.8;
  }

  float sl = mix(1.0, 0.78 + 0.22 * sin(uv.y * uResolution.y * lineScale * 3.14159), uScanlines);
  col *= sl;

  // The grille is a physical mask at the tube's own pitch, so unlike the
  // scanlines it cannot be rescaled — it is faded out instead as the image
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
 * The obvious implementation — call tubeImage again and take its luminance —
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
   work in aspect-corrected space, lit by the tube's own output — the monitor is
   the only light source in the room, which is what makes the pull-back land. */
vec3 room(vec2 uv, vec2 rectMin, vec2 rectMax, float screenLuma) {
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  vec2 rc = ((rectMin + rectMax) * 0.5 - 0.5) * vec2(uAspect, 1.0);
  vec2 rh = (rectMax - rectMin) * 0.5 * vec2(uAspect, 1.0);

  float dScreen = sdRoundBox(q - rc, rh, 0.012);

  // Bezel: a little proud at the sides, deeper under the screen for the chin.
  vec2 bh = vec2(rh.x + 0.030, rh.y + 0.056);
  vec2 bc = rc - vec2(0.0, 0.026);
  float dBezel = sdRoundBox(q - bc, bh, 0.03);
  float bezelFoot = bc.y - bh.y;

  // Ambient room: near black, slightly warmer low down where the desk is.
  vec3 col = mix(vec3(0.012, 0.013, 0.016), vec3(0.020, 0.018, 0.016),
                 smoothstep(0.25, -0.35, q.y));

  // ── light spill ──────────────────────────────────────────────────────────
  // The tube lights its own surroundings. Falls off fast, flickers gently with
  // the mains hum, and picks up whatever the phosphor colour currently is.
  float flicker = 0.94 + 0.06 * sin(uTime * 6.2831 * 0.7) + 0.03 * hash11(floor(uTime * 24.0));
  float spill = exp(-max(dScreen, 0.0) * 5.2) * screenLuma * 5.5 * flicker;
  col += uPhosphor * spill * 0.6;

  // ── desk ─────────────────────────────────────────────────────────────────
  // The surface starts at the bezel's foot, so the monitor is standing on it
  // rather than floating above or sinking into it.
  float deskY = bezelFoot + 0.004;
  float onDesk = smoothstep(deskY + 0.004, deskY - 0.004, q.y);
  if (onDesk > 0.0) {
    vec3 desk = vec3(0.026, 0.024, 0.022);
    // Wood-ish grain, very low contrast: enough to read as a surface.
    desk *= 0.85 + 0.3 * hash21(vec2(q.x * 90.0, floor(q.y * 260.0)));

    // Reflection: the persistence buffer, mirrored about the desk edge. Glow is
    // the only part of a screen that meaningfully reflects off matte wood, so
    // sampling the sim buffer rather than the full image is both cheaper and
    // closer to right. Sampled in SCREEN space, not viewport space — the sim
    // buffer is the tube's own image, and the monitor no longer fills the view.
    float depth = deskY - q.y;
    float sx = (uv.x - rectMin.x) / max(rectMax.x - rectMin.x, 1e-4);
    vec4 refl = texture2D(tSim, clamp(vec2(sx, depth * 2.4), 0.0, 1.0));
    float reflFade = exp(-depth * 9.0) * step(0.0, sx) * step(sx, 1.0);
    desk += (refl.rgb + uPhosphor * screenLuma * 0.55) * reflFade * 0.6;

    col = mix(col, desk, onDesk);
  }

  // ── dust in the beam ─────────────────────────────────────────────────────
  // Only visible where the light is, which is the only place dust is ever
  // visible in a dark room.
  vec2 dg = q * 26.0 + vec2(0.0, uTime * 0.09);
  vec2 dcell = floor(dg);
  vec2 dfrac = fract(dg) - 0.5;
  float dseed = hash21(dcell);
  vec2 dpos = (vec2(hash11(dseed * 7.1), hash11(dseed * 3.3)) - 0.5) * 0.7;
  float mote = exp(-length(dfrac - dpos) * 42.0);
  mote *= step(0.93, dseed) * (0.5 + 0.5 * sin(uTime * 1.7 + dseed * 40.0));
  col += uPhosphor * mote * spill * 2.2;

  // ── the bezel itself ─────────────────────────────────────────────────────
  float bezelMask = smoothstep(0.002, -0.002, dBezel) * smoothstep(-0.002, 0.002, dScreen);
  if (bezelMask > 0.0) {
    vec3 plastic = vec3(0.072, 0.070, 0.066);
    // Injection-moulded grain.
    plastic *= 0.9 + 0.2 * hash21(q * 420.0);

    // Lit from above and from the screen itself: the inner edge catches the
    // phosphor, which is the single detail that makes plastic read as plastic.
    //
    // Note the sign. dScreen is positive everywhere on the bezel and grows with
    // distance from the glass, so exp(+dScreen * 60) runs away to a blown-out
    // neon frame within a few millimetres. It has to decay.
    float up = smoothstep(-0.02, 0.06, q.y - rc.y);
    plastic *= 0.72 + 0.5 * up;
    plastic += uPhosphor * exp(-dScreen * 90.0) * 0.22;

    // A chamfer highlight running around the outer edge.
    plastic += vec3(0.05) * smoothstep(0.006, 0.0, abs(dBezel + 0.004)) * (0.4 + 0.6 * up);

    // Vents across the chin.
    float chin = smoothstep(rc.y - rh.y - 0.012, rc.y - rh.y - 0.02, q.y);
    float vents = step(0.55, fract(q.x * 150.0)) * chin *
                  step(abs(q.x - rc.x), rh.x * 0.42);
    plastic *= 1.0 - vents * 0.35;

    // Power LED, low right on the chin, with its own small bloom.
    vec2 led = q - vec2(rc.x + rh.x * 0.80, rc.y - rh.y - 0.030);
    float dLed = length(led);
    plastic += uPhosphor * exp(-dLed * 300.0) * 1.3;
    plastic += uPhosphor * exp(-dLed * 60.0) * 0.09;

    col = mix(col, plastic, bezelMask);
  }

  // Contact shadow under the whole assembly.
  float shadow = exp(-max(0.0, deskY - q.y) * 26.0) *
                 smoothstep(bh.x + 0.10, bh.x - 0.02, abs(q.x - rc.x));
  col *= 1.0 - shadow * 0.55 * onDesk;

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
  if (abs(yFromMid) > halfBand) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  uv.y = 0.5 + yFromMid / max(halfBand * 2.0, 1e-4);

  // Vertical hold not quite locked yet: the picture rolls a couple of times
  // before it settles. Skipped entirely once locked, so a fully powered tube
  // never pays for a fract() that would map its top row onto its bottom one.
  float roll = (1.0 - smoothstep(0.55, 0.98, uPower)) * 0.9;
  if (roll > 0.0) uv.y = fract(uv.y + roll * uTime * 0.55);

  vec3 col;

  if (uEject > 0.001) {
    vec2 rectMin = uScreenRect.xy;
    vec2 rectMax = uScreenRect.zw;
    vec2 span = max(rectMax - rectMin, 1e-4);
    vec2 suv = (uv - rectMin) / span;

    if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
      col = tubeImage(suv, span.y);
    } else {
      col = room(uv, rectMin, rectMax, tubeGlow(suv));
    }
  } else {
    col = tubeImage(uv, 1.0);
  }

  // The bright strike along the scan line while the tube is opening.
  float strike = (1.0 - smoothstep(0.0, 0.42, uPower)) *
                 exp(-pow(yFromMid * 240.0, 2.0));
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
        uBurnRate: { value: 0.00035 },
        uNavBand: { value: [0.94, 1.0] },
        uStatusBand: { value: [0.0, 0.04] },
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
      },
    });

    const geometry = new Triangle(gl);
    const simMesh = new Mesh(gl, { geometry, program: simProgram });
    const presentMesh = new Mesh(gl, { geometry, program: presentProgram });
    const su = simProgram.uniforms;
    const pu = presentProgram.uniforms;

    let targets: [RenderTarget, RenderTarget] | null = null;
    let read = 0;

    const makeTargets = (w: number, h: number) => {
      const opts = {
        width: Math.max(2, Math.round(w * SIM_SCALE)),
        height: Math.max(2, Math.round(h * SIM_SCALE)),
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

      makeTargets(gl.canvas.width, gl.canvas.height);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const minFrameMs = isSmall ? 1000 / 30 : 0;
    let lastDrawn = -Infinity;
    const impacts = shared.uImpacts.value as number[];

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
      const g = ejectGeometry(
        f.eject,
        (f.pointerX - 0.5) * 2,
        (f.pointerY - 0.5) * 2,
        ejectScaleFor(window.innerWidth),
      );
      const r = ejectScreenRect(g);
      // GL's origin is bottom-left, so the CSS-space rect flips in y.
      pu.uScreenRect.value = [r.x0, 1 - r.y1, r.x1, 1 - r.y0];

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

      if (!degraded) {
        if (f.uptimeMs > 1000 && f.fps < 40) lowFrames += 1;
        else lowFrames = Math.max(0, lowFrames - 1);
        if (lowFrames > 90) {
          degraded = true;
          shared.uMobile.value = 1;
        }
      }

      if (!targets) return;
      const prev = targets[read];
      const next = targets[read ^ 1];
      su.tPrev.value = prev.texture;
      renderer.render({ scene: simMesh, target: next });
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
      renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [frame, onFrame, reducedMotion]);

  return <div ref={hostRef} className="phosphor" aria-hidden="true" />;
}
