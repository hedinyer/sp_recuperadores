-- Lotes por tipo: cuotas_17 (Jhon/James) | atraso_3_8 (Admin Nicolas).
-- Aplicar en SQL Editor del proyecto hvtbzxifzkbvmqpshmqw.

insert into public.cartera_perfiles (id, nombre, activo)
values ('admin_nicolas', 'Admin Nicolas', true)
on conflict (id) do update
set nombre = excluded.nombre, activo = excluded.activo;

alter table public.cartera_lotes_17
  add column if not exists tipo text not null default 'cuotas_17';

alter table public.cartera_lotes_17
  drop constraint if exists cartera_lotes_17_tipo_check;

alter table public.cartera_lotes_17
  add constraint cartera_lotes_17_tipo_check
  check (tipo = any (array['cuotas_17', 'atraso_3_8']));

create index if not exists cartera_lotes_17_tipo_status_idx
  on public.cartera_lotes_17 (tipo, status);

alter table public.cartera_lote_placas
  add column if not exists dias_mora numeric;
