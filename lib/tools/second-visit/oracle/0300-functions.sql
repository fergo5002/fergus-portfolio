-- The oracle for /tools/second-visit.
--
-- Copied verbatim from Tigh Sauna's migration 0300, which is the SQL that runs
-- in that product's production database:
--
--   repository  C:\\Dev\\sauna-os  (fergo5002/sauna-os)
--   file        apps/api/migrations/0300_customer_intelligence.sql
--   commit      94f77a80debcd3e444e6609bd0c8b0068c4193db
--   migration   dated 2026-08-11
--   copied      2026-09-04, by the T4 implementer
--
-- Nothing in this file is executed by the site and nothing imports it. It is
-- loaded into a throwaway Postgres 16 container by scripts/second-visit/compare.mjs.
--
-- The source migration now has thirteen hearth functions. Twelve are scalar
-- model primitives and are copied below. hearth.retention_basis is deliberately
-- excluded because it formats prose over analytics.customer_intelligence, a row
-- type the fixture does not define, and calculates no model value.

create schema if not exists hearth;

/*
 * Great-circle distance in kilometres.
 *
 * Haversine rather than PostGIS: this is one number per customer for ranking and banding,
 * the error against the geodesic is well under a percent at Irish distances, and it does not
 * cost an extension on every environment including the ones a merchant might self-host.
 *
 * STRICT, so an unknown point yields an unknown distance instead of quietly becoming a point
 * off the coast of Africa at (0, 0). That is not a hypothetical: a customer with no address
 * is the normal case for a walk-in.
 */
create function hearth.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable strict parallel safe as $$
  select 6371.0088 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

/*
 * Distance as the merchant thinks about it.
 *
 * The boundaries are not round numbers for their own sake, they are drawn where behaviour
 * actually changes for a rural Irish sauna:
 *
 *   local      <= 15km   Granard, Ballinalee, Aughnacliff itself. Habit range. You can come
 *                        on a Tuesday because you feel like it.
 *   catchment  <= 45km   Longford town, Cavan, Carrick-on-Shannon. The real trading area:
 *                        far enough to be a plan, near enough to be a weekly plan.
 *   regional   <= 95km   Mullingar, Sligo, Athlone. A day out. Monthly at best.
 *   distant     > 95km   Dublin is 98km from Aughnacliff, and that is the point of this
 *                        boundary rather than an accident of it. A Dubliner coming to a
 *                        Longford sauna is taking a trip, not forming a habit, and holding
 *                        them to a fortnightly cadence slanders them.
 *
 * A different country is a visitor whatever the distance, because the border, not the
 * mileage, is what decides whether somebody is passing through.
 */
create function hearth.distance_band(km double precision, same_country boolean)
returns text
language sql immutable parallel safe as $$
  select case
    when same_country is false then 'visitor'
    when km is null            then 'unknown'
    when km <= 15              then 'local'
    when km <= 45              then 'catchment'
    when km <= 95              then 'regional'
    else                            'distant'
  end
$$;

/*
 * How much longer somebody in this band was always going to take to come back.
 *
 * A prior, expressed as a multiplier on the expected gap. It is deliberately a stated
 * assumption rather than a fitted parameter: with one venue and eighteen months of history
 * there is not enough data to fit five coefficients without overfitting, and a number a
 * merchant can argue with beats one nobody can explain. The empirical part of this model is
 * analytics.reactivation_rates, which is measured.
 *
 * 'unknown' is 1.0 on purpose. Not knowing where somebody lives is a gap in our records and
 * must never be charged to the customer as suspicion.
 */
create function hearth.distance_prior_factor(band text)
returns numeric
language sql immutable parallel safe as $$
  select case band
    when 'local'     then 1.00
    when 'catchment' then 1.35
    when 'regional'  then 2.20
    when 'distant'   then 4.00
    when 'visitor'   then 8.00
    else                  1.00
  end::numeric
$$;

