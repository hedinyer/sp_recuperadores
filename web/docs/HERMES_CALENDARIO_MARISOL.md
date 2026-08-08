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
| `skylight_listar_tasks` | Lista tasks nativas del Task Box |
| `skylight_crear_task` | Crea task nativa en Skylight (sección Tasks) |
| `skylight_actualizar_task` | Edita task por `id` |
| `skylight_borrar_task` | Elimina task por `id` |

### WhatsApp

Cualquiera que escriba al número conectado a Hermes puede pedir agendar cosas. Hermes interpreta el mensaje y llama las tools. Ejemplos:

- «Agenda dentista el martes 3pm»
- «Qué hay en el calendario esta semana?»
- «Cancela la cita del dentista»
- «Lista de compras: leche, pan, huevos para hoy»
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

### Tasks nativas de Skylight (Task Box)

Hermes escribe directo al frame `5519401` vía API no oficial de Skylight (credenciales hardcodeadas en el servidor).

```http
GET /api/calendario_marisol/tasks
POST /api/calendario_marisol/tasks
PATCH /api/calendario_marisol/tasks/{id}
DELETE /api/calendario_marisol/tasks/{id}
```

Body crear: `{ "summary": "Comprar leche" }`

---

## Skylight vs listas nativas

- **Eventos** → Skylight los muestra vía feed ICS (compatible Calendar URL).
- **Listas nativas de Skylight** (compras, chores) **no** se sincronizan por ICS.
- Para listas vía WhatsApp usá `calendario_crear_lista`: se publica como evento de día completo con ítems en la descripción.

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
