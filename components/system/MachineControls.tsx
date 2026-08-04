"use client";

import { useSystem } from "./SystemProvider";

/**
 * The three switches on the front of the machine.
 *
 * These live in the status strip rather than behind terminal commands because
 * of what they are: the best things on this site are the ones nobody would
 * discover by typing `help`. A visitor who never opens the terminal should
 * still be able to find the sound, drop the page on the floor, and step back to
 * look at the machine.
 *
 * Real buttons, in a real focus order, with real labels: the effects they fire
 * are decorative but the controls themselves are not.
 */
export default function MachineControls() {
  const { setAudioEnabled, audioLive, gravityOn, setGravity, ejected, setEjected, audio } =
    useSystem();

  // Deliberately `audioLive`, not the persisted preference. A returning visitor
  // has the preference back but no AudioContext until they touch something, and
  // showing the speaker as lit over a silent tube would make the button that is
  // supposed to fix that mute them instead.
  const audioOn = audioLive;

  return (
    <div className="machine">
      <button
        type="button"
        className={`machine__btn machine__btn--audio${audioOn ? " is-on" : " is-inviting"}`}
        onClick={() => setAudioEnabled(!audioOn)}
        onPointerEnter={() => audio.hover()}
        aria-pressed={audioOn}
        title={
          audioOn
            ? "Mute the tube"
            : "Unmute: 15.625 kHz flyback whine, 50 Hz mains hum, and everything else this thing does. All synthesised."
        }
      >
        <span className="machine__glyph" aria-hidden="true">
          {audioOn ? "◉" : "◎"}
        </span>
        <span className="machine__label">sound</span>
      </button>

      {/* Physics and the pull-back are both motion, and both take over the whole
          viewport, so under `reduce` they are not offered at all: `setGravity`
          and `setEjected` refuse outright, and these two are hidden with them.

          Hidden in CSS, NOT branched out of the tree. `reducedMotion` is
          resolved in a lazy `useState` initialiser during the first client
          render, so the server always assumes false; returning a structurally
          different tree for it is a hydration mismatch on every load, for
          exactly the visitors the preference exists to protect. TiltCard.tsx
          carries the same warning from the last time this bit. `display: none`
          takes them out of the focus order too, which `hidden` visually would
          not. */}
      <div className="machine__motion">
        <button
          type="button"
          className={`machine__btn${gravityOn ? " is-on" : ""}`}
          onClick={() => setGravity(!gravityOn)}
          onPointerEnter={() => audio.hover()}
          aria-pressed={gravityOn}
          title={
            gravityOn
              ? "Put the page back together"
              : "Drop the page. Drag the words, throw them, stack them. Space shakes it, Esc puts it back."
          }
        >
          <span className="machine__glyph" aria-hidden="true">
            {gravityOn ? "◆" : "◇"}
          </span>
          <span className="machine__label">gravity</span>
        </button>

        <button
          type="button"
          className={`machine__btn${ejected ? " is-on" : ""}`}
          onClick={() => setEjected(!ejected)}
          onPointerEnter={() => audio.hover()}
          aria-pressed={ejected}
          title={ejected ? "Back against the glass" : "Step back and look at the machine"}
        >
          <span className="machine__glyph" aria-hidden="true">
            {ejected ? "▣" : "▢"}
          </span>
        <span className="machine__label">{ejected ? "dock" : "eject"}</span>
        </button>
      </div>
    </div>
  );
}
