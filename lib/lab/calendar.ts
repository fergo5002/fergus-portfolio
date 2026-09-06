import ICAL from "ical.js";
export type CalendarEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
};
export function parseCalendar(
  text: string,
  start: number,
  end: number,
): CalendarEvent[] {
  if (text.length > 5_000_000 || end - start > 93 * 86400000 || end <= start)
    throw new Error(
      "Use a calendar under 5 MB and a range of at most 93 days.",
    );
  const component = new ICAL.Component(ICAL.parse(text));
  if (component.name !== "vcalendar")
    throw new Error("Use an iCalendar (.ics) export.");
  const definedZones = new Set(["UTC", "GMT", "Z"]);
  component.getAllSubcomponents("vtimezone").forEach((c) => {
    const id = String(c.getFirstPropertyValue("tzid"));
    definedZones.add(id);
    ICAL.TimezoneService.register(
      new ICAL.Timezone({ component: c, tzid: id }),
      id,
    );
  });
  const components = component.getAllSubcomponents("vevent"),
    events: CalendarEvent[] = [];
  for (const item of components) {
    for (const property of item.getAllProperties()) {
      const zone = property.getParameter("tzid");
      if (zone && !definedZones.has(String(zone)))
        throw new Error(
          `Timezone ${zone} has no definition in this file. Export with timezone definitions included.`,
        );
    }
  }
  let iterations = 0;
  for (const c of components) {
    if (c.hasProperty("recurrence-id")) continue;
    if (
      c.getFirstPropertyValue("status") === "CANCELLED" ||
      c.getFirstPropertyValue("transp") === "TRANSPARENT"
    )
      continue;
    const event = new ICAL.Event(c);
    if (!event.startDate || !event.endDate)
      throw new Error("An event is missing its start or end.");
    components
      .filter(
        (x) =>
          x.hasProperty("recurrence-id") &&
          x.getFirstPropertyValue("uid") === event.uid,
      )
      .forEach((x) => event.relateException(new ICAL.Event(x)));
    const append = (s: number, e: number, title: string, id: string) => {
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s)
        throw new Error("An event has an invalid start or end time.");
      if (s < end && e > start) events.push({ id, title, start: s, end: e });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      while ((next = iterator.next())) {
        if (++iterations > 20000)
          throw new Error(
            "Calendar recurrence is too large. Export a smaller date range.",
          );
        if (next.toJSDate().getTime() >= end) break;
        const d = event.getOccurrenceDetails(next);
        if (d.item.component.getFirstPropertyValue("status") === "CANCELLED")
          continue;
        append(
          d.startDate.toJSDate().getTime(),
          d.endDate.toJSDate().getTime(),
          d.item.summary || "Busy",
          `${event.uid}:${next.toString()}`,
        );
      }
    } else
      append(
        event.startDate.toJSDate().getTime(),
        event.endDate.toJSDate().getTime(),
        event.summary || "Busy",
        event.uid || String(events.length),
      );
  }
  return events.sort((a, b) => a.start - b.start);
}
export function freeBlocks(
  events: { start: number; end: number }[],
  start: number,
  end: number,
  bufferMinutes = 0,
) {
  const buffer = bufferMinutes * 60000,
    busy = events
      .map((e) => ({
        start: Math.max(start, e.start - buffer),
        end: Math.min(end, e.end + buffer),
      }))
      .filter((e) => e.end > start && e.start < end)
      .sort((a, b) => a.start - b.start);
  let cursor = start;
  const free: { start: number; end: number }[] = [];
  busy.forEach((e) => {
    if (e.start > cursor) free.push({ start: cursor, end: e.start });
    cursor = Math.max(cursor, e.end);
  });
  if (cursor < end) free.push({ start: cursor, end });
  return free;
}
export function moveEvent(
  events: CalendarEvent[],
  id: string,
  minutes: number,
) {
  return events.map((e) =>
    e.id === id
      ? { ...e, start: e.start + minutes * 60000, end: e.end + minutes * 60000 }
      : e,
  );
}
export function calendarExport(events: CalendarEvent[]) {
  const root = new ICAL.Component(["vcalendar", [], []]);
  root.updatePropertyWithValue("version", "2.0");
  root.updatePropertyWithValue("prodid", "-//FergusOS//Local Lab//EN");
  events.forEach((e, i) => {
    const item = new ICAL.Component("vevent");
    item.updatePropertyWithValue(
      "uid",
      `lab-${i}-${e.start}@fergusoreilly.dev`,
    );
    item.updatePropertyWithValue("summary", e.title);
    item.updatePropertyWithValue(
      "dtstart",
      ICAL.Time.fromJSDate(new Date(e.start), true),
    );
    item.updatePropertyWithValue(
      "dtend",
      ICAL.Time.fromJSDate(new Date(e.end), true),
    );
    root.addSubcomponent(item);
  });
  return root.toString();
}
