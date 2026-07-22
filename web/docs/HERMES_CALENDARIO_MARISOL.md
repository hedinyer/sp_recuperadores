# Calendario Marisol — API para Hermes Agent

Base URL: `https://sp-recuperadores.vercel.app`

Auth en **todas** las rutas: header  
`Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293`  

(El feed ICS también acepta `?token=…` porque Skylight no manda headers.)

Token (hardcodeado): `15c903ed719abb5f3eb16e102300a0ed692fe8305319c293`

Zona horaria de ejemplo: America/Bogota (`-05:00`). Podés mandar ISO con offset o UTC (`Z`).

---

## Listar eventos

```http
GET /api/calendario_marisol/eventos
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

Respuesta `200`:

```json
{
  "eventos": [
    {
      "id": "uuid",
      "uid": "…@calendario-marisol",
      "summary": "Dentista",
      "description": "",
      "dtstart": "2026-07-23T20:00:00.000Z",
      "dtend": "2026-07-23T21:00:00.000Z",
      "created_at": "…",
      "updated_at": "…"
    }
  ]
}
```

---

## Crear evento

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

- `summary` y fechas: obligatorios.
- `description`: opcional (default `""`).
- `uid`: opcional; si no viene, el servidor lo genera.
- `dtend` debe ser `>= dtstart`.

Respuesta `201`: `{ "evento": { … } }`

curl:

```bash
curl -sS -X POST "https://sp-recuperadores.vercel.app/api/calendario_marisol/eventos" \
  -H "Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Dentista","description":"","dtstart":"2026-07-23T15:00:00-05:00","dtend":"2026-07-23T16:00:00-05:00"}'
```

---

## Actualizar evento

```http
PATCH /api/calendario_marisol/eventos/{id}
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
Content-Type: application/json
```

Body: solo campos a cambiar (`summary`, `description`, `dtstart`, `dtend`).

Respuesta `200`: `{ "evento": { … } }`  
`404` si el `id` no existe.

---

## Borrar evento

```http
DELETE /api/calendario_marisol/eventos/{id}
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

Respuesta `200`: `{ "ok": true }`

---

## Feed ICS (Skylight — solo lectura)

```http
GET /api/calendario_marisol/calendar.ics?token=15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

`Content-Type: text/calendar`. Skylight hace polling a esta URL.  
Hermes **no** escribe al ICS: escribe con POST/PATCH/DELETE; Skylight lee el feed.

URL lista para Skylight:

`https://sp-recuperadores.vercel.app/api/calendario_marisol/calendar.ics?token=15c903ed719abb5f3eb16e102300a0ed692fe8305319c293`

---

## Errores

| Status | Significado |
|--------|-------------|
| 401 | Token ausente o incorrecto |
| 400 | Body inválido (summary vacío, fechas mal, etc.) |
| 404 | Evento no encontrado |
| 500 | Error de servidor / DB |

---

## UI humana (no para Hermes)

`https://sp-recuperadores.vercel.app/calendario_marisol`  
Misma token al entrar; no está en la navegación de la app.

---

## Reglas para Hermes

1. Siempre mandar `Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293`.
2. Para agendar: `POST` con `summary` + `dtstart` + `dtend`.
3. Para mover/renombrar: `PATCH` con el `id` de un `GET` previo.
4. Para cancelar: `DELETE` con el `id`.
5. No inventar sync desde Skylight: el frame solo consume el `.ics`.
