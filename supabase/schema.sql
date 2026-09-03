-- NCD Games 2026 Competition Manager — Supabase schema
-- Run this whole file once in your Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New query > paste > Run).

create extension if not exists pgcrypto;

-- =========================================================
-- TEAMS
-- =========================================================
create table if not exists public.teams (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),

  -- Section A: Team information
  club_name                 text not null,
  sporting_code             text not null check (sporting_code in
                               ('Rugby League','Rugby 7s','Touch Footy','Volleyball','Basketball','Soccer','Netball')),
  category                  text not null check (category in ('Men','Women')),
  electorate                text not null check (electorate in
                               ('Moresby North-East','Moresby North-West','Moresby South')),
  community                 text,
  team_colors                text,
  motto                     text,

  -- Section B: Team manager (contact person)
  manager_given_name        text not null,
  manager_surname           text not null,
  manager_gender            text check (manager_gender in ('Male','Female')),
  manager_phone             text not null,
  manager_email             text,
  manager_address           text,
  manager_occupation        text,

  -- Section C: Captain
  captain_given_name        text not null,
  captain_surname           text not null,
  captain_phone             text not null,
  captain_email             text,

  -- Section E: Officials & support staff
  coach_name                text,
  coach_phone                text,
  assistant_coach_name       text,
  assistant_coach_phone      text,
  trainer_name               text,
  trainer_phone              text,
  doctor_name                text,
  doctor_phone                text,

  -- Section F: Payment (office use only)
  payment_paid               boolean not null default false,
  payment_amount              numeric not null default 500,
  payment_processed_by        text,
  payment_date_received       date,
  invoice_number               text,
  invoice_issued_at            timestamptz,
  receipt_number                text,
  receipt_issued_at             timestamptz,

  -- Section G: Approval (office use only)
  approval_status             text not null default 'Pending' check (approval_status in ('Pending','Approved','Rejected')),
  approval_comments            text,
  pool_zone                     text,
  team_id_number                 text
);

create index if not exists idx_teams_pool on public.teams (sporting_code, category, electorate, approval_status);

-- =========================================================
-- PLAYERS  (Section D: Player summary sheet, max 25 per team)
-- =========================================================
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  full_name   text not null,
  dob         date,
  contact     text,
  "position"  text
);

create index if not exists idx_players_team on public.players (team_id);

-- =========================================================
-- FIXTURES  (round-robin schedule + scores, per pool)
-- Team names are denormalized at generation time so the public
-- fixtures/standings pages never need read access to the teams table.
-- =========================================================
create table if not exists public.fixtures (
  id              uuid primary key default gen_random_uuid(),
  sporting_code   text not null,
  category        text not null,
  electorate      text not null,
  round           integer not null,
  match_date      date not null,
  team_a_id       uuid references public.teams(id) on delete set null,
  team_b_id       uuid references public.teams(id) on delete set null,
  team_a_name     text not null,
  team_b_name     text not null,
  score_a         integer,
  score_b         integer,
  played          boolean not null default false
);

create index if not exists idx_fixtures_pool on public.fixtures (sporting_code, category, electorate);

-- =========================================================
-- Guardrails: the public registration form must never be able to
-- self-approve a team, mark itself paid, or exceed the 25-player cap.
-- =========================================================
create or replace function public.sanitize_team_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.approval_status := 'Pending';
  new.approval_comments := null;
  new.pool_zone := null;
  new.team_id_number := null;
  new.payment_paid := false;
  new.payment_amount := 500;
  new.payment_processed_by := null;
  new.payment_date_received := null;
  new.invoice_number := null;
  new.invoice_issued_at := null;
  new.receipt_number := null;
  new.receipt_issued_at := null;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_team_insert on public.teams;
create trigger trg_sanitize_team_insert
  before insert on public.teams
  for each row
  when (auth.role() = 'anon')
  execute function public.sanitize_team_insert();

create or replace function public.check_player_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.players where team_id = new.team_id;
  if cnt >= 25 then
    raise exception 'Maximum 25 players per team';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_player_cap on public.players;
create trigger trg_check_player_cap
  before insert on public.players
  for each row
  execute function public.check_player_cap();

-- =========================================================
-- Row Level Security
--
-- Public (anon key, no login) may:
--   - create a Team + its Players (the registration form)
--   - read Fixtures (schedule + standings + Governor's Cup pages)
-- Public may NOT read Teams or Players (protects manager contact
-- details, payment info, and other clubs' rosters).
--
-- Admin = any authenticated Supabase Auth user (create admin accounts
-- yourself in Dashboard > Authentication > Users — there is no public
-- sign-up in this app). Admins get full read/write on everything.
-- =========================================================
alter table public.teams    enable row level security;
alter table public.players  enable row level security;
alter table public.fixtures enable row level security;

-- Teams
drop policy if exists teams_public_insert on public.teams;
create policy teams_public_insert
  on public.teams for insert
  to anon, authenticated
  with check (true);

drop policy if exists teams_admin_select on public.teams;
create policy teams_admin_select
  on public.teams for select
  to authenticated
  using (true);

drop policy if exists teams_admin_update on public.teams;
create policy teams_admin_update
  on public.teams for update
  to authenticated
  using (true) with check (true);

drop policy if exists teams_admin_delete on public.teams;
create policy teams_admin_delete
  on public.teams for delete
  to authenticated
  using (true);

-- Players
drop policy if exists players_public_insert on public.players;
create policy players_public_insert
  on public.players for insert
  to anon, authenticated
  with check (true);

drop policy if exists players_admin_select on public.players;
create policy players_admin_select
  on public.players for select
  to authenticated
  using (true);

drop policy if exists players_admin_update on public.players;
create policy players_admin_update
  on public.players for update
  to authenticated
  using (true) with check (true);

drop policy if exists players_admin_delete on public.players;
create policy players_admin_delete
  on public.players for delete
  to authenticated
  using (true);

-- Fixtures
drop policy if exists fixtures_public_select on public.fixtures;
create policy fixtures_public_select
  on public.fixtures for select
  to anon, authenticated
  using (true);

drop policy if exists fixtures_admin_insert on public.fixtures;
create policy fixtures_admin_insert
  on public.fixtures for insert
  to authenticated
  with check (true);

drop policy if exists fixtures_admin_update on public.fixtures;
create policy fixtures_admin_update
  on public.fixtures for update
  to authenticated
  using (true) with check (true);

drop policy if exists fixtures_admin_delete on public.fixtures;
create policy fixtures_admin_delete
  on public.fixtures for delete
  to authenticated
  using (true);
