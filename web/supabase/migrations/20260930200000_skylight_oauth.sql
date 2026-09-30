-- Persist Skylight OAuth refresh token (rota en cada uso).
-- Proyecto prod: hvtbzxifzkbvmqpshmqw

create table if not exists public.skylight_oauth (
  id text primary key default 'default',
  refresh_token text not null,
  device_fingerprint text,
  updated_at timestamptz not null default now()
);

alter table public.skylight_oauth enable row level security;

drop policy if exists skylight_oauth_service on public.skylight_oauth;
create policy skylight_oauth_service
  on public.skylight_oauth
  for all
  using (true)
  with check (true);
