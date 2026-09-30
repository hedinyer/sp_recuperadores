# Plugin Hermes: Calendario Marisol

Tools para que Hermes Agent gestione el calendario vía WhatsApp.

## Variables de entorno

El token Bearer ya va **hardcodeado** en `tools.py`. No hace falta exportarlo.

| Variable | Valor |
|----------|-------|
| `CALENDARIO_MARISOL_TOKEN` | Opcional (override). Default hardcodeado. |
| `CALENDARIO_MARISOL_BASE_URL` | `https://sp-recuperadores.vercel.app` (opcional) |

## Activar

```bash
export HERMES_ENABLE_PROJECT_PLUGINS=true
hermes plugins enable calendario-marisol
```

Ver documentación completa: `docs/HERMES_CALENDARIO_MARISOL.md`
