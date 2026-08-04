"use client";

import { ReactLenis } from "lenis/react";
import type { LenisRef } from "lenis/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  IMPACT_LIFETIME_MS,
  createSystemFrame,
  loadSettings,
  saveSettings,
} from "@/lib/system";
import type { SystemFrame, SystemSettings, Theme } from "@/lib/system";
import { TubeAudio } from "@/lib/audio";

/**
 * A frame callback. Receives the rAF timestamp and the clamped delta in ms.
 * Subscribers read per-frame values straight off the frame ref — they must not
 * call setState from here.
 */
export type FrameCallback = (time: number, dt: number) => void;

type SystemContextValue = {
  /** Live, mutated-in-place per-frame values. Read inside a frame callback. */
  frame: { current: SystemFrame };
  settings: SystemSettings;
  reducedMotion: boolean;
  setTheme: (theme: Theme) => void;
  setCrtEnabled: (enabled: boolean) => void;
  setScanlines: (value: number) => void;
  /**
   * Turn the tube's voice on or off. Must be called from a user gesture the
   * first time, because that is the only moment a browser will start an
   * AudioContext.
   */
  setAudioEnabled: (enabled: boolean) => void;
  /**
   * The live synth. Stable across renders, and safe to call on every frame:
   * every method is a no-op until `setAudioEnabled(true)` has succeeded.
   */
  audio: TubeAudio;
  /** Pull the camera back off the glass to reveal the machine, or push it in. */
  setEjected: (ejected: boolean) => void;
  ejected: boolean;
  /** Drop gravity on the page, or put it back. */
  setGravity: (on: boolean) => void;
  gravityOn: boolean;
  /** Fire the magnetic-deflection shockwave. */
  degauss: () => void;
  /** Drive digital rain to full for `ms`, then let it decay back. */
  burstRain: (ms: number) => void;
  /** Subscribe to the single system frame loop. Returns an unsubscribe fn. */
  onFrame: (cb: FrameCallback) => () => void;
  /** Scroll to a y position (or element) through Lenis when it is mounted. */
  scrollTo: (target: number | string | HTMLElement) => void;
  /**
   * Freeze the document where it is. Physics mode needs it, because bodies live
   * in viewport coordinates and a page that scrolls underneath them would slide
   * the whole pile sideways in relation to its own floor.
   */
  setScrollLocked: (locked: boolean) => void;
};

/**
 * An inert default so any component using `useSystem()` still renders outside a
 * provider (SSR of an isolated component, unit tests, Storybook-style usage)
 * instead of throwing.
 */
const INERT: SystemContextValue = {
  frame: { current: createSystemFrame() },
  settings: DEFAULT_SETTINGS,
  reducedMotion: false,
  setTheme: () => {},
  setCrtEnabled: () => {},
  setScanlines: () => {},
  setAudioEnabled: () => {},
  audio: new TubeAudio(),
  setEjected: () => {},
  ejected: false,
  setGravity: () => {},
  gravityOn: false,
  degauss: () => {},
  burstRain: () => {},
  onFrame: () => () => {},
  scrollTo: () => {},
  setScrollLocked: () => {},
};

const SystemContext = createContext<SystemContextValue>(INERT);

export function useSystem(): SystemContextValue {
  return useContext(SystemContext);
}

const LENIS_OPTIONS = {
  // Short and firm. Long durations read as lag on a site people came to skim.
  duration: 0.9,
  lerp: 0.11,
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 1.6,
  autoRaf: false,
} as const;

/**
 * Owns the single frame clock for the whole site. Lenis, the WebGL phosphor
 * layer, the cursor trail and the status bar all tick from here, so scroll,
 * springs and shader time can never drift apart.
 *
 * Under `prefers-reduced-motion` Lenis is not mounted at all (native scroll is
 * restored) and the loop still runs, but at a much lower cost — subscribers
 * check `reducedMotion` and render static.
 */
