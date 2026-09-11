# Plugin Hermes: cartera morosos

Tools para que Hermes Agent gestione cobro de cartera (humano en el medio: el cobrador pega el chat).

## Variables de entorno

| Variable | Valor |
|----------|-------|
| `CARTERA_HERMES_TOKEN` | Token Bearer (ver `docs/HERMES_CARTERA.md`) |
| `CARTERA_HERMES_BASE_URL` | `https://sp-recuperadores.vercel.app` (opcional) |

## Tools

- `cartera_buscar`, `cartera_historial`, `cartera_pendientes`, `cartera_registrar`
- `cartera_kpis`, `cartera_efectividad`
- `cartera_alertas`, `cartera_analizar`, `cartera_followups` (harness IA lote 17+)

## Activar

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=true
hermes plugins enable cartera-morosos
```

Ver documentación: `docs/HERMES_CARTERA.md`
