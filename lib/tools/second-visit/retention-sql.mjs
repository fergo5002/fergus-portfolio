/**
 * S3 spike: the hearth functions on both engines, and one query that calls
 * them the way analytics.customer_intelligence does.
 */

/** Verbatim from migration 0300, plus the schema. Loaded into Postgres. */
export const POSTGRES_SETUP = `
create schema hearth;

create function hearth.blend_prior(raw numeric, observed_gaps integer)
returns numeric
language sql immutable parallel safe as $$
  select greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                        * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))))
$$;

create function hearth.shrink(observed numeric, n integer, prior numeric)
returns numeric
language sql immutable parallel safe as $$
  select case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end
$$;

create function hearth.expected_gap_days(
  base_days numeric, distance_factor numeric, season_factor numeric, companion_factor numeric
) returns numeric
language sql immutable parallel safe as $$
  select least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)
  ))
$$;

create table bookings (
  customer_id integer not null,
  visit_date date not null,
  amount_cents integer not null,
  party_size integer not null,
  distance_prior numeric not null,
  season_factor numeric not null
);
`;

/**
 * The port. Bodies are the migration's expressions, character for character
 * after the `select`. If DuckDB refuses any of these, that refusal is the
 * spike's finding and the CTE fallback in the decision rule applies.
 */
export const DUCKDB_SETUP = `
create schema if not exists hearth;

create macro hearth.blend_prior(raw, observed_gaps) as
  greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                  * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))));

create macro hearth.shrink(observed, n, prior) as
  case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end;

create macro hearth.expected_gap_days(base_days, distance_factor, season_factor, companion_factor) as
  least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)));
`;

const DIALECTS = {
  postgres: {
    median: (expr, filter) =>
      `percentile_cont(0.5) within group (order by ${expr})${filter ? ` filter (where ${filter})` : ""}`,
    days: (from, to) => `(${to} - ${from})`,
    num: "::numeric",
  },
  duckdb: {
    median: (expr, filter) => `quantile_cont(${expr}, 0.5)${filter ? ` filter (where ${filter})` : ""}`,
    days: (from, to) => `datediff('day', ${from}, ${to})`,
    num: "::double",
  },
};

export const OUTPUT_COLUMNS = [
  "customer_id", "visits", "observed_gaps", "base_gap_days", "distance_factor", "expected_gap_days",
];

export function retentionSql(dialect) {
  const d = DIALECTS[dialect];
  if (!d) throw new Error(`unknown dialect ${dialect}`);
  return `
with visits as (
  select
    customer_id,
    visit_date,
    lag(visit_date) over (partition by customer_id order by visit_date) as prev_date,
    row_number() over (partition by customer_id order by visit_date) as visit_no,
    party_size,
    distance_prior,
    season_factor
  from bookings
),
per_customer as (
  select
    customer_id,
    count(*)::integer as visits,
    count(prev_date)::integer as observed_gaps,
    ${d.median(d.days("prev_date", "visit_date"))} as visit_cadence_days,
    max(case when visit_no = 2 then ${d.days("prev_date", "visit_date")} end) as days_to_second_visit,
    max(party_size) as modal_party_size,
    max(distance_prior) as distance_prior,
    max(season_factor) as season_factor
  from visits
  group by customer_id
),
cohort as (
  select
    coalesce(${d.median("visit_cadence_days", "visits >= 3")}, 30.0) as cadence_days,
    coalesce(${d.median("days_to_second_visit")}, 45.0) as first_repeat_days
  from per_customer
),
modelled as (
  select
    p.customer_id,
    p.visits,
    p.observed_gaps,
    case when p.visits <= 1 then co.first_repeat_days${d.num}
         else hearth.shrink(p.visit_cadence_days${d.num}, p.observed_gaps, co.cadence_days${d.num})
    end as base_gap_days,
    hearth.blend_prior(p.distance_prior${d.num}, p.observed_gaps) as distance_factor,
    p.season_factor${d.num} as season_factor,
    (case when p.modal_party_size >= 2 then 1.25 else 1.00 end)${d.num} as companion_factor
  from per_customer p
  cross join cohort co
)
select
  customer_id,
  visits,
  observed_gaps,
  base_gap_days,
  distance_factor,
  hearth.expected_gap_days(base_gap_days, distance_factor, season_factor, companion_factor) as expected_gap_days
from modelled
order by customer_id
`;
}
