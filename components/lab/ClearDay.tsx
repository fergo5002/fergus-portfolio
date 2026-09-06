"use client";
import { useState } from "react";
import { copy } from "@/content/lab/copy";
import {
  parseCalendar,
  freeBlocks,
  moveEvent,
  calendarExport,
  type CalendarEvent,
} from "@/lib/lab/calendar";
import {
  Button,
  Field,
  FileInput,
  NumberField,
  ErrorMessage,
  useAction,
  readText,
  Metrics,
  download,
  fmt,
  dateTime,
} from "./shared";
const c = copy.calendar;
function weekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dayAt(week: string, day: number, hour: number) {
  const date = new Date(week + "T00:00:00");
  date.setDate(date.getDate() + day);
  date.setHours(hour);
  return date.getTime();
}
function example(week: string): CalendarEvent[] {
  return [0, 1, 2, 3, 4].flatMap((day) =>
    [10, 14].map((hour, j) => ({
      id: `sample-${day}-${j}`,
      title: c.titles[(day + j) % c.titles.length],
      start: dayAt(week, day, hour) + (j && day % 2 ? 1800000 : 0),
      end: dayAt(week, day, hour + 1),
    })),
  );
}
export default function ClearDay() {
  const [week, setWeek] = useState(weekStart),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [original, setOriginal] = useState<CalendarEvent[]>([]),
    [source, setSource] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [buffer, setBuffer] = useState(10),
    [minimum, setMinimum] = useState(60),
    [selected, setSelected] = useState(""),
    [shift, setShift] = useState(60),
    { act, error, setError } = useAction();
  const days = Array.from({ length: loaded ? 5 : 0 }, (_, day) => {
      const start = dayAt(week, day, 9),
        end = dayAt(week, day, 17);
      return {
        start,
        end,
        busy: events.filter((e) => e.start < end && e.end > start),
        free: freeBlocks(events, start, end, Math.max(0, buffer || 0)).filter(
          (b) => b.end - b.start >= Math.max(1, minimum || 1) * 60000,
        ),
      };
    }),
    focus = days.flatMap((d) => d.free),
    busyHours = days.reduce(
      (sum, d) =>
        sum +
        (d.end -
          d.start -
          freeBlocks(events, d.start, d.end).reduce(
            (n, f) => n + f.end - f.start,
            0,
          )) /
          3600000,
      0,
    );
  function applyEvents(next: CalendarEvent[]) {
    setLoaded(true);
    setEvents(next);
    setOriginal(next);
    setSelected(next[0]?.id ?? "");
  }
  function exampleLoad() {
    applyEvents(example(week));
    setSource(null);
  }
  return (
    <div className="lab-work">
      <div className="lab-fields">
        <Field label={c.week}>
          <input
            type="date"
            value={week}
            onChange={(e) =>
              act(() => {
                const next = e.target.value;
                if (!next) return;
                const d = new Date(next + "T00:00:00");
                if (d.getDay() !== 1)
                  throw new Error(
                    "Choose a Monday for the start of the review week.",
                  );
                setWeek(next);
                applyEvents(
                  source
                    ? parseCalendar(
                        source,
                        dayAt(next, 0, 0),
                        dayAt(next, 7, 0),
                      )
                    : example(next),
                );
              })
            }
          />
        </Field>
        <NumberField
          label={c.buffer}
          value={buffer}
          min={0}
          max={120}
          onChange={setBuffer}
        />
        <NumberField
          label={c.block}
          value={minimum}
          min={15}
          max={480}
          onChange={setMinimum}
        />
      </div>
      <FileInput
        label={c.upload}
        accept=".ics"
        onFile={(file) =>
          act(async () => {
            const text = await readText(file),
              parsed = parseCalendar(
                text,
                dayAt(week, 0, 0),
                dayAt(week, 7, 0),
              );
            setSource(text);
            applyEvents(parsed);
          })
        }
      />
      <div className="lab-actions">
        <Button primary onClick={() => act(exampleLoad)}>
          {c.example}
        </Button>
        <Button disabled={!original.length} onClick={() => setEvents(original)}>
          {c.original}
        </Button>
      </div>
      <ErrorMessage error={error} />
      <p className="lab-note">{c.note}</p>
      {(!loaded || source === null) && (
        <p className="lab-note">{loaded ? c.sample : c.noInput}</p>
      )}
      <Metrics
        items={[
          [c.metrics[0], fmt(busyHours)],
          [
            c.metrics[1],
            fmt(focus.reduce((n, f) => n + (f.end - f.start) / 3600000, 0)),
          ],
          [c.metrics[2], focus.length],
        ]}
      />
      <h2>{c.calendar}</h2>
      <div className="lab-calendar-scroll">
        <div className="lab-week">
          {days.map((day) => (
            <div className="lab-day" key={day.start}>
              <strong>
                {new Date(day.start).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                })}
              </strong>
              {day.free.map((f, i) => (
                <div
                  className="lab-block lab-block--free"
                  key={`f${i}`}
                  style={{
                    top: `${((f.start - day.start) / (day.end - day.start)) * 100}%`,
                    height: `${((f.end - f.start) / (day.end - day.start)) * 100}%`,
                  }}
                  title={`${c.free}: ${dateTime(f.start)} – ${dateTime(f.end)}`}
                >
                  {c.free}
                  <br />
                  {fmt((f.end - f.start) / 60000, 0)} min
                </div>
              ))}
              {day.busy.map((e, i) => (
                <div
                  className="lab-block"
                  key={e.id}
                  style={{
                    left: 4 + (i % 3) * 3,
                    top: `${((Math.max(e.start, day.start) - day.start) / (day.end - day.start)) * 100}%`,
                    height: `${((Math.min(e.end, day.end) - Math.max(e.start, day.start)) / (day.end - day.start)) * 100}%`,
                  }}
                  title={`${e.title}: ${dateTime(e.start)} – ${dateTime(e.end)}`}
                >
                  {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {events.length > 0 && (
        <section className="lab-panel">
          <h3>{c.move}</h3>
          <div className="lab-fields">
            <Field label={c.event}>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {dateTime(e.start)}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField
              label={c.shift}
              value={shift}
              min={-1440}
              max={1440}
              onChange={setShift}
            />
          </div>
          <div className="lab-actions">
            <Button
              onClick={() =>
                act(() => {
                  if (!Number.isFinite(shift) || Math.abs(shift) > 1440)
                    throw new Error(
                      "Use a shift between −1,440 and 1,440 minutes.",
                    );
                  setEvents(moveEvent(events, selected, shift));
                })
              }
            >
              {c.apply}
            </Button>
          </div>
        </section>
      )}
      <details>
        <summary>
          {c.free} · {focus.length}
        </summary>
        <ul>
          {focus.map((f) => (
            <li key={f.start}>
              {dateTime(f.start)} → {dateTime(f.end)} ·{" "}
              {fmt((f.end - f.start) / 60000, 0)} min
            </li>
          ))}
        </ul>
      </details>
      <div className="lab-actions">
        <Button
          disabled={!events.length}
          onClick={() =>
            download(
              "clear-day-proposed.ics",
              calendarExport(events),
              "text/calendar",
            )
          }
        >
          {c.export}
        </Button>
        <Button
          disabled={!focus.length}
          onClick={() =>
            download(
              "clear-day-focus.ics",
              calendarExport(
                focus.map((f, i) => ({
                  ...f,
                  id: `focus-${i}`,
                  title: c.free,
                })),
              ),
              "text/calendar",
            )
          }
        >
          {c.focusExport}
        </Button>
      </div>
    </div>
  );
}
