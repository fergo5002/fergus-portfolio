-- The same twelve scalar model functions as DuckDB macros.
-- NOT EXECUTED BY THE SITE OR THE TEST SUITE.
--
-- Spike S3 (docs/superpowers/spikes/s3-duckdb.md, 2026-09-03) compared the
-- translation with Postgres over 100,000 rows: zero mismatches at 1e-9 and a
-- largest disagreement of 1.14e-13. DuckDB was ruled out of the browser tool
-- because its bundle costs 8.1 MB gzip and loaded in a median 82 seconds under
-- Chrome's Slow 4G profile. This file remains the recorded third expression of
-- the model. The only dialect change inside the expressions is numeric to
-- double; these scalar functions use neither percentile_cont nor date maths.

create schema if not exists hearth;

create macro hearth.distance_km(lat1, lng1, lat2, lng2) as (
  6371.0088 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
);

create macro hearth.distance_band(km, same_country) as (
  case
    when same_country is false then 'visitor'
    when km is null            then 'unknown'
    when km <= 15              then 'local'
    when km <= 45              then 'catchment'
    when km <= 95              then 'regional'
    else                            'distant'
  end
);

create macro hearth.distance_prior_factor(band) as (
  case band
    when 'local'     then 1.00
    when 'catchment' then 1.35
    when 'regional'  then 2.20
    when 'distant'   then 4.00
    when 'visitor'   then 8.00
    else                  1.00
  end::double
);

create macro hearth.blend_prior(raw, observed_gaps) as (
  greatest(1.0, 1.0 + (coalesce(raw, 1.0) - 1.0)
                        * (2.0 / (2.0 + greatest(0, coalesce(observed_gaps, 0)))))
);

create macro hearth.shrink(observed, n, prior) as (
  case
    when observed is null then prior
    when prior is null    then observed
    else (greatest(0, coalesce(n, 0)) * observed + 2.0 * prior)
         / (greatest(0, coalesce(n, 0)) + 2.0)
  end
);

create macro hearth.season_factor(month_index) as (
  case
    when month_index is null or month_index <= 0 then 1.0
    else least(3.0, greatest(0.6, 1.0 / month_index))
  end::double
);

create macro hearth.expected_gap_days(base_days, distance_factor, season_factor, companion_factor) as (
  least(540.0, greatest(3.0,
    coalesce(base_days, 30.0)
    * coalesce(distance_factor, 1.0)
    * coalesce(season_factor, 1.0)
    * coalesce(companion_factor, 1.0)
  ))
);

create macro hearth.retention_verdict(
  visits, silence_ratio, committed, squeezed, dormant, low_evidence_far
) as (
  case
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
);

create macro hearth.reachability(consent, has_email, has_phone, suppressed) as (
  case
    when consent is not true then 0.0
    when suppressed is true  then 0.0
    else case (coalesce(has_email, false)::int + coalesce(has_phone, false)::int)
      when 0 then 0.0
      when 1 then 0.6
      else        1.0
    end
  end::double
);

create macro hearth.p_return_prior(band, visits) as (
  least(0.60,
    0.12
    * (1.0 / hearth.distance_prior_factor(band))
    * least(1.5, 0.6 + 0.1 * greatest(0, coalesce(visits, 0)))
  )::double
);

create macro hearth.smooth_rate(successes, trials, prior, strength) as (
  round(
    (greatest(0.0, coalesce(successes, 0)) + coalesce(strength, 20.0) * coalesce(prior, 0.0))
    / nullif(greatest(0.0, coalesce(trials, 0)) + coalesce(strength, 20.0), 0)
  , 4)
);

create macro hearth.winnability_cents(p_return, margin_cents, reachability) as (
  greatest(0, round(
    greatest(0.0, coalesce(p_return, 0.0))
    * greatest(0.0, coalesce(margin_cents, 0.0))
    * greatest(0.0, coalesce(reachability, 0.0))
  ))::integer
);
