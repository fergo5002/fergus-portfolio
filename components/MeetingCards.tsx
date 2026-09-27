import Link from "next/link";
import TiltCard from "./motion/TiltCard";
import PixelSprite from "./pixel/PixelSprite";
import { meetingSprites } from "./pixel/meeting-sprites";
import { meetingCopy as copy } from "@/content/meeting";
import "./meeting.css";

/**
 * A pixel mug and a pixel telephone, in the tube's own phosphor. The steam
 * drifts on its own; the phone rings when the pointer or focus reaches it.
 * Both rest on frame 0 under reduced motion.
 */
export function MeetingDrawing({ kind }: { kind: "coffee" | "call" }) {
  return (
    <PixelSprite
      sprite={meetingSprites[kind]}
      className={`meeting-drawing meeting-drawing--${kind}${kind === "coffee" ? " pixel--boil" : ""}`}
    />
  );
}

export default function MeetingCards() {
  return <div className="meeting-cards">
    {(["coffee", "call"] as const).map((kind) => <TiltCard key={kind} className="meeting-card" max={3}>
      <Link href={`/contact?meet=${kind}`} className="meeting-card__link">
        <MeetingDrawing kind={kind} />
        <span className="meeting-card__title">{copy[kind]}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
        <span className="meeting-card__detail">{copy[`${kind}Detail`]}</span>
      </Link>
    </TiltCard>)}
  </div>;
}
