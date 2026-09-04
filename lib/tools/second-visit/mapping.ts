import type { Sheet } from "./csv";
import { detectDateStyle, parseDay, roundTo } from "./numbers";
import { ReadError, type Booking, type ColumnRoles, type DateStyle, type StatusRole } from "./types";

/**
 * Which column is which, guessed and then shown to the visitor to correct.
 *
 * The guess is header-driven with one content fallback, for the date, because
 * a column of dates is the only role a machine can recognise without being
 * told. Everything else is a vocabulary of the words booking systems actually
 * use, and a wrong guess costs one click.
 *
 * Only `customer` and `date` are required. Every other role switches something
 * on and its absence switches that thing off, visibly, on the page: no town
 * means no distance bands, no slot means no squeeze and no slot grid, no
 * product means no reorder radar, no credits means the `committed_idle` verdict
 * can never fire. The page says each of those in a sentence rather than showing
 * an empty panel.
 */

const HEADER_WORDS: Record<keyof ColumnRoles, RegExp[]> = {
  customer: [/^customer.?(id|ref|number|code)$/i, /^client.?(id|ref)?$/i, /^customer$/i, /^guest$/i, /^member$/i, /^user.?id$/i, /^contact$/i],
  date: [/date/i, /^when$/i, /^day$/i, /^booked.?(on|at)$/i, /^start/i, /^created/i, /^placed/i],
  amount: [/^(total|amount|price|revenue|paid|net|gross|value)/i, /total.?(price|amount|paid)/i, /^subtotal$/i],
  slotStart: [/^(slot|session|class|start).?(time|at|start)?$/i, /^time$/i, /start.?time/i],
  capacity: [/capacity/i, /^seats?$/i, /^places$/i, /max.?(seats|guests|capacity)/i],
  status: [/status/i, /^state$/i, /^outcome$/i, /^attendance$/i],
  town: [/^(town|city|locality)$/i, /^address.?(city|town)$/i, /^billing.?city$/i, /^shipping.?city$/i],
  country: [/^country/i, /country.?code/i],
  product: [/^(product|service|item|treatment|class|session).?(name|type)?$/i, /^sku$/i, /^package$/i],
  party: [/party/i, /^(guests|people|pax|seats.?booked|quantity|qty)$/i, /group.?size/i],
  credits: [/credit/i, /^(pack|passes|sessions).?(remaining|left|balance)$/i, /membership/i],
  consent: [/consent/i, /marketing/i, /^opt.?in$/i, /subscribed/i, /newsletter/i],
  email: [/e.?mail/i],
  phone: [/^(phone|mobile|tel|telephone|msisdn)/i],
};

/** No column chosen for anything. `-1` for the two required roles, null elsewhere. */
export function emptyRoles(): ColumnRoles {
  return {
    customer: -1,
    date: -1,
    amount: null,
    slotStart: null,
    capacity: null,
    status: null,
    town: null,
    country: null,
    product: null,
    party: null,
    credits: null,
    consent: null,
    email: null,
    phone: null,
  };
}

function matchHeader(header: readonly string[], patterns: RegExp[], taken: Set<number>): number | null {
  for (const pattern of patterns) {
    for (let i = 0; i < header.length; i++) {
      if (taken.has(i)) continue;
      if (pattern.test(header[i].trim())) return i;
    }
  }
  return null;
}

/** The share of the sampled values in a column that read as a date. */
function dateDensity(sheet: Sheet, column: number): number {
  const sample = sheet.rows.slice(0, 200).map((row) => row[column] ?? "");
  const { style } = detectDateStyle(sample);
  const nonEmpty = sample.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return 0;
  const parsed = nonEmpty.filter((v) => parseDay(v, style) !== null).length;
  return parsed / nonEmpty.length;
}

export function guessRoles(sheet: Sheet): ColumnRoles {
  const roles = emptyRoles();
  const taken = new Set<number>();

  // Identity first, and an email beats a name: two people called John Smith are
  // one customer to anything that keys on a name, and that silently halves a
  // real retention figure.
  const email = matchHeader(sheet.header, HEADER_WORDS.email, taken);
  if (email !== null) roles.email = email;
  const phone = matchHeader(sheet.header, HEADER_WORDS.phone, taken);
  if (phone !== null) roles.phone = phone;

  const explicitId = matchHeader(sheet.header, HEADER_WORDS.customer, taken);
  roles.customer = explicitId ?? roles.email ?? -1;
  if (roles.customer >= 0) taken.add(roles.customer);

  const dateByHeader = matchHeader(sheet.header, HEADER_WORDS.date, taken);
  if (dateByHeader !== null && dateDensity(sheet, dateByHeader) >= 0.6) {
    roles.date = dateByHeader;
  } else {
    // The one content fallback. A column of dates is the only role that
    // announces itself without a helpful header.
    let best = -1;
    let bestDensity = 0.6;
    for (let i = 0; i < sheet.header.length; i++) {
      if (taken.has(i)) continue;
      const density = dateDensity(sheet, i);
      if (density > bestDensity) {
        best = i;
        bestDensity = density;
      }
    }
    roles.date = best;
  }
  if (roles.date >= 0) taken.add(roles.date);

  for (const role of ["amount", "slotStart", "capacity", "status", "town", "country", "product", "party", "credits", "consent"] as const) {
    const found = matchHeader(sheet.header, HEADER_WORDS[role], taken);
    if (found !== null) {
      roles[role] = found;
      taken.add(found);
    }
  }
  return roles;
}

