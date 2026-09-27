"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import {
  BOOTING_CLASS,
  BOOT_PHASES,
  BOOT_REARM_MS,
  BOOT_WATCHDOG_MS,
  SESSION_KEY,
  armBootFailsafe,
  bootTimeline,
  disarmBootFailsafe,
  pickBootProfile,
} from "@/lib/boot";
import type { BootPhase } from "@/lib/boot";
import { typedText } from "@/lib/arcade/bios";
import { postLines, postReveal, refreshFromGaps } from "@/lib/post";
import type { HostEnv } from "@/lib/post";
import { MARK_VIEWBOX, markPointIn, markRuns, markStrokePaths, markTraceAt } from "@/lib/mark";
import { beamGainFor, beamLength, clearBeam, readBeam, writeBeam } from "@/lib/beam";
import "./boot.css";

const [CHEVRON, CARET] = markStrokePaths();
const VIEWBOX = `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.w} ${MARK_VIEWBOX.h}`;
const STEP = Object.fromEntries(BOOT_PHASES.map((p, i) => [p, i])) as Record<BootPhase, number>;

/**
 * The visitor's machine, as their browser reports it. Read once on mount and
 * kept in the effect's closure until the boot ends: never stored, never sent,
 * and only ever written to a text node inside an overlay PostHog is told to
 * ignore. `lib/post.ts` decides what of it is printed and how.
 */
function readHost(): HostEnv {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* no Intl: the locale line says what it can */
    }
    return {
      cores: nav.hardwareConcurrency,
      memoryGb: nav.deviceMemory,
      screenW: window.screen?.width,
      screenH: window.screen?.height,
      dpr: window.devicePixelRatio,
      locale: nav.language,
      timeZone,
    };
  } catch {
    return {};
  }
}

/**
 * Renders its children immediately (good for SSR / no-JS / SEO) and, on the first
 * visit of a session, overlays a one-time cold start.
 *
 * The tube is genuinely off, then its line strikes and the picture opens (the
 * shader's `frame.boot` path). The BIOS types its header, counts its memory,
 * reads out the visitor's own machine, and works through Fergus's devices down
 * to the caffeine. Then the picture drops out for a mode switch, the tube comes
 * live, and the beam traces the site's mark in one stroke, leaving a real trail
 * in the phosphor. The mark folds to a line, and the page opens out of it.
 *
 * All of that is `bootTimeline` read once a frame off the one frame clock, and
 * written through refs and CSS variables. The only timers are the strike, the
 * watchdog and the handoff, so a slow machine lands the same words at the same
 * moments in fewer frames, and a tab that comes back from the background
 * catches up rather than crawling.
 *
 * Skippable at any point, never shown twice in a session, and never shown under
 * `prefers-reduced-motion`. The ownership of the reveal is in `lib/boot.ts`.
 */
