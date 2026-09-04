export type StatusRole = "completed" | "no_show" | "cancelled" | "other";
export type Band = "local" | "catchment" | "regional" | "distant" | "visitor" | "unknown";
export type Lifecycle =
  | "prospect"
  | "visiting"
  | "loyal"
  | "first_time"
  | "repeat"
  | "committed_idle"
  | "squeezed"
  | "dormant"
  | "lapsed"
  | "at_risk";
export type DateStyle = "iso" | "dmy" | "mdy";

export type ColumnRoles = {
  customer: number;
  date: number;
  amount: number | null;
  slotStart: number | null;
  capacity: number | null;
  status: number | null;
  town: number | null;
  country: number | null;
  product: number | null;
  party: number | null;
  credits: number | null;
  consent: number | null;
  email: number | null;
  phone: number | null;
};

/** Dates are whole epoch days so database date subtraction stays integral. */
export type Booking = {
  customerId: string;
  day: number;
  hour: number | null;
  capacity: number | null;
  status: StatusRole;
  amountCents: number | null;
  town: string | null;
  country: string | null;
  product: string | null;
  party: number;
  creditsRemaining: number;
  consent: boolean | null;
  hasEmail: boolean;
  hasPhone: boolean;
};

/** Every numeric literal migration 0300 gives the model. */
export type ModelParams = {
  shrinkK: number;
  blendK: number;
  localKm: number;
  catchmentKm: number;
  regionalKm: number;
  priorLocal: number;
  priorCatchment: number;
  priorRegional: number;
  priorDistant: number;
  priorVisitor: number;
  priorUnknown: number;
  seasonFloor: number;
  seasonCap: number;
  gapFloorDays: number;
  gapCapDays: number;
  gapDefaultBaseDays: number;
  companionFactor: number;
  companionPartyThreshold: number;
  loyalVisits: number;
  overdueRatio: number;
  lapsedRatio: number;
  squeezeMinVisits: number;
  squeezeMinSlots: number;
  squeezeFullRatio: number;
  dormantMonthIndex: number;
  dormantMinVisits: number;
  dormantTroughRatio: number;
  farDistantVisits: number;
  farVisitorVisits: number;
  pReturnBase: number;
  pReturnCap: number;
  pReturnExperienceBase: number;
  pReturnExperienceStep: number;
  pReturnExperienceCap: number;
  smoothStrength: number;
  cohortDefaultCadenceDays: number;
  cohortDefaultFirstRepeatDays: number;
};

export class ReadError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = "ReadError";
    this.kind = kind;
  }
}
