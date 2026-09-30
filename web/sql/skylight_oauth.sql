-- Skylight OAuth refresh (rota en cada uso; el backend lo persiste).
-- Aplicado en BGA: ngjpndqmkhhdqjjljfmp (MCP). También se puede aplicar en hvtbzx.

create table if not exists public.skylight_oauth (
  id text primary key default 'default',
  refresh_token text not null,
  device_fingerprint text,
  updated_at timestamptz not null default now()
);

alter table public.skylight_oauth enable row level security;

-- App usa publishable key hoy: permitir all al rol authenticated/anon
-- vía policy de servicio interno. Si hay service_role, bypasea RLS.
drop policy if exists skylight_oauth_service on public.skylight_oauth;
create policy skylight_oauth_service
  on public.skylight_oauth
  for all
  using (true)
  with check (true);
