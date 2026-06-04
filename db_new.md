
  1. 📦 almacen_movimiento (BASE TABLE)
  2. 📦 almacen_producto (BASE TABLE)
  3. 📦 almacen_proveedor (BASE TABLE)
  4. 📦 arrendamientos_contrato (BASE TABLE)
  5. 📦 arrendamientos_contratoalquilertarifa (BASE TABLE)
  6. 📦 arrendamientos_freezeday (BASE TABLE)
  7. 📦 auth_group (BASE TABLE)
  8. 📦 auth_group_permissions (BASE TABLE)
  9. 📦 auth_permission (BASE TABLE)
  10. 📦 auth_user (BASE TABLE)
  11. 📦 auth_user_groups (BASE TABLE)
  12. 📦 auth_user_user_permissions (BASE TABLE)
  13. 📦 clientes_cliente (BASE TABLE)
  14. 📦 clientes_vendedor (BASE TABLE)
  15. 📦 creditos_credito (BASE TABLE)
  16. 📦 creditos_creditoitem (BASE TABLE)
  17. 📦 django_admin_log (BASE TABLE)
  18. 📦 django_content_type (BASE TABLE)
  19. 📦 django_migrations (BASE TABLE)
  20. 📦 django_session (BASE TABLE)
  21. 📦 empleados_empleado (BASE TABLE)
  22. 📦 reportes_cierrecaja (BASE TABLE)
  23. 📦 reportes_cierrecajadetalle (BASE TABLE)
  24. 📦 taller_mecanico (BASE TABLE)
  25. 📦 taller_servicio (BASE TABLE)
  26. 📦 terminal_pagos_canalpago (BASE TABLE)
  27. 📦 terminal_pagos_configuracionpago (BASE TABLE)
  28. 📦 terminal_pagos_cuenta (BASE TABLE)
  29. 📦 terminal_pagos_factura (BASE TABLE)
  30. 📦 terminal_pagos_gasto (BASE TABLE)
  31. 📦 terminal_pagos_itemfactura (BASE TABLE)
  32. 📦 terminal_pagos_mediopago (BASE TABLE)
  33. 📦 terminal_pagos_multa (BASE TABLE)
  34. 📦 terminal_pagos_pagofactura (BASE TABLE)
  35. 📦 terminal_pagos_pagomulta (BASE TABLE)
  36. 📦 terminal_pagos_prepago (BASE TABLE)
  37. 📦 terminal_pagos_tipogasto (BASE TABLE)
  38. 📦 vehiculos_color (BASE TABLE)
  39. 📦 vehiculos_marca (BASE TABLE)
  40. 📦 vehiculos_vehiculo (BASE TABLE)

============================================================
🎮 Escribe el número de tabla, 'all' para todas, o 'q' para salir
============================================================

👉 Tu elección: all

📋 Estructura: public.almacen_movimiento
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
tipo                         character varying(30)  NO     -
cantidad                     integer                NO     -
fecha                        date                   NO     -
precio_unitario              numeric                NO     -
factura_referencia           character varying(100) YES    -
producto_id                  bigint                 NO     -
proveedor_id                 bigint                 YES    -
fecha_factura                date                   YES    -

🔑 Clave primaria: id

📋 Estructura: public.almacen_producto
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(100) NO     -
referencia                   character varying(100) NO     -
utilidad                     character varying(100) YES    -
precio_venta                 numeric                NO     -
ean                          character varying(13)  YES    -

🔑 Clave primaria: id

📋 Estructura: public.almacen_proveedor
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(100) NO     -
nit                          character varying(50)  NO     -
telefono                     character varying(20)  NO     -

🔑 Clave primaria: id

📋 Estructura: public.arrendamientos_contrato
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha_inicio                 date                   NO     -
cuota_inicial                numeric                NO     -
tarifa                       numeric                NO     -
dias_contrato                integer                NO     -
tipo_contrato                character varying(20)  NO     -
estado                       character varying(20)  NO     -
cliente_id                   bigint                 NO     -
vehiculo_id                  bigint                 NO     -
motivo                       character varying(20)  YES    -
frecuencia_pago              character varying(20)  NO     -
cuota_inicial_pagada         numeric                NO     -
vendedor_id                  bigint                 YES    -
fecha_cancelacion            timestamp with time zone YES    -

🔑 Clave primaria: id

📋 Estructura: public.arrendamientos_contratoalquilertarifa
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha_inicio_vigencia        date                   NO     -
fecha_fin_vigencia           date                   YES    -
lunes                        numeric                NO     -
martes                       numeric                NO     -
miercoles                    numeric                NO     -
jueves                       numeric                NO     -
viernes                      numeric                NO     -
sabado                       numeric                NO     -
domingo                      numeric                NO     -
creado_en                    timestamp with time zone NO     -
contrato_id                  bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.arrendamientos_freezeday
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha                        date                   NO     -
observaciones                text                   NO     -
creado_en                    timestamp with time zone NO     -
contrato_id                  bigint                 NO     -
creado_por_id                integer                YES    -

