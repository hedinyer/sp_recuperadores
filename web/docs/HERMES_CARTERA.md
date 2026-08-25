# Cartera morosos — Hermes Agent

API de tools (Vercel): `https://sp-recuperadores.vercel.app`

Agente Hermes Cobrador (OpenAI-compatible):

| Campo | Valor |
|-------|-------|
| Nombre | Cobrador |
| Base URL | `http://159.65.228.108/cobrador/v1` |
| Model | `hermes-cobrador` |

En la web **Morosos** (`/placas`): botón flotante **Agente cobro** (abajo a la derecha). Habla vía proxy `/api/cartera/chat` → Hermes. Elige tu perfil antes de chatear.

Repositorio: https://github.com/hedinyer/sp_recuperadores/tree/main/web

El agente **no envía WhatsApp**. Un cobrador (Dayana, Jhon, …) pega el chat o una captura; Hermes consulta y registra en Supabase (`cartera_casos`, `cartera_gestiones`).

---

## Token (Bearer)

```
15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

Header en todas las peticiones:

```
Authorization: Bearer 15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
```

(Opcional: `CARTERA_HERMES_TOKEN` en el servidor; si no está, se acepta el mismo token del Calendario Marisol.)

---

## Instalar plugin Hermes

Desde la carpeta del proyecto web (donde está `.hermes/plugins/`):

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=true
export CARTERA_HERMES_TOKEN=15c903ed719abb5f3eb16e102300a0ed692fe8305319c293
export CARTERA_HERMES_BASE_URL=https://sp-recuperadores.vercel.app
```

En `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - calendario-marisol
    - cartera-morosos
```

O copiar el plugin a Hermes global:

```bash
cp -r web/.hermes/plugins/cartera-morosos ~/.hermes/plugins/
hermes plugins enable cartera-morosos
```

Reiniciar Hermes. Tools disponibles:

| Tool | Qué hace |
|------|----------|
| `cartera_buscar` | Busca por placa, nombre o teléfono |
| `cartera_historial` | Gestiones previas de una placa |
| `cartera_pendientes` | Cola de bandeja (bajo_pago, sin_gps, …) |
| `cartera_registrar` | Guarda gestión / abono + notas del chat |
| `cartera_kpis` | Recaudo y gestiones de hoy (Dayana / Jhon) |
| `cartera_efectividad` | Días/gestiones hasta pago, ranking de métodos, sugerencia |

---

## Efectividad de cobro

UI: `https://sp-recuperadores.vercel.app/efectividad`

```http
GET /api/cartera/efectividad
GET /api/cartera/efectividad?placa=ABC12D
```

Mide episodios: desde la primera gestión hasta abono en app **o** pago ERP (el primero). Reporta bucket (mismo día / día siguiente / …), # gestiones, dinero y qué método (last-touch) convirtió. En abiertos sugiere el siguiente método.

---

## Flujo humano en el medio

1. Cobrador escribe a Hermes: «El de ABC12D dijo que paga mañana» (o pega captura).
2. Hermes: `cartera_buscar` → ficha + historial.
3. Hermes: `cartera_registrar` con `status=compromiso`, `perfil_id=dayana`, `notas=` texto pegado.
4. Queda en Supabase; la UI de Morosos y los KPIs lo ven al instante.

Ejemplos:

- «Busca a Juan Pérez» → `cartera_buscar`
- «Qué le hemos dicho a XYZ45A?» → `cartera_historial`
- «Dame 10 de mora 15+» → `cartera_pendientes` `categoria=mora_15`
- «Dayana: abonó 150000 la placa ABC12D» → `cartera_registrar` `status=abono` `monto=150000`
- «Cómo vamos de recaudo hoy?» → `cartera_kpis`

---

## API REST

Auth: `Authorization: Bearer …`

### Buscar

```http
GET /api/cartera/agent?action=buscar&q=ABC12D
```

### Historial

```http
GET /api/cartera/agent?action=historial&placa=ABC12D
```

### Pendientes

```http
GET /api/cartera/agent?action=pendientes&categoria=mora_15&limit=10
```

### KPIs

```http
GET /api/cartera/agent?action=kpis
```

### Registrar gestión

```http
POST /api/cartera/agent
Content-Type: application/json
```

```json
{
  "action": "registrar",
  "placa": "ABC12D",
  "perfil_id": "dayana",
  "status": "compromiso",
  "notas": "Cliente: pago mañana en la tarde"
}
```

Abono:

```json
{
  "action": "registrar",
  "placa": "ABC12D",
  "perfil_id": "jhon_saenz",
  "status": "abono",
  "monto": 150000,
  "notas": "Comprobante Nequi"
}
```

`perfil_id`: `jhon_saenz` | `dayana` | `santiago_saenz` | `angie_garcia` | `mauricio_perucho`

`status`: `pendiente` | `contactado` | `compromiso` | `abono` | `no_contesta` | `visita` | `en_ruta` | `recuperada` | `cerrado`

---

## Reglas para Hermes

1. No enviar mensajes al cliente; solo registrar lo que el cobrador reporta.
2. Antes de registrar, preferir `cartera_buscar` si no hay placa clara.
3. Siempre pasar `perfil_id` del cobrador que está hablando.
4. En `abono`, exigir `monto` en COP.
5. Pegar el chat del cliente en `notas` (hasta 4000 caracteres).
