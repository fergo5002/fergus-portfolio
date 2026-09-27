"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  EJECT_CHANNELS,
  EJECT_COLOURS,
  EJECT_HARDWARE,
  channelIndex,
  dialRest,
  knobTap,
  contrastFromDial,
  dialFromContrast,
  ejectCase,
  ejectGeometry,
  ejectLayout,
  ejectLean,
} from "@/lib/eject";
import type { Box, EjectLayout } from "@/lib/eject";
import { THEME_PHOSPHOR } from "@/lib/system";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { requestCommand } from "@/lib/shell-request";
import { ejectCopy as copy } from "@/content/eject";
import { useSystem } from "./SystemProvider";
import "./eject.css";

const getServerShell = () => INITIAL_SHELL;

/**
 * The hardware in the chin of the ejected monitor: a channel dial, a colour
 * knob, a contrast knob, a degauss button and the power switch.
 *
 * The plastic they are set into, the recess, the grille and the power LED are
 * drawn by the shader. These are the real controls on top of it: native range
 * inputs under the knobs and real buttons, so a keyboard and a screen reader
 * operate the same machine a mouse does. `lib/eject.ts` lays them out, the same
 * layout the shader draws the chin from, and one transform a frame moves the
 * whole row with the monitor, written through a ref from the one frame clock.
 *
 * Nothing renders until somebody first ejects, so none of it reaches the server
 * HTML, and it is `inert` whenever the monitor is not ejected.
 */

/** Pixels of drag per detent, by how many detents a knob has. */
function dragPx(positions: number): number {
  if (positions > 10) return 7;
  if (positions > 4) return 16;
  return 26;
}

type KnobProps = {
  name: "channel" | "colour" | "contrast";
  label: string;
  box: Box;
  labelH: number;
  min: number;
  max: number;
  /** The current position. May sit below `min` when the page is off the dial. */
  value: number;
  /** How far a tap moves it. */
  tapStep: number;
  /** Degrees from the first detent to the last. */
  sweep: number;
  valueText: string;
  /** Detents printed round the knob, and a colour for any that has its own. */
  ticks: { at: number; colour?: string }[];
  inputRef?: Ref<HTMLInputElement>;
  /** Each detent passed while dragging: a click, and the on-screen display. */
  onTurn(v: number): void;
  onCommit(v: number): void;
};

/**
 * A knob: a drawn cap over a native range input. The input takes the keyboard
 * and assistive technology; the cap takes a drag (up or right turns it
 * clockwise) or a tap (the next position). A drag previews and commits on
 * release, so turning the channel dial past four routes changes route once.
 */
