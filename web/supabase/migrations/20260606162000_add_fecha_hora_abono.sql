alter table public.recuperadores
  add column if not exists fecha_hora_abono timestamp without time zone null;
