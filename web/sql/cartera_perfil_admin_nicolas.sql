-- Perfiles visibles en Morosos: quitar Angie/Santiago del uso activo; agregar Admin Nicolas.
-- Aplicar en SQL Editor del proyecto hvtbzxifzkbvmqpshmqw.

insert into public.cartera_perfiles (id, nombre, activo)
values
  ('admin_nicolas', 'Admin Nicolas', true),
  ('jhon_saenz', 'Jhon Sáenz', true),
  ('james_blanco', 'James Blanco', true),
  ('mauricio_perucho', 'Mauricio Perucho', true)
on conflict (id) do update
set
  nombre = excluded.nombre,
  activo = excluded.activo;

update public.cartera_perfiles
set activo = false
where id in ('santiago_saenz', 'angie_garcia');
