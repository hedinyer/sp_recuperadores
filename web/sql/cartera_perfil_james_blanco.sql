-- Perfil James Blanco (reemplaza Dayana en la UI).
-- Proyecto: hvtbzxifzkbvmqpshmqw

insert into public.cartera_perfiles (id, nombre, activo)
values ('james_blanco', 'James Blanco', true)
on conflict (id) do update
set
  nombre = excluded.nombre,
  activo = true;

update public.cartera_perfiles
set activo = false, nombre = 'Dayana (inactivo)'
where id = 'dayana';
