# Calendario Marisol — Hermes Agent + Skylight Calendar 2

Base URL: `https://sp-recuperadores.vercel.app`

Repositorio: https://github.com/hedinyer/sp_recuperadores/tree/main/web

---

## Enlaces listos para copiar

### Skylight Calendar 2 (feed ICS — solo lectura)

Pegar en la app Skylight → **My Skylight** → **Synced Calendars** → **Sync new calendar** → **Calendar URL**:

```
https://sp-recuperadores.vercel.app/api/calendario_marisol/calendar.ics?token=15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

Skylight hace polling del ICS (sugerimos cada 1 min, pero Skylight **no garantiza** esa frecuencia). Los eventos nuevos también se **empujan al instante** vía API nativa de Skylight al crear/editar/borrar.

### Hermes Agent (API REST)

Token (Bearer):

```
15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

Header en todas las peticiones:

```
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

---

## Instalar plugin Hermes (tools)

Desde la carpeta del proyecto web (donde está `.hermes/plugins/`):

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=true
export CALENDARIO_MARISOL_TOKEN=15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
export CALENDARIO_MARISOL_BASE_URL=https://sp-recuperadores.vercel.app
```

En `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - calendario-marisol
```

O copiar el plugin a Hermes global:

```bash
cp -r web/.hermes/plugins/calendario-marisol ~/.hermes/plugins/
hermes plugins enable calendario-marisol
```

Reiniciar Hermes / gateway WhatsApp. Tools disponibles:

| Tool | Qué hace |
|------|----------|
| `calendario_listar_eventos` | Lista todos los eventos |
| `calendario_crear_evento` | Crea cita/evento con fecha/hora |
| `calendario_actualizar_evento` | Mueve o renombra por `id` |
| `calendario_borrar_evento` | Cancela evento por `id` |
| `calendario_crear_lista` | Lista como evento de día completo (calendario ICS) |
| `skylight_listar_tasks` | Lista chores visibles hoy en el frame |
| `skylight_crear_task` | Crea chore visible hoy (perfil Marisol) |
| `skylight_actualizar_task` | Edita task por `id` |
| `skylight_borrar_task` | Elimina task por `id` |
| `skylight_listar_listas` | Lista listas nativas (compras, to-do) |
| `skylight_crear_lista` | Crea lista o agrega ítems (compras/pendientes) |
| `skylight_listar_items_lista` | Ve ítems de una lista |
| `skylight_completar_item_lista` | Tilda ítem como hecho |
| `skylight_borrar_item_lista` | Borra ítem de lista |

### WhatsApp

Cualquiera que escriba al número conectado a Hermes puede pedir agendar cosas. Hermes interpreta el mensaje y llama las tools. Ejemplos:

- «Agenda dentista el martes 3pm»
- «Qué hay en el calendario esta semana?»
- «Cancela la cita del dentista»
- «Agrega a la lista de compras: leche, pan, huevos» → `skylight_crear_lista`
- «Qué hay en la lista del súper?» → `skylight_listar_items_lista`
- «Agrega task: sacar la basura» (Task Box nativo de Skylight)
- «Qué tasks hay en Skylight?»

---

## API REST (referencia)

Auth: `Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293`  
(El feed ICS también acepta `?token=…` porque Skylight no manda headers.)

Zona horaria: America/Bogota (`-05:00`). Podés mandar ISO con offset o UTC (`Z`).

### Listar eventos

```http
GET /api/calendario_marisol/eventos
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

### Crear evento

```http
POST /api/calendario_marisol/eventos
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
Content-Type: application/json
```

```json
{
  "summary": "Dentista",
  "description": "opcional",
  "dtstart": "2026-07-23T15:00:00-05:00",
  "dtend": "2026-07-23T16:00:00-05:00"
}
```

### Actualizar / borrar

```http
PATCH /api/calendario_marisol/eventos/{id}
DELETE /api/calendario_marisol/eventos/{id}
```

---

### Tasks visibles en el frame (chores)

Las tasks se crean como **chores** asignados a un perfil (default: Marisol) para la fecha indicada (default: hoy). Aparecen al instante en la pestaña **Tasks** del frame.

```http
GET /api/calendario_marisol/tasks?date=2026-08-08
POST /api/calendario_marisol/tasks
{ "summary": "Sacar basura", "profile": "Marisol", "start": "2026-08-08" }
```

No confundir con el Task Box de Skylight (solo plantillas guardadas, no visibles en el frame hasta asignarlas manualmente).

---

### Listas nativas de Skylight

Aparecen en la sección **Lists** del frame (compras, to-do). Instantáneas vía API.

```http
GET /api/calendario_marisol/listas
POST /api/calendario_marisol/listas
GET /api/calendario_marisol/listas/{id}
POST /api/calendario_marisol/listas/{id}
DELETE /api/calendario_marisol/listas/{id}
PATCH /api/calendario_marisol/listas/{id}/items/{itemId}
DELETE /api/calendario_marisol/listas/{id}/items/{itemId}
```

Agregar ítems a Grocery List (compras):

```json
POST /api/calendario_marisol/listas
{ "kind": "shopping", "items": ["leche", "pan", "huevos"] }
```

Crear lista nueva:

```json
{ "label": "Farmacia", "kind": "to_do" }
```

---

## Skylight vs listas nativas

- **Eventos** → Skylight los muestra vía feed ICS (compatible Calendar URL).
- **Listas nativas** → `skylight_crear_lista` / `skylight_listar_items_lista` (sección Lists, instantáneo).
- **Legacy:** `calendario_crear_lista` publica como evento de día completo en el calendario (usar solo si hace falta).

---

## UI humana

`https://sp-recuperadores.vercel.app/calendario_marisol`  
Solo pide el token del calendario (no la clave de la app). No está en la navegación principal.

---

## Reglas para Hermes

1. Siempre usar las tools del plugin o Bearer token en API.
2. Para agendar: `calendario_crear_evento` con `summary` + `dtstart` + `dtend`.
3. Para mover/renombrar: `calendario_actualizar_evento` con `id` de un listado previo.
4. Para cancelar: `calendario_borrar_evento`.
5. No escribir al `.ics`: Skylight solo lo lee.
