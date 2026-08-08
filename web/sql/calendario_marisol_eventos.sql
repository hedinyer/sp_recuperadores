-- Calendario Marisol (Hermes + Skylight) — Supabase proyecto web (hvtbzx…)

create table if not exists public.calendario_marisol_eventos (
  id uuid primary key default gen_random_uuid(),
  uid text not null unique,
  summary text not null,
  description text not null default '',
  dtstart timestamptz not null,
  dtend timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  skylight_event_id text
);

alter table public.calendario_marisol_eventos
  add column if not exists skylight_event_id text;
