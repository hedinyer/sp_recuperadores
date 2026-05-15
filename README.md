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

En **Vercel** no existe el CSV en `/var/task/...`. La API (`web`) intenta en orden: archivo local → descarga `REPORTE_CSV_URL` → `DATABASE_URL` (consulta directa, misma SQL que `db_general.py`). Lo más simple en Vercel es definir **`DATABASE_URL`** en el proyecto (el mismo `postgresql://...` de tu `.env`).

Ver `web/.env.example`.
