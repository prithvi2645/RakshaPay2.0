-- RakshaPay — corrective patch: appeals + analytics views.
--
-- Everything here is also in schema.sql. This file exists because the original
-- run of schema.sql died partway: `pattern_appeals` defaulted its reference to
-- gen_random_bytes(), which lives in pgcrypto, and Supabase installs pgcrypto
-- into the `extensions` schema without putting it on the SQL Editor's
-- search_path. The CREATE TABLE failed and took every statement after it with
-- it, leaving the three base tables present and everything else missing.
--
-- Run this whole file in the SQL Editor. It is idempotent and safe to re-run.
-- If any statement errors, STOP and send the red error text — a later statement
-- silently failing is exactly how the first attempt went wrong.

-- ---------------------------------------------------------------------------
-- 1. The flag-clearing column
-- ---------------------------------------------------------------------------

alter table public.scam_patterns
  add column if not exists overturned boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Aggregation trigger, so an overturned pattern cannot re-activate
-- ---------------------------------------------------------------------------

create or replace function public.aggregate_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_threshold constant integer := 3;
  v_vpa       text := lower(btrim(new.vpa));
begin
  insert into public.scam_patterns as p
    (vpa, kind, reason_codes, report_count, active, first_reported_at, last_reported_at)
  values
    (v_vpa, new.kind, array[new.reason_code], 1, 1 >= c_threshold, now(), now())
  on conflict (vpa, kind) do update
    set report_count     = p.report_count + 1,
        active           = (p.report_count + 1) >= c_threshold and not p.overturned,
        reason_codes     = (
          select array_agg(distinct rc)
          from unnest(p.reason_codes || excluded.reason_codes) as rc
        ),
        last_reported_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Appeals
-- ---------------------------------------------------------------------------

create table if not exists public.pattern_appeals (
  id              bigint      generated always as identity primary key,
  -- gen_random_uuid() is core Postgres and needs no extension, unlike
  -- gen_random_bytes(). 12 hex characters, ~48 bits.
  reference       text        not null unique
                              default 'RP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  vpa             text        not null,
  kind            text        not null default 'vpa' check (kind in ('vpa', 'phone')),
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

drop policy if exists pattern_appeals_insert_anon on public.pattern_appeals;
create policy pattern_appeals_insert_anon
  on public.pattern_appeals for insert to anon, authenticated
  with check (
        char_length(btrim(vpa))       between 1 and 100
    and char_length(btrim(statement)) between 20 and 2000
    and status = 'received'
  );

grant insert on public.pattern_appeals to anon, authenticated;

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
-- 4. Public read surfaces
-- ---------------------------------------------------------------------------

create or replace view public.active_patterns as
select vpa, kind, report_count, reason_codes, first_reported_at, last_reported_at
from public.scam_patterns
where active
order by last_reported_at desc
limit 200;

grant select on public.active_patterns to anon, authenticated;

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
  (select count(*) from public.pattern_appeals
     where status in ('received', 'under_review'))                 as appeals_open,
  (select count(*) from public.pattern_appeals where status = 'upheld')   as appeals_upheld,
  (select count(*) from public.pattern_appeals where status = 'rejected') as appeals_rejected,
  now()                                                            as as_of;

grant select on public.live_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tell PostgREST about the new objects
-- ---------------------------------------------------------------------------
-- Supabase usually reloads on its own, but doing it explicitly removes the one
-- remaining reason a correctly-created view would still answer 404.

notify pgrst, 'reload schema';
