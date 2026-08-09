-- RakshaPay — Supabase (Postgres) backend.
--
-- Report aggregation is an AFTER INSERT trigger that lives inside the
-- database, so there is no separate runtime to deploy or keep awake.
--
-- Run once: Supabase dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run; every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Community-confirmed scam intelligence. `kind` distinguishes UPI IDs from
-- phone numbers so the same table, trigger and threshold logic can cover both
-- without duplicating any of this design.
create table if not exists public.scam_patterns (
  vpa               text        not null,
  kind              text        not null default 'vpa' check (kind in ('vpa', 'phone')),
  reason_codes      text[]      not null default '{}',
  report_count      integer     not null default 0,
  active            boolean     not null default false,
  first_reported_at timestamptz not null default now(),
  last_reported_at  timestamptz not null default now(),
  primary key (vpa, kind)
);

create index if not exists scam_patterns_active_idx
  on public.scam_patterns (kind, vpa) where active;

-- Anonymised individual reports. No account required — a per-install random
-- token stands in for identity, purely so the aggregation can count distinct
-- devices.
create table if not exists public.reports (
  id          bigint      generated always as identity primary key,
  vpa         text        not null,
  kind        text        not null default 'vpa' check (kind in ('vpa', 'phone')),
  reason_code text        not null,
  device_hash text        not null,
  created_at  timestamptz not null default now(),
  constraint reports_vpa_len    check (char_length(vpa) between 1 and 100),
  constraint reports_reason_len check (char_length(reason_code) between 1 and 50),
  constraint reports_device_len check (char_length(device_hash) between 16 and 128),
  constraint reports_one_per_device unique (vpa, kind, device_hash)
);

-- Anonymised risk-scoring telemetry: score and level only, never raw SMS or
-- QR content.
create table if not exists public.risk_logs (
  id         bigint      generated always as identity primary key,
  level      text        not null,
  score      integer     not null check (score between 0 and 100),
  source     text        not null,
  created_at timestamptz not null default now(),
  constraint risk_logs_level_len  check (char_length(level) <= 20),
  constraint risk_logs_source_len check (char_length(source) <= 20)
);

create index if not exists risk_logs_created_at_idx
  on public.risk_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Aggregation trigger
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so it can write scam_patterns, which no client role may
-- touch directly. search_path is pinned so the elevated function can't be
-- hijacked by a caller-controlled search_path.
create or replace function public.aggregate_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- A pattern becomes active only after this many DISTINCT devices report
  -- it, so one bad-faith reporter cannot flag a real merchant or number.
  c_threshold constant integer := 3;
  v_vpa       text := lower(btrim(new.vpa));
begin
  insert into public.scam_patterns as p
    (vpa, kind, reason_codes, report_count, active, first_reported_at, last_reported_at)
  values
    (v_vpa, new.kind, array[new.reason_code], 1, 1 >= c_threshold, now(), now())
  on conflict (vpa, kind) do update
    set report_count     = p.report_count + 1,
        active           = (p.report_count + 1) >= c_threshold,
        reason_codes     = (
          select array_agg(distinct rc)
          from unnest(p.reason_codes || excluded.reason_codes) as rc
        ),
        last_reported_at = now();

  return new;
end;
$$;

drop trigger if exists on_report_created on public.reports;
create trigger on_report_created
  after insert on public.reports
  for each row execute function public.aggregate_report();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.scam_patterns enable row level security;
alter table public.reports       enable row level security;
alter table public.risk_logs     enable row level security;

-- scam_patterns: world-readable, but only active rows. No write policy
-- exists, so the app physically cannot author a pattern.
drop policy if exists scam_patterns_read_active on public.scam_patterns;
create policy scam_patterns_read_active
  on public.scam_patterns for select to anon, authenticated
  using (active = true);

-- reports: insert-only. No select policy, so reports are write-only from the
-- client and can never be read back, edited or deleted.
drop policy if exists reports_insert_anon on public.reports;
create policy reports_insert_anon
  on public.reports for insert to anon, authenticated
  with check (
        char_length(btrim(vpa))         between 1 and 100
    and char_length(btrim(reason_code)) between 1 and 50
    and char_length(device_hash)        between 16 and 128
  );

-- risk_logs: insert-only telemetry, same shape.
drop policy if exists risk_logs_insert_anon on public.risk_logs;
create policy risk_logs_insert_anon
  on public.risk_logs for insert to anon, authenticated
  with check (score between 0 and 100);

grant usage  on schema public       to anon, authenticated;
grant select on public.scam_patterns to anon, authenticated;
grant insert on public.reports       to anon, authenticated;
grant insert on public.risk_logs     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Analytics / threat-intel views
-- ---------------------------------------------------------------------------

-- The public, documented read surface: what a bank or another UPI app would
-- consume. Already covers the "threat-intel API" surface from the strategy
-- doc — this view IS that API, reachable at /rest/v1/active_patterns.
create or replace view public.active_patterns as
select vpa, kind, report_count, reason_codes, first_reported_at, last_reported_at
from public.scam_patterns
where active
order by last_reported_at desc
limit 200;

grant select on public.active_patterns to anon, authenticated;

-- Aggregate-only counts for a live dashboard. Never exposes an individual
-- report, score, or timestamp — counts only.
create or replace view public.live_stats as
select
  (select count(*) from public.reports)                            as total_reports,
  (select count(distinct device_hash) from public.reports)         as reporting_devices,
  (select count(*) from public.scam_patterns)                      as patterns_tracked,
  (select count(*) from public.scam_patterns where active)         as patterns_active,
  (select count(*) from public.risk_logs)                          as payments_scored,
  (select count(*) from public.risk_logs where level = 'highRisk') as high_risk_blocked,
  (select count(*) from public.risk_logs where level = 'caution')  as caution_raised,
  (select count(*) from public.risk_logs where level = 'safe')     as scored_safe,
  now()                                                            as as_of;

grant select on public.live_stats to anon, authenticated;