export default function SystemProvider({ children }: { children: ReactNode }) {
  const frame = useRef<SystemFrame>(createSystemFrame());
  const lenisRef = useRef<LenisRef>(null);
  const subscribers = useRef<Set<FrameCallback>>(new Set());

  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  // Resolved during the very first client render, not in an effect. ReactLenis
  // constructs the real Lenis instance (and attaches its wheel listeners) in its
  // OWN effect, and React runs child effects before parent ones — so deciding
  // this in an effect here would let Lenis briefly go live for a reduced-motion
  // user before we could unmount it. Safe for SSR: ReactLenis renders null with
  // no children, so server and client produce identical DOM either way.
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  // Lenis smooths the wheel. It does not smooth touch (`syncTouch` is off, and
  // turning it on fights iOS's own momentum), so on a phone it is pure overhead:
  // a scroll listener, a root class, and a `lenis.raf()` call every frame, all to
  // hand back the same numbers the native path already computes from `scrollY`.
  // Resolved during the first client render for the same reason as `reducedMotion`.
  const [coarsePointer] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  const [mounted, setMounted] = useState(false);
  const [ejected, setEjectedState] = useState(false);
  const [gravityOn, setGravityState] = useState(false);

  // One synth for the life of the page. Constructed eagerly because the
  // constructor touches nothing — the AudioContext is only built on `enable()`,
  // which has to happen inside a user gesture.
  const audioRef = useRef<TubeAudio | null>(null);
  if (!audioRef.current) audioRef.current = new TubeAudio();
  const audio = audioRef.current;

  // ── settings: hydrate from storage, then keep the DOM in sync ──────────────
  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.classList.toggle("crt-off", !settings.crtEnabled);
    root.style.setProperty("--scanline-intensity", String(settings.scanlines));
    saveSettings(settings);
  }, [settings, mounted]);

  // ── reduced motion, watched live so a system-preference change takes hold ──
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── pointer + touch tracking (ref only — never state, this fires constantly) ─
  //
  // A mouse makes the pointer "active" simply by being on the page. A finger has
  // no such resting state: it is either on the glass or it is not. So on a coarse
  // pointer the field engages on `pointerdown`, tracks the finger while it moves,
  // and decays once it lifts — which is what makes every pointer-driven effect
  // (hero magnetism, the shader's deflection ripple) work on a phone without
  // running, and costing, anything at rest.
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const track = (e: PointerEvent) => {
      const f = frame.current;
      f.pointerX = e.clientX / window.innerWidth;
      f.pointerY = e.clientY / window.innerHeight;
    };

    const onMove = (e: PointerEvent) => {
      track(e);
      // On touch, only a held finger counts as an active field.
      if (!coarse || frame.current.touchDown > 0) frame.current.pointerTargetActive = 1;
    };

    const onDown = (e: PointerEvent) => {
      const f = frame.current;
      track(e);
      f.touchDown = 1;
      f.pointerTargetActive = 1;
      // A tap is a knock on the glass: the shader rings out from where it landed.
      //
      // Touch only. A mouse already deflects the tube continuously just by being
      // near it, so adding a shockwave to every desktop click would be a second
      // effect answering an input that is already answered — and the brief was
      // to fix the phone, not to change what works.
      if (e.pointerType !== "mouse") {
        f.tapAt = performance.now();
        f.tapX = f.pointerX;
        f.tapY = f.pointerY;
      }
    };

    const onUp = () => {
      const f = frame.current;
      f.touchDown = 0;
      if (coarse) f.pointerTargetActive = 0;
    };

    const onLeave = () => {
      frame.current.pointerTargetActive = 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // ── the one frame loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const f = frame.current;
    const startedAt = performance.now();
    let raf = 0;
    let last = startedAt;
    let lastScrollY = window.scrollY;
    // Only write CSS variables when they move meaningfully; a style write every
    // frame on <html> is a needless invalidation — it dirties every rule that
    // reads the variable, all the way down the tree. Touch devices get a coarser
    // threshold because they have the least headroom and the effects reading
    // --scroll-v there are ambient, so nobody can see the quantisation.
    let publishedVel = -1;
    let publishedProg = -1;
    /** Timestamp of the most recent impact already sent to the synth. */
    let lastSounded = 0;
    let publishedBoot = -1;
    const velEpsilon = window.matchMedia("(pointer: coarse)").matches ? 0.06 : 0.012;

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(64, Math.max(1, time - last));
      last = time;

      lenisRef.current?.lenis?.raf(time);

      f.uptimeMs = time - startedAt;
      f.fps += (1000 / dt - f.fps) * 0.08;

      // Scroll velocity: Lenis reports its own smoothed velocity; without it we
      // difference the native scroll position. Normalised so an ordinary brisk
      // scroll lands near 1.
      const lenis = lenisRef.current?.lenis;
      let raw: number;
      if (lenis) {
        raw = lenis.velocity;
        f.scrollProgress = Number.isFinite(lenis.progress) ? lenis.progress : 0;
      } else {
        const y = window.scrollY;
        raw = ((y - lastScrollY) * 16.67) / dt;
        lastScrollY = y;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        f.scrollProgress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      }
      const target = Math.max(-2, Math.min(2, raw / 45));
      f.scrollVelocity += (target - f.scrollVelocity) * 0.18;

      f.pointerActive += (f.pointerTargetActive - f.pointerActive) * 0.09;
      f.live += (f.targetLive - f.live) * 0.05;

      // The pull-back is slow and heavy in both directions: it is a camera move,
      // not a toggle, and easing it fast makes the room read as a cut.
      f.eject += (f.ejectTarget - f.eject) * 0.055;
      if (Math.abs(f.ejectTarget - f.eject) < 0.0008) f.eject = f.ejectTarget;
      f.gravity += (f.gravityTarget - f.gravity) * 0.12;

      // Power-on is a fixed 1.4s ramp rather than an ease, because the shader
      // shapes it into the strike-and-open curve itself.
      if (f.boot !== f.bootTarget) {
        const dir = f.bootTarget > f.boot ? 1 : -1;
        f.boot += (dir * dt) / 1400;
        if ((dir > 0 && f.boot > f.bootTarget) || (dir < 0 && f.boot < f.bootTarget)) {
          f.boot = f.bootTarget;
        }
      }

      const absVel = Math.min(1, Math.abs(f.scrollVelocity));
      if (Math.abs(absVel - publishedVel) > velEpsilon) {
        publishedVel = absVel;
        document.documentElement.style.setProperty("--scroll-v", absVel.toFixed(3));
      }
      if (Math.abs(f.scrollProgress - publishedProg) > 0.004) {
        publishedProg = f.scrollProgress;
        document.documentElement.style.setProperty("--scroll-p", f.scrollProgress.toFixed(3));
      }

      // The vertical-deflection curve, shared with the shader so the boot text
      // opens with the picture rather than alongside it. Only published while it
      // is actually moving; a settled machine writes nothing.
      if (f.boot !== publishedBoot) {
        publishedBoot = f.boot;
        const x = Math.min(1, Math.max(0, (f.boot - 0.05) / 0.57));
        const open = x * x * (3 - 2 * x);
        document.documentElement.style.setProperty("--boot-open", open.toFixed(4));
      }

      if (document.hidden) return;
      subscribers.current.forEach((cb) => cb(time, dt));

      // ── impacts: sound them once, then let them fade ────────────────────
      // Drained after the subscribers so every layer has already seen this
      // frame's collisions. Sounding is keyed on the timestamp rather than on
      // clearing the list, because the shader needs the impact to persist for a
      // few hundred milliseconds to be visible at all — a one-frame flash is
      // indistinguishable from a dropped frame.
      const impacts = f.impacts;
      if (impacts.length > 0) {
        const now = performance.now();
        let newest = lastSounded;
        for (let i = impacts.length - 1; i >= 0; i--) {
          const p = impacts[i];
          if (p.at > lastSounded) {
            audioRef.current?.impact(p.energy);
            if (p.at > newest) newest = p.at;
          }
          if (now - p.at > IMPACT_LIFETIME_MS) impacts.splice(i, 1);
        }
        lastSounded = newest;
      }

      audioRef.current?.setBeam(f.scrollVelocity);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onFrame = useCallback((cb: FrameCallback) => {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  // ── audio lifecycle ────────────────────────────────────────────────────────
  // Parked whenever the tab is hidden. A humming AudioContext in a background
  // tab is both a battery cost and, for anyone who tabbed away mid-scroll, a
  // noise coming from nowhere.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) audio.suspend();
      else if (settings.audio) audio.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [audio, settings.audio]);

  useEffect(() => () => audio.dispose(), [audio]);

  const setAudioEnabled = useCallback(
    (enabled: boolean) => {
      setSettings((s) => ({ ...s, audio: enabled }));
      if (!enabled) {
        audio.setMuted(true);
        return;
      }
      // Fired straight from the click, not from an effect: the gesture is the
      // only thing that lets the context start, and it does not survive a tick.
      void audio.enable().then((ok) => {
        if (ok) audio.powerOn();
      });
    },
    [audio],
  );

  const degauss = useCallback(() => {
    frame.current.degaussAt = performance.now();
    audio.degauss();
  }, [audio]);

  // Both of these take over the whole viewport, and both are motion. Under
  // `reduce` they are refused outright rather than degraded, because there is no
  // meaningful still version of "the page falls on the floor".
  const setEjected = useCallback(
    (next: boolean) => {
      if (next && reducedMotion) return;
      // Never both at once: the pile is measured in viewport coordinates, and
      // scaling the viewport into a bezel underneath it would leave the words
      // falling through a floor that is no longer where they think it is.
      if (next) {
        frame.current.gravityTarget = 0;
        setGravityState(false);
      }
      frame.current.ejectTarget = next ? 1 : 0;
      setEjectedState(next);
      audio.eject(next ? 1 : -1);
    },
    [audio, reducedMotion],
  );

  const setGravity = useCallback(
    (next: boolean) => {
      if (next && reducedMotion) return;
      if (next) {
        frame.current.ejectTarget = 0;
        setEjectedState(false);
      }
      frame.current.gravityTarget = next ? 1 : 0;
      setGravityState(next);
    },
    [reducedMotion],
  );

  const burstRain = useCallback((ms: number) => {
    frame.current.rainBoostUntil = performance.now() + ms;
  }, []);

  const scrollTo = useCallback((target: number | string | HTMLElement) => {
    const lenis = lenisRef.current?.lenis;
    if (lenis) {
      lenis.scrollTo(target as never, { offset: -80 });
      return;
    }
    if (typeof target === "number") {
      window.scrollTo({ top: target });
      return;
    }
    const el = typeof target === "string" ? document.querySelector(target) : target;
    el?.scrollIntoView({ block: "start" });
  }, []);

  const setScrollLocked = useCallback((locked: boolean) => {
    const lenis = lenisRef.current?.lenis;
    if (lenis) {
      if (locked) lenis.stop();
      else lenis.start();
    }
    // Also pinned in CSS, because Lenis is not mounted on touch or under
    // reduced motion and the freeze has to hold in both of those cases too.
    document.documentElement.classList.toggle("scroll-locked", locked);
  }, []);

  const setTheme = useCallback((theme: Theme) => setSettings((s) => ({ ...s, theme })), []);
  const setCrtEnabled = useCallback(
    (crtEnabled: boolean) => setSettings((s) => ({ ...s, crtEnabled })),
    [],
  );
  const setScanlines = useCallback(
    (value: number) => setSettings((s) => ({ ...s, scanlines: Math.min(1, Math.max(0, value)) })),
    [],
  );

  const value = useMemo<SystemContextValue>(
    () => ({
      frame,
      settings,
      reducedMotion,
      setTheme,
      setCrtEnabled,
      setScanlines,
      setAudioEnabled,
      audio,
      setEjected,
      ejected,
      setGravity,
      gravityOn,
      degauss,
      burstRain,
      onFrame,
      scrollTo,
      setScrollLocked,
    }),
    [
      settings,
      reducedMotion,
      setTheme,
      setCrtEnabled,
      setScanlines,
      setAudioEnabled,
      audio,
      setEjected,
      ejected,
      setGravity,
      gravityOn,
      degauss,
      burstRain,
      onFrame,
      scrollTo,
      setScrollLocked,
    ],
  );

  return (
    <SystemContext.Provider value={value}>
      {/* Inertial scroll is the point of the effect, but it is motion — so under
          `reduce` we simply never mount it and the browser's native scroll stands.
          Same on touch, where it costs frames and smooths nothing. */}
      {!reducedMotion && !coarsePointer && (
        <ReactLenis root options={LENIS_OPTIONS} ref={lenisRef} />
      )}
      {children}
    </SystemContext.Provider>
  );
}
