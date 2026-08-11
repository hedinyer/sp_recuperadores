-- Calendario Marisol: ID nativo de evento en Skylight (dual-write).
-- Proyecto prod: hvtbzxifzkbvmqpshmqw

alter table public.calendario_marisol_eventos
  add column if not exists skylight_event_id text;