function Knob(props: KnobProps) {
  const { name, label, box, labelH, min, max, value, tapStep, sweep, valueText, ticks, onTurn, onCommit } = props;
  const [held, setHeld] = useState<number | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: number; at: number; moved: boolean } | null>(null);
  // A value below `min` is a dial resting between detents (the channel dial
  // on a page that is not a channel): drawn half a detent before the first,
  // and still a value the native input can hold, so the keyboard moves on.
  const shown = held ?? value;
  const rest = held ?? dialRest(value);
  const angle = (v: number) => -sweep / 2 + ((v - min) / Math.max(1, max - min)) * sweep;
  const step = dragPx(max - min + 1);

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.parentElement?.querySelector("input")?.focus({ preventScroll: true });
    const from = Math.max(min, shown);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from, at: from, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientX - d.x - (e.clientY - d.y);
    if (Math.abs(delta) > 5) d.moved = true;
    if (!d.moved) return;
    const v = Math.min(max, Math.max(min, d.from + Math.round(delta / step)));
    if (v !== d.at) {
      d.at = v;
      setHeld(v);
      onTurn(v);
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setHeld(null);
    const tapped = knobTap(value, min, max, tapStep);
    const next = d.moved ? d.at : tapped;
    if (next !== value) onCommit(next);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setHeld(null);
  };

  return (
    <label
      className={`ejhw__ctl ejhw__ctl--${name}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h + labelH }}
    >
      <span
        className="ejhw__knob"
        style={{ height: box.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // The label would otherwise forward this click to the input.
        onClick={(e) => e.preventDefault()}
      >
        {ticks.map((t) => (
          <span
            key={t.at}
            className="ejhw__tick"
            data-lit={t.at === shown}
            style={{ "--at": `${angle(t.at)}deg`, "--tick": t.colour } as CSSProperties}
          />
        ))}
        <span className="ejhw__cap" style={{ "--turn": `${angle(rest)}deg` } as CSSProperties} />
        <input
          ref={props.inputRef}
          type="range"
          className="ejhw__range"
          min={Math.min(min, shown)}
          max={max}
          step={1}
          value={shown}
          aria-valuetext={valueText}
          title={copy.turnHint}
          onChange={(e) => onCommit(Number(e.currentTarget.value))}
        />
      </span>
      <span className="ejhw__name">{label}</span>
    </label>
  );
}

const rgb = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

export default function EjectHardware() {
  const { frame, onFrame, ejected, setEjected, settings, setTheme, setScanlines, degauss, audio } = useSystem();
  const router = useRouter();
  const path = usePathname();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);

  const [armed, setArmed] = useState(false);
  const [layout, setLayout] = useState<EjectLayout | null>(null);
  const [power, setPower] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [osd, setOsd] = useState<{ text: string; bar: number | null; n: number } | null>(null);
  const [osdHost, setOsdHost] = useState<HTMLElement | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<HTMLInputElement>(null);
  /** True while the tube is off because this switch turned it off. */
  const offRef = useRef(false);
  /** Put focus back on the dial once the route it tuned to has arrived. */
  const refocusRef = useRef(false);
  const degaussTimer = useRef(0);

  // Mounted on the first eject and kept after it, hidden by CSS while docked:
  // unmounting on dock would drop the controls mid-air while the chin is still
  // sliding off the bottom of the screen.
  useEffect(() => {
    if (ejected) setArmed(true);
  }, [ejected]);

  useEffect(() => {
    if (!armed) return;
    setOsdHost(document.querySelector<HTMLElement>(".crt__assembly"));
    const measure = () =>
      setLayout((prev) =>
        prev && prev.vw === window.innerWidth && prev.vh === window.innerHeight
          ? prev
          : ejectLayout(window.innerWidth, window.innerHeight),
      );
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [armed]);

  // Follow the monitor: the same geometry and the same lean the rig and the
  // shader use this frame, so the row lands on the chin the shader draws.
  useEffect(() => {
    if (!layout) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let last = "";
    return onFrame(() => {
      const node = rootRef.current;
      const f = frame.current;
      if (!node || (f.eject <= 0.004 && f.ejectTarget === 0)) return;
      const [px, py] = ejectLean(f.pointerX, f.pointerY, f.pointerActive, coarse);
      const g = ejectGeometry(f.eject, px, py, layout.scale);
      const c = ejectCase(g, layout);
      const next = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${c.k.toFixed(5)})`;
      if (next !== last) {
        node.style.transform = next;
        last = next;
      }
    });
  }, [layout, frame, onFrame]);

  // ── power ────────────────────────────────────────────────────────────────
  const restorePower = useCallback(() => {
    if (!offRef.current) return;
    offRef.current = false;
    frame.current.bootTarget = 1;
    setPower(true);
  }, [frame]);

  const togglePower = () => {
    const f = frame.current;
    if (offRef.current) {
      offRef.current = false;
      f.bootTarget = 1;
      audio.powerOn();
      setPower(true);
    } else {
      offRef.current = true;
      f.bootTarget = 0;
      audio.relay();
      setPower(false);
    }
  };

  // A dark tube with nothing to switch it back on is the worst state on the
  // site, so every way out of the eject switches it back on: Escape, the enter
  // control, gravity, the arcade and a nav link all dock through `ejected`.
  useEffect(() => {
    if (!ejected) restorePower();
  }, [ejected, restorePower]);

  useEffect(() => {
    return () => {
      if (offRef.current) frame.current.bootTarget = 1;
    };
  }, [frame]);

  /** Turning a knob on a set in standby switches it on, as it did on a real one. */
  const wake = () => {
    if (!offRef.current) return;
    restorePower();
    audio.powerOn();
  };

  // ── Escape ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ejected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || shellStore.get().open) return;
      const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
      setEjected(false);
      // The hardware goes inert, so focus goes to the control that brings it back.
      if (hadFocus) document.querySelector<HTMLElement>(".machine__motion .machine__btn:last-child")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ejected, setEjected]);

  // ── the on-screen display ────────────────────────────────────────────────
  const showOsd = (text: string, bar: number | null = null) =>
    setOsd((o) => ({ text, bar, n: (o?.n ?? 0) + 1 }));

  // ── channel ──────────────────────────────────────────────────────────────
  const arcadeOpen = shell.arcade !== "closed";
  const current = channelIndex(path, arcadeOpen);
  const channel = pending ?? current;

  useEffect(() => {
    setPending(null);
    // The route change moves focus to <main> (RouteTransition, which runs its
    // effect before this one). A keyboard turning the dial keeps the dial.
    if (refocusRef.current) {
      refocusRef.current = false;
      channelRef.current?.focus({ preventScroll: true });
    }
  }, [path]);

  const tune = (i: number) => {
    const ch = EJECT_CHANNELS[i];
    if (!ch) return;
    wake();
    showOsd(copy.osdChannel(i + 1, ch.label));
    if (ch.href !== null) {
      if (ch.href === path) return;
      setPending(i);
      refocusRef.current = rootRef.current?.contains(document.activeElement) ?? false;
      router.push(ch.href);
      return;
    }
    // The arcade is a program, not a page: ask the shell to open the door,
    // exactly as the nav's `cd arcade` does.
    if (ch.command !== null && shellStore.get().arcade === "closed") {
      requestCommand(ch.command);
      shellStore.dispatch({ type: "open" });
    }
  };

  // ── colour and contrast ──────────────────────────────────────────────────
  const colour = Math.max(0, EJECT_COLOURS.indexOf(settings.theme));
  const setColour = (i: number) => {
    const theme = EJECT_COLOURS[i];
    if (!theme || theme === settings.theme) return;
    wake();
    setTheme(theme);
    // A new phosphor degausses, as the `theme` command does.
    degauss();
    showOsd(copy.osdColour(theme));
  };

  const contrast = dialFromContrast(settings.scanlines);
  const setContrast = (v: number) => {
    wake();
    setScanlines(contrastFromDial(v));
    showOsd(copy.osdContrast, contrastFromDial(v));
  };

  // ── degauss ──────────────────────────────────────────────────────────────
  const onDegauss = () => {
    wake();
    degauss();
    showOsd(copy.osdDegauss);
    const assembly = document.querySelector<HTMLElement>(".crt__assembly");
    if (!assembly) return;
    assembly.classList.remove("is-degaussing");
    // Restart the wobble if it is pressed again mid-swirl.
    void assembly.offsetWidth;
    assembly.classList.add("is-degaussing");
    window.clearTimeout(degaussTimer.current);
    degaussTimer.current = window.setTimeout(() => assembly.classList.remove("is-degaussing"), 1000);
  };

  useEffect(
    () => () => {
      window.clearTimeout(degaussTimer.current);
      document.querySelector(".crt__assembly")?.classList.remove("is-degaussing");
    },
    [],
  );

  if (!armed || !layout) return null;

  const L = layout;
  const labelH = EJECT_HARDWARE.label * L.unit;
  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });
  const last = EJECT_CHANNELS.length - 1;
  const spoken = EJECT_CHANNELS[Math.max(0, channel)];

  return (
    <>
      <div
        ref={rootRef}
        className="ejhw"
        role="group"
        aria-label={copy.hardware}
        inert={!ejected}
        data-power={power ? "on" : "off"}
        style={{ width: L.caseW, height: L.caseH, "--u": L.unit } as CSSProperties}
      >
        {L.badge && (
          <span className="ejhw__badge" style={at(L.badge)} aria-hidden="true">
            {copy.badge}
            <span className="ejhw__model">{copy.model}</span>
          </span>
        )}

        <Knob
          name="channel"
          label={copy.channel}
          box={L.controls.channel}
          labelH={labelH}
          min={0}
          max={last}
          value={channel}
          tapStep={1}
          sweep={270}
          valueText={channel < 0 ? copy.channelOff : copy.channelValue(channel + 1, spoken.label)}
          ticks={EJECT_CHANNELS.map((_, i) => ({ at: i }))}
          inputRef={channelRef}
          onTurn={(v) => {
            audio.key();
            showOsd(copy.osdChannel(v + 1, EJECT_CHANNELS[v].label));
          }}
          onCommit={tune}
        />

        <Knob
          name="colour"
          label={copy.colour}
          box={L.controls.colour}
          labelH={labelH}
          min={0}
          max={EJECT_COLOURS.length - 1}
          value={colour}
          tapStep={1}
          sweep={120}
          valueText={EJECT_COLOURS[colour]}
          ticks={EJECT_COLOURS.map((theme, i) => ({ at: i, colour: rgb(THEME_PHOSPHOR[theme]) }))}
          onTurn={(v) => {
            audio.key();
            showOsd(copy.osdColour(EJECT_COLOURS[v]));
          }}
          onCommit={setColour}
        />

        <Knob
          name="contrast"
          label={copy.contrast}
          box={L.controls.contrast}
          labelH={labelH}
          min={0}
          max={EJECT_HARDWARE.contrastSteps}
          value={contrast}
          tapStep={5}
          sweep={270}
          valueText={copy.contrastValue(Math.round(contrastFromDial(contrast) * 100))}
          ticks={[0, 5, 10, 15, 20].map((v) => ({ at: v }))}
          onTurn={(v) => {
            audio.key();
            showOsd(copy.osdContrast, contrastFromDial(v));
          }}
          onCommit={setContrast}
        />

        <button
          type="button"
          className="ejhw__ctl ejhw__btn ejhw__btn--degauss"
          style={{ ...at(L.controls.degauss), height: L.controls.degauss.h + labelH }}
          onClick={onDegauss}
          title={copy.degaussHint}
        >
          <span className="ejhw__switch" style={{ height: L.controls.degauss.h }} aria-hidden="true">
            <span className="ejhw__face" />
          </span>
          <span className="ejhw__name">{copy.degauss}</span>
        </button>

        <button
          type="button"
          className="ejhw__ctl ejhw__btn ejhw__btn--power"
          style={{ ...at(L.controls.power), height: L.controls.power.h + labelH }}
          onClick={togglePower}
          aria-pressed={power}
          title={power ? copy.powerOffHint : copy.powerOnHint}
        >
          <span className="ejhw__switch" style={{ height: L.controls.power.h }} aria-hidden="true">
            <span className="ejhw__face" />
          </span>
          <span className="ejhw__name">{copy.power}</span>
        </button>
      </div>

      {osdHost &&
        osd &&
        ejected &&
        createPortal(
          <div key={osd.n} className="ejosd" aria-hidden="true">
            <span>{osd.text}</span>
            {osd.bar !== null && (
              <span className="ejosd__bar">
                <span style={{ width: `${Math.round(osd.bar * 100)}%` }} />
              </span>
            )}
          </div>,
          osdHost,
        )}
    </>
  );
}