/*
 * Evidence beats the prior.
 *
 * The prior applies in full to somebody we have never seen twice, and fades as their own
 * rhythm becomes observable. n is the number of gaps between visits actually observed, so a
 * first-timer is n = 0 and somebody with ten visits is n = 9.
 *
 *     factor = 1 + (raw - 1) * k / (k + n)
 *
 * k = 2 means two observed gaps are worth as much as the prior. That is aggressive on
 * purpose: a customer who has come back twice has told us more about themselves than their
 * postcode ever will.
 *
 *     n = 0  a Dubliner who came once      4.00x   we assume a trip
 *     n = 2  a Dubliner who came three     2.50x   we are starting to believe them
 *     n = 9  a Dubliner who came ten       1.55x   they are a regular who drives
 *
 * Floored at 1 so a prior can never become a discount, which would make a distant customer
 * look overdue sooner than a local one.
 */
create function hearth.blend_prior(raw numeric, observed_gaps integer)
returns numeric
language sql immutable parallel safe as $$
  select greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                        * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))))
$$;

/*
 * Shrink an observation toward a prior in proportion to how much of it there is.
 *
 * Without this, one customer who happened to come back after three days has a "cadence" of
 * three days and is permanently, absurdly overdue. Empirical Bayes with k = 2: the prior
 * carries the weight of two observations and then gets out of the way.
 */
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

-- ---------------------------------------------------------------------------
-- Season
-- ---------------------------------------------------------------------------

/*
 * How much the calendar itself stretches an expected gap.
 *
 * month_index is the venue's trade in the current month relative to its own average month:
 * 1.0 is a typical month, 0.6 is a quiet one, 1.4 is a busy one. A lakeside wood-fired sauna
 * is not a year-round flat business, and in July everybody's gap genuinely gets longer. Judge
 * a January customer by a July clock and half the base looks like it is walking out the door
 * every summer, which is the single most common false alarm in a seasonal trade.
 *
 * Bounded at both ends so one freak month, or a venue with two months of history, cannot
 * swamp everything else in the model.
 */
create function hearth.season_factor(month_index numeric)
returns numeric
language sql immutable parallel safe as $$
  select case
    when month_index is null or month_index <= 0 then 1.0
    else least(3.0, greatest(0.6, 1.0 / month_index))
  end::numeric
$$;

-- ---------------------------------------------------------------------------
-- The expected gap, and the verdict that follows from it
-- ---------------------------------------------------------------------------

/*
 * How long this particular person was always going to take.
 *
 * Multiplicative because the effects genuinely compound: a Dubliner in July is both taking a
 * trip and doing it in the off season. Floored at three days so nobody is permanently overdue
 * by construction, capped at 540 so a visitor gets a large number rather than an infinite one
 * and still appears on reports with a real figure beside them.
 */
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

/*
 * The verdict.
 *
 * Pure, and it takes every covariate explicitly, so it can be tested exhaustively against a
 * table of arguments rather than against whatever today's date happens to be. A retention
 * suite that only passes in winter is not a suite.
 *
 * silence_ratio is days since the last visit divided by the expected gap above. One means
 * exactly as overdue as this person was ever expected to be. Two means twice that.
 *
 * 'visiting' is decided before lateness is even considered, and that ordering took a wrong
 * turn to find. It is not a stage somebody reaches by going quiet, it is a statement about
 * who they are: a Dubliner who came once to a Longford sauna was on a day out, and that is
 * true on the evening they visit, not only six months later. Judging them on lateness first
 * gives the absurd result that they are 'first_time' for the eighteen months it takes their
 * inflated expected gap to run out, which reads as a pending conversion and quietly puts
 * them back in the funnel they were never in. The exception is somebody who has pre-paid:
 * a ten-pack means they are coming back from anywhere, so commitment outranks geography.
 *
 * After that, on time means active: a customer inside their own window is fine however far
 * away they live and whatever else is flagged. The overdue branch ranks the causes, and the
 * order is an order of actions rather than of severity:
 *
 *   committed_idle  they have already paid for sessions they have not taken. Cheapest
 *                   winback there is, and the most urgent, because a member who is not
 *                   coming is a member about to cancel and feel robbed.
 *   squeezed        their usual slot kept selling out. They did not leave, they were shut
 *                   out, and the fix is the timetable rather than a discount.
 *   dormant         out of season. Expected back, and the action is a September reminder,
 *                   not a July one.
 *   lapsed/at_risk  no excuse found. This is the real churn, and the list is now short
 *                   enough to act on.
 */
