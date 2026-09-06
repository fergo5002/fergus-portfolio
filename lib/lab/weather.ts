import { bounded } from "./random";
export type WeatherHour = {
  at: number;
  rain: number;
  wind: number;
  temperature: number;
  daylight: boolean;
};
export type WeatherPrefs = {
  hours: number;
  maxRain: number;
  maxWind: number;
  minTemperature: number;
  daylight: boolean;
  after: number;
};
export function findWindows(rows: WeatherHour[], p: WeatherPrefs) {
  bounded(p.hours, 1, 12);
  bounded(p.maxRain, 0, 100, "Rain limit");
  bounded(p.maxWind, 0, 250, "Wind limit");
  bounded(p.minTemperature, -50, 60, "Minimum temperature");
  if (!Number.isInteger(p.hours)) throw new Error("Choose whole hours.");
  return rows.flatMap((row, i) => {
    const slice = rows.slice(i, i + p.hours);
    if (
      row.at < p.after ||
      slice.length !== p.hours ||
      slice.some(
        (r, j) =>
          r.at !== row.at + j * 3600000 ||
          r.rain > p.maxRain ||
          r.wind > p.maxWind ||
          r.temperature < p.minTemperature ||
          (p.daylight && !r.daylight),
      )
    )
      return [];
    return [
      {
        start: row.at,
        end: row.at + p.hours * 3600000,
        rain: slice.reduce((n, r) => n + r.rain, 0),
        wind: Math.max(...slice.map((r) => r.wind)),
        temperature: Math.min(...slice.map((r) => r.temperature)),
      },
    ];
  });
}
export function parseForecast(raw: unknown): WeatherHour[] {
  const h = (raw as { hourly?: Record<string, unknown[]> })?.hourly;
  const keys = [
    "time",
    "precipitation",
    "wind_speed_10m",
    "temperature_2m",
    "is_day",
  ];
  if (
    !h ||
    keys.some((k) => !Array.isArray(h[k])) ||
    !h.time.length ||
    keys.some((k) => h[k].length !== h.time.length)
  )
    throw new Error("The forecast is incomplete. Try again later.");
  return h.time.map((t, i) => {
    const values = keys.map((k) => h[k][i]);
    if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      throw new Error("The forecast contains missing measurements.");
    return {
      at: Number(t) * 1000,
      rain: Number(h.precipitation[i]),
      wind: Number(h.wind_speed_10m[i]),
      temperature: Number(h.temperature_2m[i]),
      daylight: h.is_day[i] === 1,
    };
  });
}