export default function BootSequence({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(false);
  const { frame, degauss, burstRain, audio, onFrame } = useSystem();
  const finishedRef = useRef(false);
  // Read by the watchdog below. Held in a ref rather than named as an effect
  // dependency so that the mount effect keeps a stable identity: re-running it
  // would restrike the tube mid-sequence.
  const finishRef = useRef<() => void>(() => {});
  const overlayRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const memRef = useRef<HTMLDivElement>(null);
  const postRef = useRef<HTMLDivElement>(null);
  const devRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGSVGElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The pre-paint script in <head> already decided whether to boot (session +
    // reduced-motion check) and flagged <html> as .booting. Derive from that so we
    // never flip false->true after first paint (which caused the content flash).
    //
    // Nothing to disarm on the paths that fall out here: the inline script only
    // arms its failsafe on the same branch that adds the class.
    if (!document.documentElement.classList.contains(BOOTING_CLASS)) return;

    // Which boot this machine gets, decided once: it must not change under a
    // running sequence.
    const profile = pickBootProfile({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      width: window.innerWidth,
    });
    const host = readHost();
    setBooting(true);
    const f = frame.current;
    // Hold the phosphor layer dark until the machine is actually up...
    f.live = 0;
    f.targetLive = 0;
    // ...and the tube itself genuinely off, not merely dim.
    f.boot = 0;
    f.bootTarget = 0;

    // The one phase a timer runs: the tube sits off, then deflection comes up,
    // the line strikes and the picture opens. The timeline's clock starts at
    // the first frame after this, so a strike that fires late delays the whole
    // sequence evenly instead of letting the text run ahead of the tube.
    let struck = false;
    const strike = window.setTimeout(() => {
      struck = true;
      frame.current.bootTarget = 1;
      audio.powerOn();
    }, profile.strikeMs);

    let struckAt = -1;
    let lastTime = -1;
    let lastStep = -1;
    let handoff = 0;
    // Frame gaps until the POST prints, for the refresh rate. Measured across
    // the strike, when the tube is doing its heaviest drawing, which is the
    // honest test of whether a steady rate is really there.
    const gaps: number[] = [];
    let post: string[] | null = null;
    // Where the beam had got to, and how long it has been lit along the path
    // the tube has not read yet.
    let lastU = 0;
    let litMs = 0;
    let markBox: DOMRect | null = null;
    const written: Record<string, string> = {};

    const text = (el: HTMLElement | null, key: string, value: string) => {
      if (el && written[key] !== value) {
        el.textContent = value;
        written[key] = value;
      }
    };
    const publish = (el: Element | null, name: string, value: number) => {
      const v = value.toFixed(4);
      if (el && written[name] !== v) {
        (el as HTMLElement | SVGElement).style.setProperty(name, v);
        written[name] = v;
      }
    };

    const unsubscribe = onFrame((time) => {
      if (lastTime >= 0 && post === null) gaps.push(time - lastTime);
      lastTime = time;
      if (!struck) return;
      if (struckAt < 0) struckAt = time;
      const snap = bootTimeline(profile, profile.strikeMs + (time - struckAt));

      const overlay = overlayRef.current;
      if (overlay && overlay.dataset.phase !== snap.phase) overlay.dataset.phase = snap.phase;
      if (snap.step !== lastStep) {
        if (lastStep < STEP.switch && snap.step >= STEP.switch) {
          // The mode switch: the picture drops out with a relay's clunk, and
          // the tube comes up live for the beam to draw on.
          overlay?.classList.add("is-graphic");
          frame.current.targetLive = 1;
          audio.relay();
        }
        if (lastStep < STEP.trace && snap.step >= STEP.trace) {
          markBox = markRef.current?.getBoundingClientRect() ?? null;
        }
        lastStep = snap.step;
      }

      text(headRef.current, "head", typedText(profile.headLines, snap.headChars));
      if (profile.memoryMs > 0 && snap.step >= STEP.memory) {
        const count = String(snap.memoryK).padStart(6, "0");
        text(memRef.current, "mem", `Memory Test: ${count}K${snap.step > STEP.memory ? " OK" : ""}`);
      }
      if (snap.step >= STEP.post) {
        if (post === null) post = postLines({ ...host, refreshHz: refreshFromGaps(gaps) }, profile.postFields);
        text(postRef.current, "post", postReveal(post, snap.postMs, profile.postMs));
      }
      text(devRef.current, "dev", typedText(profile.deviceLines, snap.deviceChars));

      publish(coverRef.current, "--cover", snap.cover);
      const trace = markTraceAt(snap.trace);
      publish(markRef.current, "--mark-a", trace.strokes[0]);
      publish(markRef.current, "--mark-b", trace.strokes[1]);
      publish(markRef.current, "--collapse", snap.collapse);

      // The beam: the lit path swept since the last frame, onto the phosphor.
      // If the tube has not read the last path yet (it draws at 30fps on a
      // phone) and this one carries straight on from it, the two are joined
      // rather than the first being overwritten.
      if (markBox && lastU < 1 && snap.step >= STEP.trace) {
        const runs = markRuns(lastU, snap.trace);
        const run = runs[runs.length - 1];
        if (run) {
          const box = markBox;
          const pts = run.pts.map((p) => {
            const q = markPointIn(p, box);
            return { x: q.x / window.innerWidth, y: q.y / window.innerHeight };
          });
          const joins = runs.length === 1 && run.from === lastU && frame.current.beamCount > 0;
          const path = joins ? [...readBeam(frame.current), ...pts.slice(1)] : pts;
          litMs = (joins ? litMs : 0) + (run.to - run.from) * profile.traceMs;
          const aspect = window.innerWidth / Math.max(1, window.innerHeight);
          writeBeam(frame.current, path, beamGainFor(litMs, beamLength(path, aspect)));
        }
        lastU = snap.trace;
      }

      // The end. Dropping the overlay is a state change, and state never
      // changes inside a frame callback, so it is handed to a timeout.
      if (snap.done && !handoff) handoff = window.setTimeout(() => finishRef.current(), 0);
    });

    // Covers the case disarming the inline failsafe opens up: this component
    // mounted, took ownership of the reveal, and then stalled part-way (no
    // frames at all: a tab that never comes back, a main thread that never
    // yields). Goes through finish() rather than stripping the class, so the
    // tube still powers on properly instead of the overlay simply vanishing.
    const watchdog = window.setTimeout(() => finishRef.current(), BOOT_WATCHDOG_MS);

    // Take ownership only once the replacement is actually in place. Disarming
    // first would leave a window, however narrow, in which a throw above has cut
    // the safety net before this component armed its own.
    disarmBootFailsafe();

    return () => {
      unsubscribe();
      window.clearTimeout(strike);
      window.clearTimeout(watchdog);
      window.clearTimeout(handoff);
      clearBeam(frame.current);
      // Hand ownership back. Without this, unmounting before finish() leaves
      // `booting` set with no timer anywhere: the inline failsafe is cancelled,
      // the watchdog is cleared on the line above, and the visitor is looking at
      // a blank tube with no way out but a reload. That is the same class of
      // fault as the one this file was just fixed for, and it is one that
      // removing a safety net always creates. Clicking any nav link while the
      // BIOS is typing reaches it, since this component lives in app/page.tsx.
      // So does a render error in anything it wraps, and Fast Refresh.
      if (!finishedRef.current) {
        armBootFailsafe(BOOT_REARM_MS);
        // And never leave the tube dark behind a page that is about to be
        // shown: the same rule the arcade entrance keeps.
        frame.current.bootTarget = 1;
        frame.current.targetLive = 1;
      }
    };
  }, [frame, audio, onFrame]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore storage errors (private mode) */
    }
    // Reveal the page and drop the overlay together, before anything that could
    // throw. These two used to be separated by the power-on flourish, so a
    // failure in the middle of it left the BIOS screen stranded on top of a
    // visible site: the exact symptom this file was just fixed for, reached by a
    // different route. Plain property writes on `frame` sit here too, since they
    // cannot throw and the tube should be up whatever else happens.
    const f = frame.current;
    f.bootTarget = 1;
    if (f.boot < 0.6) f.boot = 0.6;
    f.targetLive = 1;
    clearBeam(f);

    document.documentElement.classList.remove(BOOTING_CLASS);
    setBooting(false);

    // Decoration from here down: the degauss thump and the CRT power-on that
    // make the revealed site "switch on" rather than pop in. Wrapped because
    // nothing below is worth stranding an overlay for, and when the watchdog is
    // the caller this runs inside a setTimeout where no error boundary can catch
    // it anyway.
    try {
      degauss();
      burstRain(1400);

      const el = document.querySelector<HTMLElement>(".screen");
      const nav = document.querySelector(".nav");
      // The mark folded into a line across the middle of the viewport, so the
      // page opens out of that line, not out of the middle of a document that
      // may be three screens tall.
      if (el) el.style.transformOrigin = `50% ${window.innerHeight / 2 - el.getBoundingClientRect().top}px`;
      el?.classList.add("power-on");
      nav?.classList.add("power-on");
      window.setTimeout(() => {
        el?.classList.remove("power-on");
        nav?.classList.remove("power-on");
        if (el) el.style.transformOrigin = "";
      }, 680);
    } catch {
      /* the site is already up; the flourish is not worth a broken page */
    }
  }, [degauss, burstRain, frame]);

  // Written in an effect rather than during render: React may discard a render
  // under concurrent features, and writing a ref in the body is not safe there.
  useEffect(() => {
    finishRef.current = finish;
  });

  return (
    <>
      {booting && (
        <div
          ref={overlayRef}
          className="boot ph-no-capture"
          role="status"
          aria-label="System booting"
          data-phase="off"
          onClick={finish}
          onKeyDown={finish}
        >
          {/* Squeezed into the tube's opening band by `--boot-open`. Hidden from
              assistive technology: it is costume, typed a character a frame,
              and the status label already says what is happening. */}
          <div className="boot__inner" aria-hidden="true">
            <div ref={headRef} className="boot__lines" />
            <div ref={memRef} className="boot__lines boot__mem" />
            <div ref={postRef} className="boot__lines" />
            <div ref={devRef} className="boot__lines" />
          </div>
          <svg ref={markRef} className="boot__mark" viewBox={VIEWBOX} aria-hidden="true" focusable="false">
            <path className="boot__stroke boot__stroke--chevron" d={CHEVRON} pathLength={1} />
            <path className="boot__stroke boot__stroke--caret" d={CARET} pathLength={1} />
          </svg>
          <div ref={coverRef} className="boot__cover" aria-hidden="true" />
          {/* The skip button deliberately sits outside the squeezed band: an
              escape hatch that is itself a millimetre tall for the first second
              is not an escape hatch. */}
          <button type="button" className="boot__skip" onClick={finish}>
            skip &gt;
          </button>
        </div>
      )}
      {children}
    </>
  );
}