export function validateRoles(roles: ColumnRoles, sheet: Sheet): ReadError | null {
  const inRange = (i: number) => i >= 0 && i < sheet.header.length;
  if (!inRange(roles.customer)) return new ReadError("no-customer", "no customer column chosen");
  if (!inRange(roles.date)) return new ReadError("no-date", "no date column chosen");
  return null;
}

const CURRENCY = /[^0-9,.\-()]/g;

/**
 * Money, in whole cents, or null when the cell says nothing.
 *
 * Null rather than zero, because zero is a claim that the booking was free and
 * that claim would drag every average order value in the report.
 *
 * The decimal separator is decided per value. A comma followed by exactly two
 * digits with no full stop after it is a decimal comma; anything else is a
 * thousands separator. That is decidable, unlike the date question, because a
 * thousands group is always three digits.
 */
export function parseAmountCents(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const negative = /^\(.*\)$/.test(text) || text.trim().startsWith("-");
  let cleaned = text.replace(CURRENCY, "");
  cleaned = cleaned.replace(/[()\-]/g, "");
  if (cleaned === "") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot && /,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // roundTo rather than Math.round(value * 100): 35.35 * 100 is
  // 3534.9999999999995 and truncating that loses a cent on every third row.
  const cents = roundTo(value * 100, 0);
  return negative ? -cents : cents;
}

const COMPLETED = /^(completed?|attended|checked.?in|finished|fulfill?ed|paid|done|success(ful)?)$/i;
const NO_SHOW = /^(no.?show|did.?not.?attend|dna|missed)$/i;
// `void(ed)?` and not `voided?`: the second one needs the "e" and so misses the
// bare word "void", which is what a payment system actually writes.
const CANCELLED = /^(cancell?ed|refunded|void(ed)?|declined|failed|abandoned)$/i;

export function statusRole(raw: string): StatusRole {
  const text = raw.trim().replace(/[_\s]+/g, " ");
  if (COMPLETED.test(text)) return "completed";
  if (NO_SHOW.test(text)) return "no_show";
  if (CANCELLED.test(text)) return "cancelled";
  return "other";
}

const HOUR_COLON = /(\d{1,2}):(\d{2})/;
const HOUR_AMPM = /^(\d{1,2})\s*(am|pm)$/i;

/** The hour of the day a slot starts, from a time, a timestamp or "7pm". */
function parseHour(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const ampm = HOUR_AMPM.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[2])) hour += 12;
    return hour;
  }
  const colon = HOUR_COLON.exec(text);
  if (colon) {
    const hour = Number(colon[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  const bare = Number(text);
  if (Number.isInteger(bare) && bare >= 0 && bare <= 23) return bare;
  return null;
}

function parseCount(raw: string, fallback: number): number {
  const value = Number(raw.trim().replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

const TRUE_WORDS = /^(true|yes|y|1|active|subscribed|opted.?in|member)$/i;
const FALSE_WORDS = /^(false|no|n|0|inactive|unsubscribed|opted.?out|none)$/i;

function parseBoolish(raw: string): boolean | null {
  const text = raw.trim();
  if (text === "") return null;
  if (TRUE_WORDS.test(text)) return true;
  if (FALSE_WORDS.test(text)) return false;
  return null;
}

export type ReadSummary = {
  bookings: Booking[];
  used: number;
  ignored: number;
  dateStyle: DateStyle;
  ambiguousDates: boolean;
  reasons: { badDate: number; noCustomer: number };
};

export function toBookings(sheet: Sheet, roles: ColumnRoles): ReadSummary {
  const cell = (row: string[], index: number | null): string =>
    index === null || index < 0 ? "" : (row[index] ?? "");

  const sample = sheet.rows.slice(0, 200).map((row) => cell(row, roles.date));
  const { style, ambiguous } = detectDateStyle(sample);

  const bookings: Booking[] = [];
  let badDate = 0;
  let noCustomer = 0;

  for (const row of sheet.rows) {
    const customerId = cell(row, roles.customer).trim();
    if (customerId === "") {
      noCustomer++;
      continue;
    }
    const day = parseDay(cell(row, roles.date), style);
    if (day === null) {
      badDate++;
      continue;
    }
    const capacityText = cell(row, roles.capacity).trim();
    const partyText = cell(row, roles.party).trim();
    const creditsRaw = cell(row, roles.credits).trim();
    const creditsBool = parseBoolish(creditsRaw);
    bookings.push({
      customerId,
      day,
      hour: roles.slotStart === null ? null : parseHour(cell(row, roles.slotStart)),
      capacity: capacityText === "" ? null : parseCount(capacityText, 0) || null,
      status: roles.status === null ? "completed" : statusRole(cell(row, roles.status)),
      amountCents: roles.amount === null ? null : parseAmountCents(cell(row, roles.amount)),
      town: roles.town === null ? null : cell(row, roles.town).trim() || null,
      country: roles.country === null ? null : cell(row, roles.country).trim() || null,
      product: roles.product === null ? null : cell(row, roles.product).trim() || null,
      party: partyText === "" ? 1 : Math.max(1, parseCount(partyText, 1)),
      creditsRemaining: creditsBool === true ? 1 : creditsBool === false ? 0 : parseCount(creditsRaw, 0),
      consent: roles.consent === null ? null : parseBoolish(cell(row, roles.consent)),
      hasEmail: cell(row, roles.email).trim() !== "",
      hasPhone: cell(row, roles.phone).trim() !== "",
    });
  }

  return {
    bookings,
    used: bookings.length,
    ignored: badDate + noCustomer,
    dateStyle: style,
    ambiguousDates: ambiguous,
    reasons: { badDate, noCustomer },
  };
}

