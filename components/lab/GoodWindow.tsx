"use client";
import { useState } from "react";
import { copy, common } from "@/content/lab/copy";
import {
  findWindows,
  parseForecast,
  type WeatherHour,
} from "@/lib/lab/weather";
import { calendarExport } from "@/lib/lab/calendar";
import {
  Button,
  Field,
  NumberField,
  ErrorMessage,
  useAction,
  download,
  fmt,
  LineChart,
} from "./shared";
const c = copy.weather,
  places = [
    [53.3498, -6.2603],
    [53.2028, -6.0983],
    [53.2707, -9.0568],
    [51.8985, -8.4756],
  ];
function sample(): WeatherHour[] {
  const start = Math.ceil(Date.now() / 3600000) * 3600000;
  return Array.from({ length: 72 }, (_, i) => ({
    at: start + i * 3600000,
    rain: i % 15 < 4 ? 1.6 : 0,
    wind: 8 + Math.round(Math.sin(i / 5) * 7 + 7),
    temperature: 11 + Math.round(Math.sin(i / 7) * 5),
    daylight:
      new Date(start + i * 3600000).getHours() >= 7 &&
      new Date(start + i * 3600000).getHours() < 20,
  }));
}
const when = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    timeZone: "Europe/Dublin",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function GoodWindow() {
  const [rows, setRows] = useState<WeatherHour[]>([]),
    [source, setSource] = useState("sample"),
    [place, setPlace] = useState(0),
    [fetched, setFetched] = useState(""),
    [prefs, setPrefs] = useState({
      hours: 2,
      maxRain: 0.5,
      maxWind: 25,
      minTemperature: 10,
      daylight: true,
    }),
    { act, error, busy, setError } = useAction();
  let windows: ReturnType<typeof findWindows> = [];
  let validation = "";
  try {
    windows = findWindows(rows, { ...prefs, after: Date.now() });
  } catch (e) {
    validation = e instanceof Error ? e.message : String(e);
  }
  async function live() {
    await act(async () => {
      const [lat, lon] = places[place],
        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,is_day&timeformat=unixtime&timezone=Europe%2FDublin&forecast_days=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok)
        throw new Error(
          `Forecast service returned ${res.status}. Try the example or fetch again later.`,
        );
      setRows(parseForecast(await res.json()));
      setSource("live");
      setFetched(new Date().toLocaleTimeString("en-GB"));
    });
  }
  return (
    <div className="lab-work">
      <div className="lab-fields">
        <Field label={c.place}>
          <select
            value={place}
            onChange={(e) => {
              setPlace(Number(e.target.value));
              setRows([]);
            }}
          >
            {c.places.map((p, i) => (
              <option value={i} key={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={c.duration}
          value={prefs.hours}
          min={1}
          max={12}
          onChange={(hours) => setPrefs({ ...prefs, hours })}
        />
        <NumberField
          label={c.rain}
          value={prefs.maxRain}
          min={0}
          step={0.1}
          onChange={(maxRain) => setPrefs({ ...prefs, maxRain })}
        />
        <NumberField
          label={c.wind}
          value={prefs.maxWind}
          min={0}
          onChange={(maxWind) => setPrefs({ ...prefs, maxWind })}
        />
        <NumberField
          label={c.temperature}
          value={prefs.minTemperature}
          onChange={(minTemperature) => setPrefs({ ...prefs, minTemperature })}
        />
        <label className="lab-check">
          <input
            type="checkbox"
            checked={prefs.daylight}
            onChange={(e) => setPrefs({ ...prefs, daylight: e.target.checked })}
          />
          {c.daylight}
        </label>
      </div>
      <div className="lab-actions">
        <Button
          primary
          disabled={busy}
          onClick={() => {
            setError("");
            setRows(sample());
            setSource("sample");
          }}
        >
          {common.example}
        </Button>
        <Button disabled={busy} onClick={live}>
          {busy ? c.fetching : c.fetch}
        </Button>
      </div>
      <ErrorMessage error={error || validation} />
      {rows.length > 0 && (
        <>
          <p className="lab-note">
            <span className="lab-tag">
              {source === "sample" ? common.sample : common.live}
            </span>{" "}
            {source === "sample" ? c.sampleNote : `${c.liveNote} ${fetched}`}
          </p>
          <LineChart
            title={`${c.timeline} · mm / hour`}
            values={rows.map((r) => r.rain)}
          />
          <h2>
            {c.title} · {windows.length}
          </h2>
          {!windows.length && <p>{c.none}</p>}
          <ul className="lab-list">
            {windows.slice(0, 12).map((w) => (
              <li key={w.start}>
                <div className="lab-row">
                  <div>
                    <strong>
                      {when(w.start)} → {when(w.end)}
                    </strong>
                    <p className="lab-note">
                      {fmt(w.rain)} mm · {w.wind} km/h · {w.temperature} °C
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      download(
                        "good-window.ics",
                        calendarExport([
                          {
                            id: "window",
                            title: `${source === "sample" ? "EXAMPLE · " : ""}${c.event} · ${c.places[place]}`,
                            start: w.start,
                            end: w.end,
                          },
                        ]),
                        "text/calendar",
                      )
                    }
                  >
                    {c.calendar}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="lab-note">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {c.source}
        </a>{" "}
        ·{" "}
        <a
          href="https://open-meteo.com/en/terms"
          target="_blank"
          rel="noreferrer"
        >
          {c.terms}
        </a>
      </p>
    </div>
  );
}
