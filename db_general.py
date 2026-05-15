# reporte_hoy.py — consulta DB y exporta CSV fijo para consulta_placa / web
import os
import csv
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

import db_defaults

load_dotenv()

# Carpeta de datos (mismo directorio que este archivo)
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_BASE_DIR, "data")
CSV_ACTUAL = os.path.join(DATA_DIR, "reporte_clientes_actual.csv")


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", db_defaults.DB_HOST),
        port=os.getenv("DB_PORT", db_defaults.DB_PORT),
        database=os.getenv("DB_NAME", db_defaults.DB_NAME),
        user=os.getenv("DB_USER", db_defaults.DB_USER),
        password=os.getenv("DB_PASSWORD", db_defaults.DB_PASSWORD),
    )


SQL_REPORTE = """
    WITH clientes_activos AS (
        SELECT
            c.cedula, c.nombre, c.placa, c.telefono, c.visitador,
            c.fecha_inicio::date AS fecha_inicio,
            c.valor_cuota::numeric AS valor_cuota,
            COALESCE(c.otras_deudas::numeric, 0) AS otras_deudas,
            GREATEST(1, (CURRENT_DATE - c.fecha_inicio::date + 1)) AS cuotas_generadas
        FROM clientes c
        WHERE c.estado = 'activo'
          AND c.fecha_inicio IS NOT NULL
          AND c.fecha_inicio <= CURRENT_DATE
          AND c.valor_cuota > 0
    ),
    pagos_acumulados AS (
        SELECT
            cedula,
            fecha_registro::date AS fecha_pago,
            valor::numeric AS valor_pago,
            SUM(valor::numeric) OVER (PARTITION BY cedula ORDER BY fecha_registro::date, id) AS acumulado_total
        FROM registros
        WHERE tipo NOT ILIKE '%anulacion%'
    ),
    metricas AS (
        SELECT
            ca.cedula, ca.nombre, ca.placa, ca.telefono, ca.visitador,
            ca.fecha_inicio, ca.valor_cuota, ca.otras_deudas, ca.cuotas_generadas,
            COALESCE(pa.acumulado_total, 0) AS total_pagado,
            MAX(pa.fecha_pago) FILTER (WHERE pa.fecha_pago IS NOT NULL) AS ultimo_pago,
            (COALESCE(pa.acumulado_total, 0) / NULLIF(ca.valor_cuota, 0))::integer AS cuotas_completas,
            (COALESCE(pa.acumulado_total, 0) % ca.valor_cuota) AS remanente
        FROM clientes_activos ca
        LEFT JOIN pagos_acumulados pa ON ca.cedula = pa.cedula
        GROUP BY ca.cedula, ca.nombre, ca.placa, ca.telefono, ca.visitador,
                 ca.fecha_inicio, ca.valor_cuota, ca.otras_deudas, ca.cuotas_generadas,
                 pa.acumulado_total
    )
    SELECT
        cedula, nombre, placa, telefono, visitador,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        ROUND(valor_cuota, 0) AS valor_cuota,
        cuotas_generadas, cuotas_completas,
        ROUND((cuotas_completas + (remanente / NULLIF(valor_cuota, 0)))::numeric, 1) AS cuotas_pagadas,
        ROUND(GREATEST(0, cuotas_generadas - cuotas_completas - (remanente / NULLIF(valor_cuota, 0)))::numeric, 1) AS cuotas_pendientes,
        ROUND(total_pagado, 0) AS total_pagado,
        ROUND(GREATEST(0, (cuotas_generadas - cuotas_completas - (remanente / NULLIF(valor_cuota, 0))) * valor_cuota + otras_deudas)::numeric, 0) AS deuda_total,
        TO_CHAR(ultimo_pago, 'YYYY-MM-DD') AS ultimo_pago,
        COALESCE((CURRENT_DATE - ultimo_pago)::integer, cuotas_generadas) AS dias_mora,
        ROUND(100.0 * total_pagado / NULLIF(cuotas_generadas * valor_cuota, 0), 1) AS cumplimiento_pct
    FROM metricas
    ORDER BY cumplimiento_pct ASC NULLS LAST, dias_mora DESC, nombre;
    """


def ejecutar_consulta_reporte():
    """Ejecuta el SQL y devuelve (columnas, filas, fecha_corte)."""
    fecha_corte = datetime.now().date()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(SQL_REPORTE)
        columnas = [desc[0] for desc in cursor.description]
        resultados = cursor.fetchall()
        return columnas, resultados, fecha_corte
    finally:
        cursor.close()
        conn.close()


