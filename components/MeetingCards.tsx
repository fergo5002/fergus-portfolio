import Link from "next/link";
import TiltCard from "./motion/TiltCard";
import { meetingCopy as copy } from "@/content/meeting";
import "./meeting.css";

/** Small diagrams drawn with the same phosphor as the surrounding machine. */
export function MeetingDrawing({ kind }: { kind: "coffee" | "call" }) {
  return (
    <svg className={`meeting-drawing meeting-drawing--${kind}`} viewBox="0 0 240 120" fill="none" aria-hidden="true">
      {kind === "coffee" ? <>
        <ellipse cx="116" cy="101" rx="67" ry="7" />
        <path d="M67 49h87v28c0 17-16 24-43 24S67 94 67 77V49Z" />
        <ellipse cx="110.5" cy="49" rx="43.5" ry="9" />
        <path d="M154 56h12c24 0 21 29-12 27M83 72v10" />
        <g className="meeting-drawing__steam"><path d="M90 31c-12-12 13-13 1-26M113 29c-12-12 13-13 1-26M136 31c-12-12 13-13 1-26" /></g>
      </> : <>
        <rect x="44" y="19" width="152" height="84" rx="5" />
        <path d="M94 111h52M120 103v8M55 86h130" />
        <g className="meeting-drawing__wave"><path d="M69 53v10M82 43v30M95 34v48M108 45v27M121 39v40M134 49v20M147 34v48M160 44v28M173 52v12" /></g>
      </>}
    </svg>
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
