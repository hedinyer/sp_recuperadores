-- Opcional: columna monto en gestiones (si no existe, la app usa notas "pago:123").
-- Aplicar en el SQL Editor del proyecto de cartera (hvtbzxifzkbvmqpshmqw).

alter table public.cartera_gestiones
  add column if not exists monto bigint;

comment on column public.cartera_gestiones.monto is
  'Pesos recaudados cuando status = abono';
