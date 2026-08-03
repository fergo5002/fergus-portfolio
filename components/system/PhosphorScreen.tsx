"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { THEME_PHOSPHOR } from "@/lib/system";
import { useSystem } from "./SystemProvider";

/**
 * The tube itself.
 *
 * A single fullscreen triangle running one fragment shader that owns every
 * ambient effect on the site: the phosphor rain, the aperture-grille mask,
 * scanlines, the rolling hum bar, screen curvature, the scroll-driven beam
 * smear, the cursor's magnetic deflection and the degauss shockwave.
 *
 * Doing all of it in one shader pass is the whole trick — it costs less than the
 * single canvas rain it replaces, and because every effect samples the same warp
 * they stay physically consistent with each other instead of looking like layers.
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

const FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uPointer;
uniform float uPointerActive;
uniform float uScrollVel;    // signed, roughly -1..1
uniform float uDegauss;      // seconds since the last pulse; 999 = idle
uniform float uRain;         // 0..1 rain density
uniform float uLive;         // 0..1 fade-in after boot
uniform float uIntensity;    // master CRT intensity (0 when "crt off")
uniform float uScanlines;    // 0..1 user setting
uniform vec3  uPhosphor;
uniform float uMobile;       // 1.0 on small screens: cheaper path
uniform float uTap;          // seconds since the last tap; 999 = idle
uniform vec2  uTapPos;       // where that tap landed, in UV

const vec3 BASE = vec3(0.039, 0.055, 0.039);

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

/* Gentle barrel warp. Real tubes bulge; the amount here is deliberately small so
   text sitting on top never looks misaligned with its own background. */
vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 off = abs(c.yx) / vec2(7.0, 6.0);
  c += c * off * off;
  return c * 0.5 + 0.5;
}

