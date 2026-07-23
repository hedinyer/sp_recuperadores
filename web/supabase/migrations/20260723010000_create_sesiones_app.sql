-- Registro de quién abre la app: GPS preciso + fotos frontal/trasera.
create table if not exists public.sesiones_app (
  id bigint generated always as identity primary key,
  abierto_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision null,
  altitude_m double precision null,
  altitude_accuracy_m double precision null,
  heading double precision null,
  speed_mps double precision null,
  gps_coords text not null,
  foto_frontal_url text not null,
  foto_trasera_url text not null,
  flash_frontal boolean not null default false,
  flash_trasera boolean not null default false,
  user_agent text null,
  viewport text null,
  ip text null,
  created_at timestamptz not null default now()
);

create index if not exists sesiones_app_abierto_at_idx
  on public.sesiones_app (abierto_at desc);

comment on table public.sesiones_app is
  'Registro de quién abre la app recuperadores: GPS preciso + fotos frontal/trasera.';