def escribir_csv_actual(columnas, resultados):
    """Sobrescribe siempre el mismo archivo (no acumula versiones)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_path = CSV_ACTUAL + ".tmp"
    with open(tmp_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(columnas)
        for fila in resultados:
            writer.writerow(["" if v is None else v for v in fila])
    os.replace(tmp_path, CSV_ACTUAL)


def exportar_csv_actual(imprimir_log=True):
    """
    Genera/actualiza data/reporte_clientes_actual.csv desde la base de datos.
    Pensado para cron o scheduler (sin input interactivo).
    """
    try:
        columnas, resultados, fecha_corte = ejecutar_consulta_reporte()
    except Exception as e:
        if imprimir_log:
            print(f"❌ Error consultando DB: {type(e).__name__} - {e}")
        raise
    if not resultados:
        if imprimir_log:
            print(f"⚠️ [{fecha_corte}] Sin clientes activos; no se actualizó el CSV.")
        return 0
    escribir_csv_actual(columnas, resultados)
    if imprimir_log:
        print(f"✅ [{datetime.now():%Y-%m-%d %H:%M}] CSV actualizado: {CSV_ACTUAL} ({len(resultados)} filas)")
    return len(resultados)


def reporte_clientes_hoy(interactivo=True):
    """Mantiene el flujo con tabla en consola; export opcional si interactivo."""
    from tabulate import tabulate

    fecha_corte = datetime.now().date()
    try:
        columnas, resultados, _ = ejecutar_consulta_reporte()
    except Exception as e:
        print(f"❌ Error: {type(e).__name__} - {e}")
        import traceback

        traceback.print_exc()
        return []

    print(f"📈 Reporte de métricas - Fecha de corte: {fecha_corte}\n")

    if not resultados:
        print("⚠️ No se encontraron clientes activos.")
        return []

    IDX_DEUDA = 12
    IDX_MORA = 14
    IDX_CUMPLIMIENTO = 15

    deuda_total = sum(float(r[IDX_DEUDA] or 0) for r in resultados)
    cumplimiento_prom = sum(float(r[IDX_CUMPLIMIENTO] or 0) for r in resultados) / len(resultados)
    mora_critica = sum(1 for r in resultados if float(r[IDX_MORA] or 0) > 30)

    print("=" * 110)
    print(f"📊 REPORTE GENERAL - {fecha_corte}")
    print("=" * 110)
    print(f"👥 Clientes activos: {len(resultados)}")
    print(f"💰 Deuda total: ${deuda_total:,.0f} COP")
    print(f"📈 Cumplimiento promedio: {cumplimiento_prom:.1f}%")
    print(f"🔴 Mora crítica (>30 días): {mora_critica}")
    print()

    headers = [
        "Cédula",
        "Placa",
        "Cliente",
        "Visitador",
        "Generadas",
        "Pagadas",
        "Pendientes",
        "Mora",
        "Deuda Total",
        "%",
        "Estado",
    ]
    rows = []
    for r in resultados:
        dias_mora = int(float(r[IDX_MORA] or 0))
        estado = (
            "✅ Al día"
            if dias_mora <= 7
            else "⚠️ Próximo"
            if dias_mora <= 15
            else "🟡 Mora leve"
            if dias_mora <= 30
            else "🔴 Mora crítica"
        )
        rows.append(
            [
                r[0],
                r[2] or "N/A",
                (r[1][:18] + "..") if r[1] and len(r[1]) > 18 else r[1],
                r[4] or "-",
                r[7],
                r[8],
                f"{float(r[10] or 0):.1f}",
                dias_mora,
                f"${int(float(r[IDX_DEUDA] or 0)):,}",
                f"{float(r[IDX_CUMPLIMIENTO] or 0):.1f}%",
                estado,
            ]
        )

    print(tabulate(rows, headers=headers, tablefmt="grid", stralign="right"))

    if interactivo:
        exportar = input("\n💾 ¿Exportar a CSV? (s/n): ").strip().lower()
        if exportar == "s":
            escribir_csv_actual(columnas, resultados)
            print(f"✅ Guardado: {CSV_ACTUAL}")
    else:
        escribir_csv_actual(columnas, resultados)
        print(f"✅ CSV fijo actualizado: {CSV_ACTUAL}")

    return resultados


if __name__ == "__main__":
    print("🚀 Iniciando reporte de clientes - Fecha: HOY")
    print("-" * 60)
    reporte_clientes_hoy(interactivo=True)
