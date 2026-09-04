--
-- The whole model over the committed fixture, in the dialect that runs in
-- production. Loaded by scripts/second-visit/compare.mjs after
-- 0300-functions.sql, against the tables that script creates.
--
-- **Written from migration 0300's own CTEs and from 0070's customer_metrics,
-- never from lib/tools/second-visit/analyse.ts.** Two independent expressions
-- of one model is the entire value of this file. Transcribe it from the
-- TypeScript and the oracle proves only that a function agrees with itself.
--
-- What it cannot catch, stated so nobody claims otherwise: a misreading of the
-- migration shared by both sides. The unit tests in model.test.ts are the other
-- half of that, because they pin the literals against the SQL text by hand.

with settings as (select as_of, venue_town from fx.settings),
venue as (
  select t.lat, t.lng, t.country
  from fx.towns t, settings s
  where lower(t.name) = lower(s.venue_town)
),
attended as (
  select * from fx.bookings where status in ('completed', 'no_show')
),
season_monthly as (
  select extract(month from local_date)::int as month_of_year, count(*)::numeric as visits
  from attended group by 1
),
season_totals as (
  select sum(visits) as total, count(*)::int as months_seen from season_monthly
),
season as (
  select m.month_of_year,
         case when t.total = 0 or t.months_seen = 0 then 1.0
              else round(m.visits / (t.total / t.months_seen), 3) end as month_index,
         t.months_seen
  from season_monthly m cross join season_totals t
),
-- customer_metrics, the four inputs 0300 consumes and does not define (0070).
v as (
  select customer_id, count(*)::int as visits,
         min(local_date) as first_on, max(local_date) as last_on
  from attended group by customer_id
),
g as (
  select customer_id,
         percentile_cont(0.5) within group (order by gap_days)::numeric(6,1) as median_gap_days
  from (
    select customer_id,
           local_date - lag(local_date) over (partition by customer_id order by local_date) as gap_days
    from fx.bookings where status = 'completed'
  ) x
  where gap_days is not null and gap_days > 0
  group by customer_id
),
sv as (
  select a.customer_id,
         (select min(b.local_date) from attended b
           where b.customer_id = a.customer_id and b.local_date > min(a.local_date))
         - min(a.local_date) as days_to_second_visit
  from attended a group by a.customer_id
),
sp as (
  select customer_id,
         count(*) filter (where amount_cents is not null)::int as orders,
         coalesce(sum(amount_cents), 0)::numeric as lifetime_value_cents
  from fx.bookings group by customer_id
),
pa as (
  select customer_id, mode() within group (order by party_size) as modal_party_size
  from attended group by customer_id
),
cr as (
  select customer_id, max(credits_remaining) as credits_remaining
  from fx.bookings group by customer_id
),
geo_town as (
  select distinct on (customer_id) customer_id, town, country
  from fx.bookings where town is not null and town <> ''
  order by customer_id, local_date desc, town
),
geo as (
  select v.customer_id,
         hearth.distance_km(t.lat, t.lng, ve.lat, ve.lng) as distance_km,
         case when t.country is null or ve.country is null then null
              else t.country = ve.country end as same_country
  from v
  left join geo_town gt on gt.customer_id = v.customer_id
  left join fx.towns t on lower(t.name) = lower(gt.town)
  cross join venue ve
),
slot as (
  select customer_id,
         mode() within group (order by extract(isodow from local_date)::int) as modal_weekday,
         mode() within group (order by slot_hour) as modal_hour,
         max(local_date) as last_on
  from attended where slot_hour is not null
  group by customer_id
),
occ as (
  select local_date, slot_hour, count(*) as booked, max(capacity) as capacity
  from attended where slot_hour is not null
  group by local_date, slot_hour
),
squeeze as (
  select s.customer_id,
         count(*) as slots_since,
         count(*) filter (where o.capacity is not null and o.booked >= o.capacity) as slots_full
  from slot s
  join occ o
    on o.slot_hour = s.modal_hour
   and extract(isodow from o.local_date)::int = s.modal_weekday
   and o.local_date > s.last_on
   and o.local_date <= (select as_of from settings)
  group by s.customer_id
),
season_profile as (
  select a.customer_id,
         count(*) as visits_seen,
         count(*) filter (where s.month_index < 0.9) as visits_in_trough
  from attended a
  join season s on s.month_of_year = extract(month from a.local_date)::int
  group by a.customer_id
),
base as materialized (
  select
    v.customer_id,
    v.visits,
    v.first_on,
    v.last_on,
    (select as_of from settings) - v.last_on            as days_since_last_visit,
    g.median_gap_days                                   as visit_cadence_days,
    sv.days_to_second_visit,
    greatest(0, v.visits - 1)::integer                  as observed_gaps,
    coalesce(sp.orders, 0)                              as orders,
    coalesce(sp.lifetime_value_cents, 0)                as lifetime_value_cents,
    coalesce(pa.modal_party_size, 1)                    as modal_party_size,
    coalesce(sq.slots_since, 0)                         as habitual_slots_since,
    coalesce(sq.slots_full, 0)                          as habitual_slots_full,
    coalesce(spr.visits_seen, 0)                        as season_visits_seen,
    coalesce(spr.visits_in_trough, 0)                   as season_visits_in_trough,
    coalesce(cr.credits_remaining, 0)                   as credits_remaining,
    geo.distance_km,
    coalesce(hearth.distance_band(geo.distance_km, geo.same_country), 'unknown') as distance_band,
    -- The season factor is off below twelve calendar months of trade, which is
    -- this tool's own rule and not the migration's. Null in means 1.0 out.
    case when (select months_seen from season_totals) >= 12
         then (select s.month_index from season s
                where s.month_of_year = extract(month from (select as_of from settings))::int)
         else null end                                  as current_month_index
  from v
  left join g   on g.customer_id = v.customer_id
  left join sv  on sv.customer_id = v.customer_id
  left join sp  on sp.customer_id = v.customer_id
  left join pa  on pa.customer_id = v.customer_id
  left join cr  on cr.customer_id = v.customer_id
  left join squeeze sq on sq.customer_id = v.customer_id
  left join season_profile spr on spr.customer_id = v.customer_id
  left join geo on geo.customer_id = v.customer_id
),
cohort as (
  select
    coalesce(percentile_cont(0.5) within group (
      order by base.visit_cadence_days) filter (where base.visits >= 3), 30.0)::numeric as cadence_days,
    coalesce(percentile_cont(0.5) within group (
      order by base.days_to_second_visit) filter (where base.days_to_second_visit is not null),
      45.0)::numeric as first_repeat_days,
    coalesce(avg(case when base.orders > 0
                      then base.lifetime_value_cents::numeric / base.orders end), 0)::numeric
      as average_order_cents
  from base
),
retention_obs as (
  select customer_id, total_visits,
         case when next_date is null then (select as_of from settings) - local_date
              else next_date - local_date end as gap_days,
         (next_date is not null) as returned
  from (
    select customer_id, local_date,
           lead(local_date) over (partition by customer_id order by local_date) as next_date,
           count(*) over (partition by customer_id) as total_visits
    from attended
  ) w
),
rates as (
  select b.distance_band,
         case when o.total_visits <= 1 then '1'
              when o.total_visits <= 3 then '2-3'
              when o.total_visits <= 9 then '4-9'
              else '10+' end as visits_bucket,
         width_bucket(o.gap_days::numeric, array[30, 60, 120, 240]::numeric[]) as overdue_bucket,
         count(*)::bigint as observations,
         count(*) filter (where o.returned)::bigint as returns
  from retention_obs o
  join base b on b.customer_id = o.customer_id
  group by 1, 2, 3
),
modelled as (
  select
    base.*,
    co.cadence_days      as cohort_cadence_days,
    co.first_repeat_days as cohort_first_repeat_days,
    co.average_order_cents as cohort_average_order_cents,
    case when base.visits <= 1 then co.first_repeat_days
         else hearth.shrink(base.visit_cadence_days, base.observed_gaps, co.cadence_days)
    end as base_gap_days,
    hearth.blend_prior(
      hearth.distance_prior_factor(base.distance_band), base.observed_gaps
    ) as distance_factor,
    hearth.season_factor(base.current_month_index) as season_factor,
    case when base.modal_party_size >= 2 then 1.25 else 1.00 end::numeric as companion_factor,
    (base.credits_remaining > 0) as committed,
    (base.visits >= 3
       and base.habitual_slots_since >= 4
       and base.habitual_slots_full::numeric / nullif(base.habitual_slots_since, 0) >= 0.5)
      as slot_squeezed,
    (base.current_month_index < 0.9
       and base.season_visits_seen >= 4
       and base.season_visits_in_trough::numeric
             / nullif(base.season_visits_seen, 0) < 0.15) as seasonal_dormant,
    ((base.distance_band = 'distant' and base.visits <= 2)
     or (base.distance_band = 'visitor' and base.visits <= 3)) as low_evidence_far
  from base cross join cohort co
),
scored as (
  select modelled.*,
         hearth.expected_gap_days(
           modelled.base_gap_days, modelled.distance_factor,
           modelled.season_factor, modelled.companion_factor
         ) as expected_gap_days_calc
  from modelled
),
ratioed as (
  select scored.*,
         case when scored.days_since_last_visit is null then null
              else round(scored.days_since_last_visit / scored.expected_gap_days_calc, 3)
         end as silence_ratio_calc
  from scored
)
select
  r.customer_id,
  r.visits,
  r.observed_gaps,
  r.days_since_last_visit,
  r.visit_cadence_days,
  r.days_to_second_visit,
  r.orders,
  r.lifetime_value_cents,
  r.distance_band,
  -- `round(double precision, integer)` does not exist in Postgres, only
  -- `round(numeric, integer)`, and hearth.distance_km returns double.
  round(r.distance_km::numeric, 2)                as distance_km,
  r.modal_party_size,
  r.habitual_slots_since,
  r.habitual_slots_full,
  round(r.base_gap_days, 1)                       as base_gap_days,
  round(r.distance_factor, 3)                     as distance_factor,
  round(r.season_factor, 3)                       as season_factor,
  round(r.companion_factor, 3)                    as companion_factor,
  round(r.expected_gap_days_calc, 1)              as expected_gap_days,
  r.silence_ratio_calc                            as silence_ratio,
  r.committed,
  r.slot_squeezed,
  r.seasonal_dormant,
  r.low_evidence_far,
  hearth.retention_verdict(
    r.visits::integer, r.silence_ratio_calc, r.committed,
    r.slot_squeezed, r.seasonal_dormant, r.low_evidence_far
  ) as lifecycle,
  greatest(0, round(
    case when r.orders > 0 then r.lifetime_value_cents::numeric / r.orders
         else r.cohort_average_order_cents end
  ))::integer as expected_margin_cents,
  hearth.smooth_rate(
    coalesce(rr.returns, 0), coalesce(rr.observations, 0),
    hearth.p_return_prior(r.distance_band, r.visits::integer), 20
  ) as p_return,
  coalesce(rr.observations, 0)::bigint            as p_return_observations,
  hearth.winnability_cents(
    hearth.smooth_rate(
      coalesce(rr.returns, 0), coalesce(rr.observations, 0),
      hearth.p_return_prior(r.distance_band, r.visits::integer), 20
    ),
    greatest(0, round(
      case when r.orders > 0 then r.lifetime_value_cents::numeric / r.orders
           else r.cohort_average_order_cents end
    )),
    1.0
  ) as winnability_cents
from ratioed r
left join rates rr
  on rr.distance_band = r.distance_band
 and rr.visits_bucket = case when r.visits <= 1 then '1'
                             when r.visits <= 3 then '2-3'
                             when r.visits <= 9 then '4-9'
                             else '10+' end
 and rr.overdue_bucket = width_bucket(coalesce(r.days_since_last_visit, 0)::numeric,
                                      array[30, 60, 120, 240]::numeric[])
order by r.customer_id;

