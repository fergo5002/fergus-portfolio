"use client";
import { useEffect, useRef, useState } from "react";
import { atlasCopy as copy } from "@/content/studio/atlas-copy";
import type { Inspection } from "@/lib/studio/atlas-view";
import { Press } from "./Furniture";

export type Media = { url: string; kind: string };

/**
 * The inspector: a compact sheet that slides over the map when a node is
 * chosen (from the right on a wide screen, up from the bottom on a phone),
 * rather than a text box under it. It scrolls on its own, so it carries
 * `data-lenis-prevent`: the page's smooth scroll otherwise takes every wheel
 * event over it and scrolls the page instead.
 *
 * Order: what the file is, how it was read, the pin, why each neighbour is
 * connected (each one a way there), then the text itself. Media plays with
 * a drawn button, never the browser's own controls.
 */
export default function AtlasInspector({
  view,
  media,
  pinned,
  onClose,
  onPin,
  onSelect,
  onMediaError,
}: {
  view: Inspection;
  media?: Media;
  pinned: boolean;
  onClose: () => void;
  onPin: () => void;
  onSelect: (id: string) => void;
  onMediaError: (message: string) => void;
}) {
  const more = view.total - view.related.length;
  return (
    <aside
      className="atlas-inspector"
      aria-label={copy.inspector}
      data-lenis-prevent=""
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="atlas-inspector__head">
        <h2 className="atlas-inspector__title">{view.label}</h2>
        <button type="button" className="atlas-inspector__close" aria-label={copy.close} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>
      <p className="atlas-inspector__path">{view.path}</p>
      <p className="atlas-inspector__meta">
        <span className={view.read ? "atlas-lamp atlas-lamp--read" : "atlas-lamp"} aria-hidden="true" />
        {view.folder ? copy.links(view.total) : `${view.read ? copy.read : copy.metadata} · ${copy.bytes(view.size)}`}
      </p>
      {view.note ? <p className="atlas-inspector__note">{view.note}</p> : null}
      {media ? <MediaPreview key={view.id} media={media} label={view.label} onError={onMediaError} /> : null}
      {view.folder ? null : (
        <div className="atlas-inspector__actions">
          <Press active={pinned} onClick={onPin}>
            {pinned ? copy.unpin : copy.pin}
          </Press>
        </div>
      )}
      {view.related.length ? (
        <>
          {view.folder ? null : <p className="atlas-inspector__count">{copy.links(view.total)}</p>}
          <ul className="atlas-inspector__links">
            {view.related.map((r, i) => (
              <li key={`${r.id}:${r.kind}:${i}`}>
                <button type="button" className="atlas-related" data-kind={r.kind} onClick={() => onSelect(r.id)}>
                  <span className="atlas-related__name">{r.label}</span>
                  <span className="atlas-related__why">{r.evidence}</span>
                </button>
              </li>
            ))}
          </ul>
          {more > 0 ? <p className="atlas-inspector__note">{copy.more(more)}</p> : null}
        </>
      ) : (
        <p className="atlas-inspector__note">{copy.noLinks}</p>
      )}
      {view.text ? (
        <pre className="atlas-text" tabIndex={0}>
          {view.text}
          {view.clipped ? `\n\n${copy.clipped}` : ""}
        </pre>
      ) : null}
    </aside>
  );
}

/** An image as itself; audio and video behind one drawn play button and a time readout. */
function MediaPreview({ media, label, onError }: { media: Media; label: string; onError: (message: string) => void }) {
  const player = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, of: 0 });
  useEffect(() => () => player.current?.pause(), []);

  if (media.kind === "image")
    // A blob URL from the visitor's own file: next/image has nothing to optimise here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="atlas-media" src={media.url} alt={label} onError={() => onError(copy.errors.decodeImage)} />;
  if (media.kind !== "audio" && media.kind !== "video") return null;

  const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
  const events = {
    ref: (el: HTMLMediaElement | null) => {
      player.current = el;
    },
    src: media.url,
    preload: "metadata" as const,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onLoadedMetadata: (e: { currentTarget: HTMLMediaElement }) => setTime({ at: 0, of: e.currentTarget.duration }),
    onTimeUpdate: (e: { currentTarget: HTMLMediaElement }) =>
      setTime({ at: e.currentTarget.currentTime, of: e.currentTarget.duration }),
    onError: () => onError(media.kind === "audio" ? copy.errors.playAudio : copy.errors.playVideo),
  };
  const toggle = () => {
    const el = player.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => onError(media.kind === "audio" ? copy.errors.playAudio : copy.errors.playVideo));
    else el.pause();
  };
  return (
    <div className="atlas-media" data-kind={media.kind}>
      {media.kind === "video" ? <video className="atlas-media__video" playsInline {...events} /> : <audio {...events} />}
      <div className="atlas-media__bar">
        <button type="button" className="atlas-media__play" aria-label={playing ? copy.pause : copy.play} onClick={toggle}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {playing ? <path d="M5 3.5v9M11 3.5v9" /> : <path d="M5 3l8 5-8 5z" />}
          </svg>
        </button>
        <span className="atlas-media__time">
          {clock(time.at)} / {clock(time.of)}
        </span>
        <span className="atlas-media__track" aria-hidden="true">
          <span style={{ width: `${time.of ? (100 * time.at) / time.of : 0}%` }} />
        </span>
      </div>
    </div>
  );
}
