import Link from "next/link";
import TiltCard from "./motion/TiltCard";
import { meetingCopy as copy } from "@/content/meeting";
import "./meeting.css";

/** Etched objects, drawn directly in the tube's phosphor. No external assets. */
export function MeetingDrawing({ kind }: { kind: "coffee" | "call" }) {
  return (
    <svg className={`meeting-drawing meeting-drawing--${kind}`} viewBox="0 0 240 180" fill="none" aria-hidden="true" focusable="false">
      <g className="meeting-drawing__registration">
        <path d="M22 57V45h12M206 45h12v12M22 146v12h12M206 158h12v-12" />
        <path d="M34 165h172M42 169h156" strokeDasharray="1 5" />
      </g>
      {kind === "coffee" ? <>
        <ellipse className="meeting-drawing__wash" cx="121" cy="151" rx="76" ry="10" />
        <path className="meeting-drawing__solid" d="M39 138c0 13 36 23 80 23s80-10 80-23" />
        <ellipse className="meeting-drawing__solid" cx="119" cy="137" rx="80" ry="18" />
        <ellipse className="meeting-drawing__etch" cx="118" cy="136" rx="67" ry="12" />
        <path className="meeting-drawing__etch" d="M51 145l8 6m1-4 8 6m2-4 8 5m3-3 7 5m6-3 5 4m8-2 3 4m11-3v4m12-5-2 4m13-6-3 5m13-8-4 5m13-9-5 5m13-9-6 5" />

        {/* The spoon sits behind the mug, with an inset bowl and a narrow neck. */}
        <path className="meeting-drawing__solid" d="m164 127 34-16c5-2 10 0 11 3 1 4-2 7-7 8l-36 9c-4 1-6-2-2-4Z" />
        <path className="meeting-drawing__etch" d="m172 127 27-10m0-2c4-2 7-1 7 1s-3 3-7 3" />

        <path className="meeting-drawing__solid" d="M155 73c12-6 33-2 34 13 2 15-12 27-33 24l2-11c14 2 22-4 20-12-1-6-10-7-20-3Z" />
        <path className="meeting-drawing__etch" d="M165 75c11-2 20 2 21 11m-3 12-5-2m1 8-5-4m-1 7-3-4m-4 5-2-4" />
        <path className="meeting-drawing__solid" d="m61 65 7 53c2 15 17 22 44 22s44-7 46-22l5-53Z" />
        <path className="meeting-drawing__wash" d="M137 74c1 20-2 43-12 59 16-2 28-7 30-18l5-48Z" />
        <path className="meeting-drawing__etch" d="m70 82 2 11m1 5 2 15m65-33 16-6m-17 12 16-6m-17 12 16-6m-17 12 16-6m-17 12 16-6m-17 12 16-6m-18 12 17-6m-19 12 17-6m-21 12 18-6" />
        <path className="meeting-drawing__highlight" d="m77 86 3 24c1 6 4 10 9 12M83 81l1 10" />
        <path d="M75 127c15 9 59 10 73-2" />
        <ellipse className="meeting-drawing__solid" cx="112" cy="65" rx="51" ry="15" />
        <ellipse cx="112" cy="65" rx="43" ry="10" />
        <path className="meeting-drawing__wash" d="M70 66c13-12 70-12 84 0-9 12-72 12-84 0Z" />
        <path className="meeting-drawing__etch" d="M78 64c13-7 53-7 66 0M84 69c15 5 44 5 57-1m-44-7c9-2 23-2 30 0" />
        <path d="M108 64c-7-5-19-1-13 3 7 4 25 2 24-2-1-3-10-2-9 0" />
        <g className="meeting-drawing__stipples">
          <path d="M83 63h1m5-3h1m47 5h1m-9 6h1m-52 35h1m2 6h1m7 4h1m43-15h1m-3 9h1m-5 8h1m-11 6h1m-15 0h1" />
        </g>
        <g className="meeting-drawing__steam">
          <path d="M91 44c-15-10 13-15 4-26m17 25c14-12-13-16-1-29m25 32c-13-8 9-15 3-24" />
          <path className="meeting-drawing__etch" d="M85 42c-9-10 11-15 8-23m24 23c9-11-12-15-7-25m21 25c-5-6 10-13 7-19" />
        </g>
      </> : <>
        <ellipse className="meeting-drawing__wash" cx="121" cy="156" rx="77" ry="9" />
        {/* A loose, coiled receiver lead, rather than a generic call waveform. */}
        <path className="meeting-drawing__cord" d="M65 74c-28-9-39 4-34 22 2 7 11 10 13 3s-11-14-13-5 12 21 15 12-11-15-12-6 12 21 15 12-11-15-12-6 12 21 15 12-11-15-12-6 12 21 15 12-11-15-12-6 9 18 14 13c8 10 0 20-14 17-7-1-9-7-6-10" />
        <path className="meeting-drawing__solid" d="M52 132v15c0 8 8 12 17 12h105c10 0 17-4 17-12v-15Z" />
        <path className="meeting-drawing__etch" d="M62 149h116m-109 5h15m69 0h18M57 141v7m6-5v8m6-7v8m6-7v8m6-7v8m6-7v8m6-7v8m6-7v8m6-7v8" />
        <path className="meeting-drawing__solid" d="M77 79c2-5 6-7 12-7h65c6 0 11 2 13 7l24 54c3 7-2 12-12 12H64c-10 0-15-5-12-12Z" />
        <path className="meeting-drawing__wash" d="m154 78 14 52c2 6 0 11-4 15h16c9 0 13-5 10-12l-22-51c-2-5-6-7-14-8Z" />
        <path className="meeting-drawing__etch" d="m167 91 6 3m-4 3 7 3m-5 3 8 3m-6 3 9 3m-7 3 10 3m-8 3 10 3m-8 3 10 3m-10 3 10 3" />
        <path className="meeting-drawing__highlight" d="m78 86-17 43c-1 4 2 7 8 7h13" />
        <path d="M79 78v-9m12 6v-9m61 9v-9m12 12v-9" />

        <g className="meeting-drawing__receiver">
          <path className="meeting-drawing__solid" d="M67 51c24-19 83-19 108 0l6 16c1 6-3 10-9 10h-18c-6 0-9-3-10-7l-2-9c-13-5-29-5-42 0l-2 9c-1 4-4 7-10 7H70c-6 0-10-4-9-10Z" />
          <path className="meeting-drawing__wash" d="M63 66c9 6 26 5 35-1v7c-1 3-5 5-10 5H69c-6 0-9-5-6-11Zm82-1c9 6 24 6 34 0 4 7 0 12-7 12h-18c-6 0-9-4-9-12Z" />
          <path className="meeting-drawing__highlight" d="M77 49c23-12 62-12 87 0" />
          <path d="m70 54-4 11c7 5 21 5 28 0l2-8m51 0 2 8c8 5 21 5 27 0l-5-11" />
          <path className="meeting-drawing__etch" d="m77 57-3 8m9-10-2 11m9-12-2 11m65-10 2 11m5-10 2 10m5-8 2 7M103 47h37" />
        </g>

        <ellipse className="meeting-drawing__solid" cx="121" cy="111" rx="35" ry="25" />
        <ellipse className="meeting-drawing__etch" cx="121" cy="111" rx="30" ry="21" />
        <ellipse cx="121" cy="111" rx="15" ry="11" />
        <ellipse className="meeting-drawing__etch" cx="121" cy="111" rx="11" ry="7" />
        <g className="meeting-drawing__dial">
          {[[144, 104], [136, 96], [123, 93], [109, 95], [100, 101], [97, 111], [102, 121], [115, 128], [130, 127], [142, 120]].map(([cx, cy]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="3.7" ry="3" />)}
        </g>
        <path className="meeting-drawing__highlight" d="M112 110h18m-14 3h10" />
        <path className="meeting-drawing__solid" d="m146 127 8-1 2 7-8 1Z" />
        <g className="meeting-drawing__ring">
          <path d="M49 44c-3-6-3-12 0-18m-7 22c-6-10-6-20-1-29m151 25c3-6 3-12 0-18m7 22c6-10 6-20 1-29" />
        </g>
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