create function hearth.retention_verdict(
  visits integer,
  silence_ratio numeric,
  committed boolean,
  squeezed boolean,
  dormant boolean,
  low_evidence_far boolean
) returns text
language sql immutable parallel safe as $$
  select case
    when coalesce(visits, 0) <= 0 then 'prospect'
    when low_evidence_far and not coalesce(committed, false) then 'visiting'
    when silence_ratio is null or silence_ratio < 1.0 then
      case
        when visits >= 10 then 'loyal'
        when visits = 1   then 'first_time'
        else                   'repeat'
      end
    when committed        then 'committed_idle'
    when squeezed         then 'squeezed'
    when dormant          then 'dormant'
    when silence_ratio >= 2.0 then 'lapsed'
    else                           'at_risk'
  end
$$;

-- ---------------------------------------------------------------------------
-- Whether contacting them is worth anything
-- ---------------------------------------------------------------------------

/*
 * Consent first, then a channel, then whether that channel still works.
 *
 * A winback list ranked purely on risk puts its most valuable entries at the top and then
 * cannot contact any of them. Reachability is what turns a risk score into something an
 * operator can act on this afternoon.
 *
 * Zero is a hard zero, not a small number. No consent means no contact, and a rank that
 * treats an unlawful send as merely unlikely is a rank that will eventually produce one.
 */
create function hearth.reachability(
  consent boolean, has_email boolean, has_phone boolean, suppressed boolean
) returns numeric
language sql immutable parallel safe as $$
  select case
    when consent is not true then 0.0
    when suppressed is true  then 0.0
    else case (coalesce(has_email, false)::int + coalesce(has_phone, false)::int)
      when 0 then 0.0
      when 1 then 0.6
      else        1.0
    end
  end::numeric
$$;

/*
 * What we believe about somebody before we have contacted anybody like them.
 *
 * Winnability needs a probability, and on day one a merchant has no measured reactivation
 * data at all. An empty cell must not be read as "nobody like this ever returns", which is
 * what a raw count gives you, and it must not be read as certainty either.
 *
 * The prior is the inverse of the distance prior, which is the same assumption stated from
 * the other side: if somebody in a band takes four times as long to come back, a nudge aimed
 * at them is roughly a quarter as likely to land. 0.12 is the base rate for a well targeted
 * local reactivation, and it is a stated assumption rather than a measurement, which is
 * exactly why hearth.smooth_rate exists to let real numbers take over from it.
 *
 * Experience raises it, because somebody who has come six times has shown they like the
 * place and a reminder is pushing an open door.
 */
create function hearth.p_return_prior(band text, visits integer)
returns numeric
language sql immutable parallel safe as $$
  select least(0.60,
    0.12
    * (1.0 / hearth.distance_prior_factor(band))
    * least(1.5, 0.6 + 0.1 * greatest(0, coalesce(visits, 0)))
  )::numeric
$$;

/*
 * A rate, smoothed toward a prior by how much evidence stands behind it.
 *
 * One customer in a cell who happened to return does not make that cell a hundred percent,
 * and one who did not does not make it zero. strength is the number of observations at which
 * the evidence and the prior carry equal weight; twenty is enough that a cell has to mean
 * something before it moves the answer, and small enough that a real pattern is not held
 * down for a year.
 */
create function hearth.smooth_rate(
  successes numeric, trials numeric, prior numeric, strength numeric
) returns numeric
language sql immutable parallel safe as $$
  select round(
    (greatest(0.0, coalesce(successes, 0)) + coalesce(strength, 20.0) * coalesce(prior, 0.0))
    / nullif(greatest(0.0, coalesce(trials, 0)) + coalesce(strength, 20.0), 0)
  , 4)
$$;

/*
 * What one winback attempt is worth, in cents.
 *
 * Probability of return, times the margin that return would carry, times whether we can
 * actually reach them. A number in money rather than a score out of ten, because the
 * question an operator is really asking is which forty people to contact on a Tuesday
 * morning, and that is a question about money.
 *
 * Margin is floored at zero: a seat sold at a loss is not a reason to spend on recovering
 * the customer, but it is not a reason to rank them below zero either.
 */
create function hearth.winnability_cents(
  p_return numeric, margin_cents numeric, reachability numeric
) returns integer
language sql immutable parallel safe as $$
  select greatest(0, round(
    greatest(0.0, coalesce(p_return, 0.0))
    * greatest(0.0, coalesce(margin_cents, 0.0))
    * greatest(0.0, coalesce(reachability, 0.0))
  ))::integer
$$;

