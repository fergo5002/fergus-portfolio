"use client";
import { collectionCopy as copy } from "@/content/arcade-collection";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * The room's sound switch, wherever sound happens: on the gallery front, whose
 * cabinets blip under the pointer, and beside the running game. The status
 * strip's own switch is hidden while the room is up, and the room has no bar
 * to carry one (2026-09-28).
 *
 * `returnFocus` is for the running game. A click must not take focus off its
 * stage: a key held through the click would release on this button and stay
 * held in the game, and the next Space would toggle sound instead of playing.
 * So a mouse press never moves focus here (cancelling `mousedown` is what
 * reliably stops the focus move; cancelling `pointerdown` does not in every
 * browser), and the switch hands focus back to the game after.
 */
export default function SoundSwitch({ className = "", keyShortcut, returnFocus }: { className?: string; keyShortcut?: string; returnFocus?(): void }) {
  const { audioLive, setAudioEnabled } = useSystem();
  return (
    <button
      type="button"
      className={`arcade-btn arcade-sound${audioLive ? " is-on" : ""} ${className}`.trim()}
      aria-pressed={audioLive}
      aria-keyshortcuts={keyShortcut}
      onMouseDown={returnFocus ? (e) => e.preventDefault() : undefined}
      onClick={() => {
        setAudioEnabled(!audioLive);
        returnFocus?.();
      }}
    >
      {audioLive ? copy.soundOn : copy.soundOff}
    </button>
  );
}
