# reporte_hoy.py — consulta DB y exporta CSV fijo para consulta_placa / web
import os
import csv
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

import db_defaults
from extracto_cliente import (
    RegistroExtracto,
    calcular_metricas_extracto,
    parse_dias_credito,
)

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


# Consultas equivalentes a `mostrar_registros` en `func extrac.txt`
SQL_CLIENTES_EXTRACTO = """
SELECT
    c.cedula,
    c.nombre,
    c.placa,
    c.telefono,
    c.visitador,
    c.fecha_inicio::date AS fecha_inicio,
    c.valor_cuota::numeric AS valor_cuota,
    c.fecha_final
FROM clientes c
WHERE c.estado = 'activo'
  AND c.fecha_inicio IS NOT NULL
  AND c.fecha_inicio <= CURRENT_DATE
  AND c.valor_cuota > 0
"""

SQL_REGISTROS_EXTRACTO = """
SELECT
    r.cedula,
    r.fecha_registro::date AS fecha_registro,
    r.valor::numeric AS valor,
    r.tipo,
    r.referencia
FROM registros r
WHERE r.cedula = ANY(%s)
ORDER BY r.cedula, r.fecha_registro
"""

COLUMNAS_REPORTE = [
    "cedula",
    "nombre",
    "placa",
    "telefono",
    "visitador",
    "fecha_inicio",
    "valor_cuota",
    "cuotas_generadas",
    "cuotas_completas",
    "cuotas_pagadas",
    "cuotas_pendientes",
    "total_pagado",
    "deuda_total",
    "ultimo_pago",
    "dias_mora",
    "cumplimiento_pct",
]


def ejecutar_consulta_reporte():
    """Carga clientes y registros; métricas con lógica del extracto (`func extrac.txt`)."""
    fecha_corte = datetime.now().date()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(SQL_CLIENTES_EXTRACTO)
        clientes = cursor.fetchall()
        if not clientes:
            return list(COLUMNAS_REPORTE), [], fecha_corte

        cedulas = [c[0] for c in clientes]
        cursor.execute(SQL_REGISTROS_EXTRACTO, (cedulas,))
        registros_rows = cursor.fetchall()

        registros_por_cedula: dict[str, list[RegistroExtracto]] = {}
        for cedula, fecha_reg, valor, tipo, referencia in registros_rows:
            registros_por_cedula.setdefault(cedula, []).append(
                RegistroExtracto(
                    fecha=fecha_reg,
                    valor=float(valor),
                    tipo=tipo or "",
                    referencia=referencia or "",
                )
            )

        filas = []
        for row in clientes:
            cedula, nombre, placa, telefono, visitador, fecha_inicio, valor_cuota = row[
                :7
            ]
            fecha_final = row[7] if len(row) > 7 else None
            valor_cuota = float(valor_cuota)
            regs = registros_por_cedula.get(cedula, [])
            m = calcular_metricas_extracto(
                fecha_inicio,
                valor_cuota,
                regs,
                dias_credito=parse_dias_credito(
                    str(fecha_final) if fecha_final is not None else None
                ),
            )
            filas.append(
                (
                    cedula,
                    nombre,
                    placa,
                    telefono,
                    visitador,
                    fecha_inicio.isoformat(),
                    int(round(valor_cuota)),
                    m.cuotas_generadas,
                    m.cuotas_completas,
                    round(m.cuotas_pagadas, 1),
                    round(m.cuotas_pendientes, 1),
                    int(round(m.total_pagado)),
                    int(round(m.deuda_total)),
                    m.ultimo_pago,
                    m.dias_mora,
                    m.cumplimiento_pct,
                )
            )

        filas.sort(
            key=lambda r: (
                float(r[15] or 0),
                -int(r[14] or 0),
                (r[1] or ""),
            )
        )
        return list(COLUMNAS_REPORTE), filas, fecha_corte
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
