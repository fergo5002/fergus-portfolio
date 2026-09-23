"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { meetingAction } from "@/app/contact/meeting-action";
import { meetingCopy as copy } from "@/content/meeting";
import { contactCopy } from "@/content/contact";
import { CONTACT_LIMITS, ELAPSED_FIELD, HONEYPOT_FIELD, publishedEmail } from "@/lib/contact";
import { INITIAL_MEETING_STATE, meetingDays, meetingSlots, meetingSummary, validMeetingSlot, type MeetingKind } from "@/lib/meeting";
import "./meeting.css";

const dayLabel = (day: string) => new Date(`${day}T12:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const monthLabel = (month: string) => new Date(`${month}-01T12:00Z`).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });

function monthDays(month: string) {
  const first = new Date(`${month}-01T12:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - mondayOffset * 86_400_000;
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12));
  const length = Math.ceil((last.getUTCDate() + mondayOffset) / 7) * 7;
  return Array.from({ length }, (_, i) => new Date(start + i * 86_400_000))
    .filter((date) => ![0, 6].includes(date.getUTCDay()))
    .map((date) => date.toISOString().slice(0, 10));
}

export default function MeetingCalendar({ kind, now: nowISO }: { kind: MeetingKind; now: string }) {
  const now = new Date(nowISO);
  const days = meetingDays(now);
  const months = [...new Set(days.map((day) => day.slice(0, 7)))];
  const [month, setMonth] = useState(months[0]);
  const [day, setDay] = useState(days[0]);
  const [slot, setSlot] = useState("");
  const [ready, setReady] = useState(false);
  const [state, action, pending] = useActionState(meetingAction, INITIAL_MEETING_STATE);
  const elapsed = useRef<HTMLInputElement>(null);
  const started = useRef(0);
  const result = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    // A person may have already chosen before the JavaScript arrived.
    const chosen = fallback.current?.value;
    if (chosen && validMeetingSlot(chosen, now)) {
      setSlot(chosen);
      const chosenDay = chosen.slice(0, 10);
      setDay(chosenDay); setMonth(chosenDay.slice(0, 7));
    }
    setReady(true); started.current = performance.now();
  }, []);
  useEffect(() => { if (state.seq > 0) result.current?.focus(); }, [state.seq]);
  const fields = state.fields;
  const moveMonth = (offset: number) => {
    const next = months[months.indexOf(month) + offset];
    if (!next) return;
    setMonth(next); setDay(days.find((value) => value.startsWith(next))!); setSlot("");
  };
  if (state.status === "sent") return <div className="meeting-success" ref={result} tabIndex={-1} role="status">
    <svg viewBox="0 0 80 80" aria-hidden="true"><rect x="6" y="6" width="68" height="68" rx="4" /><path d="m23 40 12 12 24-26" /></svg>
    <h2>{copy.sent}</h2>
    {state.summary && <p>{state.summary}</p>}
    <p>{copy.sentBody}</p>
    <Link href="/contact" className="prose__link">{copy.back}</Link>
  </div>;

  return <form action={action} className="meeting" onSubmit={() => {
    if (elapsed.current) elapsed.current.value = String(Math.round(performance.now() - started.current));
  }}>
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name={ELAPSED_FIELD} ref={elapsed} defaultValue="" />
    <div className="cform__hp" aria-hidden="true"><label htmlFor="meeting-hp">{contactCopy.honeypotLabel}</label><input id="meeting-hp" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" /></div>
    <p className="meeting__zone">{copy.duration}<span />{copy.timezone}</p>
    {ready ? <div className="meeting__picker">
      <section className="meeting__month" aria-labelledby="meeting-month">
        <div className="meeting__month-head">
          <h2 id="meeting-month" aria-live="polite">{monthLabel(month)}</h2>
          <div><button type="button" aria-label={copy.previous} disabled={month === months[0]} onClick={() => moveMonth(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button><button type="button" aria-label={copy.next} disabled={month === months.at(-1)} onClick={() => moveMonth(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg></button></div>
        </div>
        <div className="meeting__weekdays" aria-hidden="true">{copy.weekdays.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="meeting__days" role="group" aria-label={copy.day}>
          {monthDays(month).map((value) => {
            const offered = value.startsWith(month) && days.includes(value);
            return <button key={value} type="button" disabled={!offered} aria-pressed={day === value} aria-label={dayLabel(value)} onClick={() => { setDay(value); setSlot(""); }} className={value.startsWith(month) ? "" : "is-outside"}>
              {Number(value.slice(-2))}<span className="meeting__day-dot" />
            </button>;
          })}
        </div>
      </section>
      <section className="meeting__times" aria-labelledby="meeting-time-heading">
        <h2 id="meeting-time-heading">{dayLabel(day)}</h2>
        <div className="meeting__slots" role="group" aria-label={copy.time}>
          {meetingSlots(day, now).map((time) => <button key={time.id} type="button" disabled={!time.available} aria-pressed={slot === time.id} aria-label={`${time.label}${time.available ? "" : `, ${copy.unavailable}`}`} onClick={() => setSlot(time.id)}>{time.label}</button>)}
        </div>
        <div className="meeting__legend"><span>{copy.available}</span><span>{copy.unavailable}</span></div>
      </section>
      <input type="hidden" name="slot" value={slot} />
    </div> : <label className="meeting__fallback">{copy.noScript}<select ref={fallback} name="slot" required defaultValue={fields?.slot || ""}><option value="" disabled>{copy.selectTime}</option>{days.flatMap((value) => meetingSlots(value, now).filter((time) => time.available).map((time) => <option key={time.id} value={time.id}>{dayLabel(value)} · {time.label}</option>))}</select></label>}

    <div className="meeting__summary" aria-live="polite">{slot ? meetingSummary(kind, slot) : copy.selectTime}</div>
    <div ref={result} tabIndex={-1} className="meeting__result" role="status">
      {state.status === "invalid" && <p>{Object.values(state.errors ?? {}).filter(Boolean).join(" ")}</p>}
      {state.status === "failed" && <><p>{copy.failed}</p><p><a href={state.mailto}>{copy.fallback}</a><span> {publishedEmail()}</span></p></>}
    </div>
    <div className="meeting__details">
      <label htmlFor="meeting-name">{copy.name}<input key={`name-${state.seq}`} id="meeting-name" name="name" autoComplete="name" required maxLength={CONTACT_LIMITS.name} defaultValue={fields?.name} aria-invalid={Boolean(state.errors?.name)} /></label>
      <label htmlFor="meeting-email">{copy.email}<input key={`email-${state.seq}`} id="meeting-email" name="email" type="email" autoComplete="email" required maxLength={CONTACT_LIMITS.email} defaultValue={fields?.email} aria-invalid={Boolean(state.errors?.email)} /></label>
      <label className="meeting__note" htmlFor="meeting-note">{copy.note}<textarea key={`note-${state.seq}`} id="meeting-note" name="note" rows={2} maxLength={2000} placeholder={copy.optional} defaultValue={fields?.note} aria-invalid={Boolean(state.errors?.note)} /></label>
    </div>
    <div className="meeting__submit"><button className="cform__submit" type="submit" disabled={pending || (ready && !slot)}>{pending ? copy.sending : copy.submit}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button><Link href="/contact">{copy.message}</Link></div>
  </form>;
}
