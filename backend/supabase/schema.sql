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

-- Set when a merchant's appeal is upheld. It is a separate flag rather than
-- just resetting report_count because the next report would otherwise
-- re-activate a pattern that has already been reviewed and cleared.
alter table public.scam_patterns
  add column if not exists overturned boolean not null default false;

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
        -- An overturned pattern stays inactive no matter how many further
        -- reports arrive. Reports keep accruing so a genuinely fraudulent
        -- payee that appealed successfully is still visible to a reviewer.
        active           = (p.report_count + 1) >= c_threshold and not p.overturned,
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
-- Merchant appeals
-- ---------------------------------------------------------------------------

-- Any system that flags people will sometimes flag the wrong person, and a
-- small merchant whose UPI ID is wrongly marked as a scam loses income for as
-- long as the flag stands. Recourse is therefore part of the design, not an
-- afterthought: the appeal path is in the schema alongside the reporting path.
create table if not exists public.pattern_appeals (
  id              bigint      generated always as identity primary key,
  -- Short human-readable handle the merchant keeps. Status is looked up by
  -- this alone, so it must be unguessable enough that it is not an oracle for
  -- other merchants' appeals — 12 hex characters, ~48 bits.
  --
  -- Derived from gen_random_uuid() rather than gen_random_bytes() on purpose:
  -- the latter is pgcrypto, which Supabase installs into the `extensions`
  -- schema and does NOT put on the SQL Editor's search_path, so this table
  -- silently failed to create and took every statement after it down with it.
  -- gen_random_uuid() is core Postgres and needs no extension.
  reference       text        not null unique
                              default 'RP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  vpa             text        not null,
  kind            text        not null default 'vpa' check (kind in ('vpa', 'phone')),
  -- Optional. A merchant who does not want to leave contact details can still
  -- appeal and check status with the reference alone.
  contact         text,
  statement       text        not null,
  status          text        not null default 'received'
                              check (status in ('received', 'under_review', 'upheld', 'rejected')),
  resolution_note text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint appeals_vpa_len       check (char_length(btrim(vpa)) between 1 and 100),
  constraint appeals_statement_len check (char_length(btrim(statement)) between 20 and 2000),
  constraint appeals_contact_len   check (contact is null or char_length(contact) <= 200)
);

create index if not exists pattern_appeals_open_idx
  on public.pattern_appeals (created_at desc) where status in ('received', 'under_review');

alter table public.pattern_appeals enable row level security;

-- Insert-only, exactly like reports. There is no select policy, so one
-- merchant can never read another's appeal or contact details.
drop policy if exists pattern_appeals_insert_anon on public.pattern_appeals;
create policy pattern_appeals_insert_anon
  on public.pattern_appeals for insert to anon, authenticated
  with check (
        char_length(btrim(vpa))       between 1 and 100
    and char_length(btrim(statement)) between 20 and 2000
    and status = 'received'
  );

grant insert on public.pattern_appeals to anon, authenticated;

-- Filing an appeal has to go through a function for the same reason status
-- lookup does: the merchant needs their reference code back, but the table has
-- no SELECT policy, so a plain `insert ... returning` is refused with 42501.
-- Returning the row would require making appeals readable, which is exactly
-- what must not happen. This inserts and hands back three fields, nothing more.
create or replace function public.file_appeal(
  p_vpa       text,
  p_statement text,
  p_contact   text default null,
  p_kind      text default 'vpa'
)
returns table (reference text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
-- Tagged dollar-quote rather than bare $$: a bare one is easy to mangle when
-- the body is copied through a chat window or an editor that reformats, and the
-- failure mode is silent — the parser stays inside the string and reports a
-- syntax error on whatever statement follows, which sends you looking in the
-- wrong place entirely.
as $fn$
declare
  v_appeal public.pattern_appeals;
begin
  -- Validated here as well as by the table constraints: a SECURITY DEFINER
  -- function bypasses RLS, so it must not rely on the insert policy that no
  -- longer applies to it.
  if char_length(btrim(coalesce(p_vpa, ''))) not between 1 and 100 then
    raise exception 'vpa must be between 1 and 100 characters';
  end if;
  if char_length(btrim(coalesce(p_statement, ''))) not between 20 and 2000 then
    raise exception 'statement must be between 20 and 2000 characters';
  end if;
  if p_kind not in ('vpa', 'phone') then
    raise exception 'kind must be vpa or phone';
  end if;

  insert into public.pattern_appeals (vpa, kind, statement, contact)
  values (
    lower(btrim(p_vpa)),
    p_kind,
    btrim(p_statement),
    nullif(btrim(coalesce(p_contact, '')), '')
  )
  returning * into v_appeal;

  return query select v_appeal.reference, v_appeal.status, v_appeal.created_at;
end;
$fn$;

grant execute on function public.file_appeal(text, text, text, text) to anon, authenticated;

-- Status lookup by reference. SECURITY DEFINER because the table has no select
-- policy; the function returns only the four fields the appellant is entitled
-- to and never the statement, contact, or any other row.
create or replace function public.appeal_status(p_reference text)
returns table (
  reference       text,
  vpa             text,
  status          text,
  resolution_note text,
  created_at      timestamptz,
  resolved_at     timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select a.reference, a.vpa, a.status, a.resolution_note, a.created_at, a.resolved_at
  from public.pattern_appeals a
  where a.reference = upper(btrim(p_reference))
  limit 1;
$$;

grant execute on function public.appeal_status(text) to anon, authenticated;

-- Reviewer-side resolution. Deliberately NOT granted to anon or authenticated:
-- it runs from the Supabase dashboard or a service_role key only. Upholding an
-- appeal clears the flag and marks the pattern overturned in the same
-- transaction, so a client can never be left showing a stale warning.
create or replace function public.resolve_appeal(
  p_reference text,
  p_status    text,
  p_note      text default null
)
returns public.pattern_appeals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_appeal public.pattern_appeals;
begin
  if p_status not in ('under_review', 'upheld', 'rejected') then
    raise exception 'invalid appeal status: %', p_status;
  end if;

  update public.pattern_appeals
     set status          = p_status,
         resolution_note = coalesce(p_note, resolution_note),
         resolved_at     = case when p_status in ('upheld', 'rejected') then now() end
   where reference = upper(btrim(p_reference))
  returning * into v_appeal;

  if v_appeal.id is null then
    raise exception 'no appeal with reference %', p_reference;
  end if;

  if p_status = 'upheld' then
    update public.scam_patterns
       set active = false, overturned = true
     where vpa = lower(btrim(v_appeal.vpa)) and kind = v_appeal.kind;
  end if;

  return v_appeal;
end;
$$;

revoke execute on function public.resolve_appeal(text, text, text) from anon, authenticated;

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
  -- Published on purpose. How often the system flags the wrong payee, and how
  -- fast that gets undone, is the number a fraud tool is least inclined to
  -- show and the one that most deserves to be public.
  (select count(*) from public.pattern_appeals
     where status in ('received', 'under_review'))                 as appeals_open,
  (select count(*) from public.pattern_appeals where status = 'upheld')   as appeals_upheld,
  (select count(*) from public.pattern_appeals where status = 'rejected') as appeals_rejected,
  now()                                                            as as_of;

grant select on public.live_stats to anon, authenticated;
