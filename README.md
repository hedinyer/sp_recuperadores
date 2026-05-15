# sp_recuperadores

## Reporte CSV (Python)

- **CSV único (sobrescrito):** `data/reporte_clientes_actual.csv`
- **Generación manual:** `python db_general.py` (y exportar con `s` cuando pregunte), o desde código: `from db_general import exportar_csv_actual; exportar_csv_actual()`
- **Cada 30 min entre 06:00 y 18:00 (proceso largo):** `python scheduler_reporte.py`
- **Cron cada 30 min:** `*/30 6-18 * * * cd /ruta/sp_recuperadores && /ruta/venv/bin/python exportar_reporte_una_vez.py` (ajusta rutas)

## Consulta CLI por placa

`python consulta_placa.py` — lee el CSV fijo (variable opcional `REPORTE_CSV_PATH`).

## Web (Next.js / Vercel)

Carpeta `web/`. En local, con el CSV en `../data/reporte_clientes_actual.csv`, la API lo encuentra sola.

En **Vercel** el sistema de archivos del deploy no incluye el CSV que genera tu Python en otro servidor: configura `REPORTE_CSV_URL` en los env del proyecto (URL HTTPS al archivo actualizado) o despliega la app en el mismo host donde corre el scheduler.

Ver `web/.env.example`.
