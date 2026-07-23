-- Fotos de acceso ya no son obligatorias.
alter table public.sesiones_app
  alter column foto_frontal_url drop not null,
  alter column foto_trasera_url drop not null;

comment on table public.sesiones_app is
  'Registro de quién abre la app recuperadores: GPS preciso (fotos opcionales/descontinuadas).';