🔑 Clave primaria: id

📋 Estructura: public.auth_group
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           integer                NO     -
name                         character varying(150) NO     -

🔑 Clave primaria: id

📋 Estructura: public.auth_group_permissions
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
group_id                     integer                NO     -
permission_id                integer                NO     -

🔑 Clave primaria: id

📋 Estructura: public.auth_permission
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           integer                NO     -
name                         character varying(255) NO     -
content_type_id              integer                NO     -
codename                     character varying(100) NO     -

🔑 Clave primaria: id

📋 Estructura: public.auth_user
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           integer                NO     -
password                     character varying(128) NO     -
last_login                   timestamp with time zone YES    -
is_superuser                 boolean                NO     -
username                     character varying(150) NO     -
first_name                   character varying(150) NO     -
last_name                    character varying(150) NO     -
email                        character varying(254) NO     -
is_staff                     boolean                NO     -
is_active                    boolean                NO     -
date_joined                  timestamp with time zone NO     -

🔑 Clave primaria: id

📋 Estructura: public.auth_user_groups
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
user_id                      integer                NO     -
group_id                     integer                NO     -

🔑 Clave primaria: id

📋 Estructura: public.auth_user_user_permissions
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
user_id                      integer                NO     -
permission_id                integer                NO     -

🔑 Clave primaria: id

📋 Estructura: public.clientes_cliente
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
cedula                       character varying(20)  NO     -
nombre                       character varying(100) NO     -
nacionalidad                 character varying(50)  YES    -
direccion                    character varying(200) YES    -
telefono                     character varying(20)  YES    -
referencia_1                 character varying(100) YES    -
telefono_ref_1               character varying(20)  YES    -
referencia_2                 character varying(100) YES    -
telefono_ref_2               character varying(20)  YES    -
tipo                         character varying(20)  NO     -
status                       character varying(20)  YES    -
costo_administrativo         numeric                YES    -
costo_operativo              numeric                YES    -
tipo_documento               character varying(10)  NO     -
foto_cliente                 character varying(100) YES    -

🔑 Clave primaria: id

📋 Estructura: public.clientes_vendedor
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
cedula                       character varying(20)  NO     -
nombre                       character varying(150) NO     -
telefono                     character varying(20)  YES    -
direccion                    character varying(255) YES    -
cargo                        character varying(100) NO     -
creado                       timestamp with time zone NO     -
actualizado                  timestamp with time zone NO     -

🔑 Clave primaria: id

📋 Estructura: public.creditos_credito
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
descripcion                  text                   NO     -
monto_total                  numeric                NO     -
saldo                        numeric                NO     -
fecha                        date                   NO     -
estado                       character varying(20)  NO     -
contrato_id                  bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.creditos_creditoitem
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
descripcion                  character varying(255) NO     -
cantidad                     integer                YES    -
valor_unitario               numeric                YES    -
subtotal                     numeric                NO     -
credito_id                   bigint                 NO     -
tipo                         character varying(20)  NO     -

🔑 Clave primaria: id

📋 Estructura: public.django_admin_log
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           integer                NO     -
action_time                  timestamp with time zone NO     -
object_id                    text                   YES    -
object_repr                  character varying(200) NO     -
action_flag                  smallint               NO     -
change_message               text                   NO     -
content_type_id              integer                YES    -
user_id                      integer                NO     -

🔑 Clave primaria: id

📋 Estructura: public.django_content_type
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           integer                NO     -
app_label                    character varying(100) NO     -
model                        character varying(100) NO     -

🔑 Clave primaria: id

📋 Estructura: public.django_migrations
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
app                          character varying(255) NO     -
name                         character varying(255) NO     -
applied                      timestamp with time zone NO     -

🔑 Clave primaria: id

📋 Estructura: public.django_session
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
session_key                  character varying(40)  NO     -
session_data                 text                   NO     -
expire_date                  timestamp with time zone NO     -

🔑 Clave primaria: session_key

📋 Estructura: public.empleados_empleado
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(120) NO     -
documento                    character varying(50)  NO     -
cargo                        character varying(50)  NO     -
activo                       boolean                NO     -
created_at                   timestamp with time zone NO     -
user_id                      integer                YES    -

🔑 Clave primaria: id

📋 Estructura: public.reportes_cierrecaja
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha_inicio                 timestamp with time zone NO     -
fecha_fin                    timestamp with time zone NO     -
total_sistema                numeric                NO     -
total_arqueo                 numeric                NO     -
diferencia                   numeric                NO     -
autorizado                   boolean                NO     -
observacion                  text                   NO     -
creado_en                    timestamp with time zone NO     -
operador_id                  integer                NO     -

🔑 Clave primaria: id