/* Columns of glyphs falling down the tube. The smear argument stretches the
   tails when the page is scrolling fast, which is what sells the beam as a
   physical thing rather than a texture. */
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

  // Longer, softer tails while scrolling; tight bright drops at rest.
  float sharpness = mix(20.0, 5.0, clamp(smear, 0.0, 1.0));
  float body = pow(tail, sharpness);

  // Bright head at the leading edge of each drop.
  float head = smoothstep(0.984, 1.0, tail);

  // A 3x5 dot-matrix glyph inside the cell, re-rolled a few times a second.
  // Lighting whole cells instead reads as sliding blocks; the dot matrix is what
  // makes it read as falling characters.
  vec2 d = floor(f * vec2(3.0, 5.0));
  vec2 dIn = fract(f * vec2(3.0, 5.0));
  float ink =
    step(0.16, dIn.x) * step(dIn.x, 0.84) *
    step(0.10, dIn.y) * step(dIn.y, 0.90);
  float lit = step(0.44, hash21(id * 3.1 + d * 17.3 + floor(t * 5.0)));

  return (body * 0.62 + head * 1.0) * ink * lit;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float glow = 0.0;

  // ── magnetic deflection around the pointer ───────────────────────────────
  // On a phone this is the finger, and uPointerActive decays to zero the moment
  // it lifts — so the ripple only ever costs anything while someone is actually
  // touching the glass. That is why it is no longer mobile-gated: the cost is
  // already paid for by the interaction that asked for it.
  // (No backticks in here: this whole shader is a template literal.)
  if (uPointerActive > 0.01) {
    vec2 toP = uv - uPointer;
    toP.x *= aspect;
    float d = length(toP);
    float ripple = sin(d * 34.0 - t * 2.6) * exp(-d * 7.0);
    uv += normalize(toP + 1e-5) * ripple * 0.0045 * uPointerActive;
    glow += exp(-d * 5.0) * 0.05 * uPointerActive;
  }

  // ── tap shockwave, centred on the point touched ──────────────────────────
  // The same physics as the degauss below, but originating where the finger
  // landed rather than at the centre of the tube: a tap is a knock on the glass.
  if (uTap < 1.6) {
    vec2 toT = uv - uTapPos;
    toT.x *= aspect;
    float d = length(toT);
    float radius = uTap * 0.72;
    float band = exp(-pow((d - radius) * 9.0, 2.0)) * exp(-uTap * 2.2);
    uv += normalize(toT + 1e-5) * band * 0.04;
    glow += band * 0.5;
  }

  // ── degauss shockwave ────────────────────────────────────────────────────
  if (uDegauss < 2.4) {
    vec2 toC = uv - 0.5;
    toC.x *= aspect;
    float d = length(toC);
    float radius = uDegauss * 0.95;
    float band = exp(-pow((d - radius) * 7.5, 2.0)) * exp(-uDegauss * 1.5);
    uv += normalize(toC + 1e-5) * band * 0.055;
    glow += band * 0.7;
  }

  uv = curve(uv);

  // Off the edge of the glass.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float absVel = min(abs(uScrollVel), 1.6);

  // ── phosphor rain ────────────────────────────────────────────────────────
  float r = rain(uv, t, absVel * 0.9) * uRain;

  // ── sweeping beam line, position driven by scroll direction ──────────────
  float beamY = fract(t * 0.11 + uScrollVel * 0.35);
  float beam = exp(-pow((uv.y - beamY) * 46.0, 2.0)) * (0.05 + absVel * 0.22);

  // ── mains hum bar rolling slowly up the screen ───────────────────────────
  float hum = pow(sin((uv.y + t * 0.045) * 6.2831) * 0.5 + 0.5, 14.0) * 0.05;

  float energy = r + beam + hum + glow;

  vec3 col = BASE + uPhosphor * energy;

  // ── chromatic aberration, scaling with scroll speed ──────────────────────
  if (uMobile < 0.5) {
    float ca = absVel * 0.0022;
    float rr = rain(uv + vec2(ca, 0.0), t, absVel * 0.9) * uRain;
    float bb = rain(uv - vec2(ca, 0.0), t, absVel * 0.9) * uRain;
    col.r += uPhosphor.r * (rr - r) * 0.8;
    col.b += uPhosphor.b * (bb - r) * 0.8;
  }

  // ── aperture grille + scanlines ──────────────────────────────────────────
  float sl = mix(1.0, 0.78 + 0.22 * sin(uv.y * uResolution.y * 3.14159), uScanlines);
  col *= sl;

  if (uMobile < 0.5) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 grille = vec3(
      1.0 - 0.28 * step(1.0, m),
      1.0 - 0.28 * (1.0 - step(1.0, m) * step(m, 2.0)),
      1.0 - 0.28 * step(m, 2.0)
    );
    col *= mix(vec3(1.0), grille, uScanlines * 0.7);
  }

  // ── vignette ─────────────────────────────────────────────────────────────
  vec2 v = uv * (1.0 - uv.yx);
  col *= pow(clamp(v.x * v.y * 26.0, 0.0, 1.0), 0.22);

  // Fade the whole tube in as the machine comes up, and out under "crt off".
  col = mix(BASE, col, clamp(uLive, 0.0, 1.0) * uIntensity);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function PhosphorScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { frame, settings, reducedMotion, onFrame } = useSystem();

  // Latest settings, read from inside the frame loop without re-subscribing.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // A phone's fragment budget is the binding constraint on this whole site
    // (measured: DPR-2 fullscreen rain ran the tube at 1 fps on iPhone WebKit),
    // so mobile renders the tube at well under device resolution and lets the
    // browser upscale. The scanlines and grille hide the resample completely —
    // this is a CRT, softness is the point — and it cuts the fragment count by
    // roughly 11x against the old DPR-2 path.
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
      // No WebGL. Flag it so the CSS falls back to a static scanline layer —
      // without this the site would have no scanlines at all, since the shader
      // is normally the only thing drawing them.
      document.documentElement.classList.add("no-webgl");
      return;
    }

    const gl = renderer.gl;
    gl.canvas.className = "phosphor__canvas";
    host.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uPointer: { value: [0.5, 0.5] },
        uPointerActive: { value: 0 },
        uScrollVel: { value: 0 },
        uDegauss: { value: 999 },
        uRain: { value: 1 },
        uLive: { value: 1 },
        uIntensity: { value: 1 },
        uScanlines: { value: 0.55 },
        uPhosphor: { value: THEME_PHOSPHOR.green },
        uMobile: { value: 0 },
        uTap: { value: 999 },
        uTapPos: { value: [0.5, 0.5] },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const u = program.uniforms;

    // Adaptive quality. The expensive branches (per-pixel grille, chromatic
    // aberration, cursor ripple) are worth it on a machine that can afford them
    // and not worth it on one that cannot, so if the frame rate sits low for a
    // sustained period we permanently drop to the cheap path rather than ship a
    // beautiful shader that makes someone's laptop fans scream.
    let degraded = false;
    let lowFrames = 0;

    // Mobile browsers fire `resize` every time the URL bar collapses, and the
    // canvas is sized in `innerHeight` px while its CSS box is `100dvh` — so a
    // naive handler would resize the drawing buffer (an expensive reallocation)
    // on every flick of a scroll. Only react when the width actually changes, or
    // when the height moves by more than the toolbar's own height.
    let lastW = 0;
    let lastH = 0;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 120) return;
      lastW = w;
      lastH = h;
      renderer.setSize(w, h);
      u.uResolution.value = [gl.canvas.width, gl.canvas.height];
      u.uMobile.value = degraded || isSmall || w < 768 ? 1 : 0;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Half-rate on mobile. The ambient layer is rain and a slow hum bar; neither
    // reads any differently at 30 fps, and the halved GPU work is the difference
    // between the content scrolling smoothly and not.
    const minFrameMs = isSmall ? 1000 / 30 : 0;
    let lastDrawn = -Infinity;

    const draw = (time: number) => {
      if (time - lastDrawn < minFrameMs) return;
      lastDrawn = time;

      const f = frame.current;
      const s = settingsRef.current;
      const now = performance.now();

      u.uTime.value = time / 1000;
      u.uTap.value = Number.isFinite(f.tapAt) ? (now - f.tapAt) / 1000 : 999;
      u.uTapPos.value = [f.tapX, 1 - f.tapY]; // GL origin is bottom-left
      u.uPointer.value = [f.pointerX, 1 - f.pointerY]; // GL origin is bottom-left
      u.uPointerActive.value = f.pointerActive;
      u.uScrollVel.value = f.scrollVelocity;
      u.uDegauss.value = Number.isFinite(f.degaussAt) ? (now - f.degaussAt) / 1000 : 999;
      u.uLive.value = f.live;
      u.uIntensity.value = s.crtEnabled ? 1 : 0;
      u.uScanlines.value = s.scanlines;
      u.uPhosphor.value = THEME_PHOSPHOR[s.theme];
      u.uRain.value = now < f.rainBoostUntil ? 1 : 0.32;

      if (!degraded) {
        // Ignore the first second, where startup work skews the average.
        if (f.uptimeMs > 1000 && f.fps < 40) lowFrames += 1;
        else lowFrames = Math.max(0, lowFrames - 1);
        if (lowFrames > 90) {
          degraded = true;
          u.uMobile.value = 1;
        }
      }

      renderer.render({ scene: mesh });
    };

    if (reducedMotion) {
      // One static frame: the texture and mask are the look, the motion is not.
      u.uRain.value = 0.22;
      draw(0);
      return () => {
        window.removeEventListener("resize", resize);
        gl.canvas.remove();
        renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    }

    const unsubscribe = onFrame(draw);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      gl.canvas.remove();
      renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [frame, onFrame, reducedMotion]);

  return <div ref={hostRef} className="phosphor" aria-hidden="true" />;
}