📋 Estructura: public.reportes_cierrecajadetalle
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
medio_id                     bigint                 NO     -
total_sistema                numeric                NO     -
total_arqueo                 numeric                NO     -
diferencia                   numeric                NO     -
cierre_id                    bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.taller_mecanico
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(100) NO     -
identificacion               character varying(50)  NO     -

🔑 Clave primaria: id

📋 Estructura: public.taller_servicio
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre_servicio              character varying(100) NO     -
valor                        numeric                NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_canalpago
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(50)  NO     -
requiere_referencia          boolean                NO     -
activo                       boolean                NO     -
medio_id                     bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_configuracionpago
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
activo                       boolean                NO     -
cuenta_destino_id            bigint                 NO     -
medio_id                     bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_cuenta
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(50)  NO     -
activa                       boolean                NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_factura
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha                        timestamp with time zone NO     -
estado                       character varying(20)  NO     -
estado_pago                  character varying(20)  NO     -
total                        numeric                NO     -
total_pagado                 numeric                NO     -
contrato_id                  bigint                 NO     -
creado_por_id                integer                YES    -
anulada_por_id               integer                YES    -
fecha_anulacion              timestamp with time zone YES    -
motivo_anulacion             text                   NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_gasto
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha                        date                   NO     -
descripcion                  text                   NO     -
valor                        numeric                NO     -
fecha_creacion               timestamp with time zone NO     -
creado_por_id                integer                YES    -
tipo_id                      bigint                 NO     -
anulado                      boolean                NO     -
medio_pago                   character varying(20)  NO     -
es_compraventa               boolean                NO     -
observacion                  text                   NO     -
vehiculo_id                  bigint                 YES    -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_itemfactura
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
tipo_item                    character varying(20)  NO     -
descripcion                  character varying(255) NO     -
cantidad                     integer                NO     -
valor_unitario               numeric                NO     -
subtotal                     numeric                NO     -
factura_id                   bigint                 NO     -
producto_almacen_id          bigint                 YES    -
servicio_taller_id           bigint                 YES    -
credito_id                   bigint                 YES    -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_mediopago
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(50)  NO     -
activo                       boolean                NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_multa
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
valor                        numeric                NO     -
fecha                        date                   NO     -
observacion                  text                   NO     -
estado                       character varying(20)  NO     -
created_at                   timestamp with time zone NO     -
cobrador_id                  bigint                 YES    -
contrato_id                  bigint                 NO     -
saldo                        numeric                NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_pagofactura
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
valor                        numeric                NO     -
referencia                   character varying(100) YES    -
canal_id                     bigint                 NO     -
configuracion_id             bigint                 NO     -
factura_id                   bigint                 NO     -
fecha_pago                   date                   NO     -
validado                     boolean                NO     -
es_compensacion              boolean                NO     -
referencia_original          character varying(100) YES    -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_pagomulta
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
valor                        numeric                NO     -
fecha                        timestamp with time zone NO     -
observacion                  text                   NO     -
factura_id                   bigint                 NO     -
multa_id                     bigint                 NO     -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_prepago
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
fecha                        timestamp with time zone NO     -
valor                        numeric                NO     -
saldo_disponible             numeric                NO     -
estado                       character varying(20)  NO     -
cliente_id                   bigint                 NO     -
contrato_id                  bigint                 YES    -
factura_aplicacion_id        bigint                 YES    -
factura_origen_id            bigint                 NO     -
usuario_id                   integer                YES    -

🔑 Clave primaria: id

📋 Estructura: public.terminal_pagos_tipogasto
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
descripcion                  character varying(100) NO     -
movimiento_interno           boolean                NO     -
activo                       boolean                NO     -

🔑 Clave primaria: id

📋 Estructura: public.vehiculos_color
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(50)  NO     -

🔑 Clave primaria: id

📋 Estructura: public.vehiculos_marca
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
nombre                       character varying(100) NO     -
parent_id                    bigint                 YES    -

🔑 Clave primaria: id

📋 Estructura: public.vehiculos_vehiculo
------------------------------------------------------------------------
Columna                      Tipo                   Null   Default
------------------------------------------------------------------------
id                           bigint                 NO     -
placa                        character varying(20)  NO     -
marca                        character varying(50)  NO     -
modelo                       character varying(50)  NO     -
serie                        character varying(50)  YES    -
propietario                  character varying(100) NO     -
numero_motor                 character varying(50)  YES    -
numero_chasis                character varying(50)  YES    -
actualizacion_soat           date                   YES    -
estado                       character varying(10)  NO     -
linea_gps                    character varying(50)  YES    -
estado_obs                   character varying(30)  YES    -
color                        character varying(50)  YES    -
tecnomecanica                date                   YES    -
razon_social                 character varying(100) YES    -
gps_recarga_vencimiento      date                   YES    -
operador_gps                 character varying(20)  YES    -
tarjeta_propiedad            character varying(100) YES    -
