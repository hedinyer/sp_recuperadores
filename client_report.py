"""
Reporte de extracto por cliente — consulta por PLACA con exportación a CSV.
Misma lógica que `mostrar_registros` en `func extrac.txt`.
Consulta tablas `clientes` y `registros` en PostgreSQL.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
from dataclasses import dataclass, asdict
from datetime import date, datetime, time, timedelta
from typing import Any, Sequence

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from tabulate import tabulate

import db_defaults

load_dotenv()

DIAS_CREDITO_DEFAULT = 365


def parse_dias_credito(fecha_final: str | None = None) -> int:
    raw = (fecha_final or "").strip()
    if raw.isdigit():
        n = int(raw)
        return n if n > 0 else DIAS_CREDITO_DEFAULT
    return DIAS_CREDITO_DEFAULT


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", db_defaults.DB_HOST),
        port=os.getenv("DB_PORT", db_defaults.DB_PORT),
        database=os.getenv("DB_NAME", db_defaults.DB_NAME),
        user=os.getenv("DB_USER", db_defaults.DB_USER),
        password=os.getenv("DB_PASSWORD", db_defaults.DB_PASSWORD),
    )


# 🔹 CONSULTAS MODIFICADAS PARA BUSCAR POR PLACA
SQL_CLIENTE_PLACA = """
SELECT
    c.cedula,
    c.nombre,
    c.placa,
    c.fecha_inicio::date,
    c.valor_cuota::numeric,
    c.fecha_final
FROM clientes c
WHERE c.placa IS NOT NULL
  AND TRIM(c.placa) <> ''
  AND LOWER(TRIM(c.placa)) = LOWER(TRIM(%s))
LIMIT 1
"""

SQL_REGISTROS_CLIENTE_PLACA = """
SELECT
    r.fecha_registro::date,
    r.valor::numeric,
    r.tipo,
    r.referencia
FROM registros r
WHERE r.cedula = (
    SELECT cedula FROM clientes 
    WHERE LOWER(TRIM(placa)) = LOWER(TRIM(%s))
    LIMIT 1
)
ORDER BY r.fecha_registro
"""

SQL_CLIENTES_ACTIVOS = """
SELECT
    c.cedula,
    c.nombre,
    c.placa,
    c.telefono,
    c.visitador,
    c.fecha_inicio::date,
    c.valor_cuota::numeric,
    c.fecha_final
FROM clientes c
WHERE c.estado = 'activo'
  AND c.fecha_inicio IS NOT NULL
  AND c.valor_cuota > 0
"""

SQL_REGISTROS_LOTE = """
SELECT
    r.cedula,
    r.fecha_registro::date,
    r.valor::numeric,
    r.tipo,
    r.referencia
FROM registros r
WHERE r.cedula = ANY(%s)
ORDER BY r.cedula, r.fecha_registro
"""


@dataclass(frozen=True)
class ResumenExtracto:
    cuotas_generadas: int
    cuotas_pagadas: float
    cuotas_pendientes: float
    valor_pendiente: float
    total_pagado: float


def _parse_fecha_inicio(fecha_inicio: date | datetime | str) -> datetime:
    if isinstance(fecha_inicio, datetime):
        return fecha_inicio
    if isinstance(fecha_inicio, date):
        return datetime.combine(fecha_inicio, time())
    return datetime.strptime(str(fecha_inicio), "%Y-%m-%d")


def _registros_a_tuplas(
  registros: Sequence[tuple[date | datetime, Any, str | None, str | None]],
) -> list[tuple[datetime, float, str, str]]:
    """Convierte filas DB al formato de `registros_modificados` en func extrac.txt."""
    out: list[tuple[datetime, float, str, str]] = []
    for fecha, valor, tipo, referencia in registros:
        if fecha is None or valor is None:
            continue
        if isinstance(fecha, datetime):
            fecha_dt = fecha
        else:
            fecha_dt = datetime.combine(fecha, time())
        out.append((fecha_dt, float(valor), tipo or "", referencia or ""))
    return out


def generar_dataframe_extracto(
    fecha_inicio: date | datetime | str,
    valor_cuota: float,
    registros: Sequence[tuple[date | datetime, Any, str | None, str | None]],
    dias_credito: int = DIAS_CREDITO_DEFAULT,
) -> pd.DataFrame:
    """
    Réplica línea a línea del bloque DataFrame en `mostrar_registros` (func extrac.txt).
    """
    valor_cuota = float(valor_cuota)
    if valor_cuota <= 0:
        raise ValueError("valor_cuota inválido")

    fecha_inicio_dt = _parse_fecha_inicio(fecha_inicio)
    fecha_fin_credito = fecha_inicio_dt + timedelta(days=dias_credito - 1)
    fecha_actual = datetime.today()
    if fecha_actual > fecha_fin_credito:
        fecha_actual = fecha_fin_credito

    registros_modificados = _registros_a_tuplas(registros)

    total = sum(row[1] for row in registros_modificados)
    cuotas_pagadas_ceil = math.ceil(total / valor_cuota) if total else 0

    dias_rango = (fecha_actual - fecha_inicio_dt).days + 1
    if cuotas_pagadas_ceil > dias_rango:
        diferencia = cuotas_pagadas_ceil - dias_rango
        fecha_extendida = fecha_actual + timedelta(days=diferencia)
        fecha_actual = min(fecha_extendida, fecha_fin_credito)

    fechas = pd.date_range(start=fecha_inicio_dt, end=fecha_actual)
    df = pd.DataFrame(
        {
            "Fecha Programada": fechas.strftime("%Y-%m-%d"),
            "Fecha Pago": "",
            "Valor Pagado": 0,
            "Tipo": "",
            "Referencia": "",
        }
    )

    saldo = 0
    pagos_idx = 0
    for i in range(len(df)):
        while pagos_idx < len(registros_modificados) and saldo < valor_cuota:
            registro_fecha, valor, tipo, referencia = registros_modificados[pagos_idx]
            while valor + saldo >= valor_cuota:
                falta_para_cuota = valor_cuota - saldo
                df.at[i, "Valor Pagado"] = (
                    df.at[i, "Valor Pagado"] if pd.notna(df.at[i, "Valor Pagado"]) else 0
                )
                df.at[i, "Valor Pagado"] += falta_para_cuota
                df.at[i, "Fecha Pago"] = registro_fecha
                if pd.isna(df.at[i, "Referencia"]) or df.at[i, "Referencia"] == "":
                    df.at[i, "Referencia"] = referencia
                if pd.isna(df.at[i, "Tipo"]) or df.at[i, "Tipo"] == "":
                    df.at[i, "Tipo"] = tipo
                valor -= falta_para_cuota
                saldo = 0
                i += 1
                if i >= len(df):
                    break

            saldo += valor
            if valor > 0:
                df.at[i, "Valor Pagado"] = (
                    df.at[i, "Valor Pagado"] if pd.notna(df.at[i, "Valor Pagado"]) else 0
                )
                df.at[i, "Valor Pagado"] += valor
                if pd.isna(df.at[i, "Tipo"]) or df.at[i, "Tipo"] == "":
                    df.at[i, "Tipo"] = tipo
            if saldo >= valor_cuota:
                df.at[i, "Fecha Pago"] = registro_fecha
                if pd.isna(df.at[i, "Referencia"]) or df.at[i, "Referencia"] == "":
                    df.at[i, "Referencia"] = referencia
                if pd.isna(df.at[i, "Tipo"]) or df.at[i, "Tipo"] == "":
                    df.at[i, "Tipo"] = tipo
                saldo -= valor_cuota
            else:
                pagos_idx += 1

    df["Fecha Programada"] = pd.to_datetime(df["Fecha Programada"])
    return df


def calcular_resumen_extracto(
    df: pd.DataFrame,
    valor_cuota: float,
    dias_credito: int = DIAS_CREDITO_DEFAULT,
    total_registros: float | None = None,
) -> ResumenExtracto:
    """Métricas posteriores al DataFrame (func extrac.txt)."""
    valor_cuota = float(valor_cuota)
    total = float(df["Valor Pagado"].sum())

    cuotas_pagadas_completas = int((df["Valor Pagado"] // valor_cuota).sum())
    remanente = (df["Valor Pagado"] % valor_cuota).sum()
    fraccion_cuota = remanente / valor_cuota
    cuotas_pagadas = cuotas_pagadas_completas + fraccion_cuota
    if total_registros is not None and total_registros > 0:
        cuotas_pagadas = max(cuotas_pagadas, total_registros / valor_cuota)
    cuotas_vencidas = min(len(df), dias_credito)
    cuotas_pendientes = max(0.0, cuotas_vencidas - cuotas_pagadas)
    valor_pendiente = cuotas_pendientes * valor_cuota

    return ResumenExtracto(
        cuotas_generadas=cuotas_vencidas,
        cuotas_pagadas=float(cuotas_pagadas),
        cuotas_pendientes=float(cuotas_pendientes),
        valor_pendiente=float(valor_pendiente),
        total_pagado=total,
    )


def cuotas_completas_desde_df(df: pd.DataFrame, valor_cuota: float) -> int:
    return int((df["Valor Pagado"] // float(valor_cuota)).sum())


def metricas_cliente_web(
    fecha_inicio: date | datetime | str,
    valor_cuota: float,
    registros: Sequence[tuple[date | datetime, Any, str | None, str | None]],
    dias_credito: int = DIAS_CREDITO_DEFAULT,
) -> dict[str, str | int | float]:
    """Métricas en el shape del CSV / API web."""
    valor_cuota = float(valor_cuota)
    df = generar_dataframe_extracto(
        fecha_inicio, valor_cuota, registros, dias_credito=dias_credito
    )
    total_reg = sum(float(x[1]) for x in registros if x[1] is not None)
    r = calcular_resumen_extracto(
        df, valor_cuota, dias_credito=dias_credito, total_registros=total_reg
    )
    regs_validos = [x for x in registros if x[0] is not None and x[1] is not None]
    ultimo_pago = max((x[0] for x in regs_validos), default=None)
    dias_mora = (
        (date.today() - ultimo_pago).days if ultimo_pago else r.cuotas_generadas
    )
    cumplimiento = (
        round(1000 * r.cuotas_pagadas / r.cuotas_generadas) / 10
        if r.cuotas_generadas > 0
        else 0.0
    )
    fi = fecha_inicio if isinstance(fecha_inicio, date) else _parse_fecha_inicio(fecha_inicio).date()
    return {
        "cuotas_generadas": r.cuotas_generadas,
        "cuotas_completas": cuotas_completas_desde_df(df, valor_cuota),
        "cuotas_pagadas": round(r.cuotas_pagadas, 1),
        "cuotas_pendientes": round(r.cuotas_pendientes, 1),
        "total_pagado": int(round(r.total_pagado)),
        "deuda_total": int(round(r.valor_pendiente)),
        "ultimo_pago": ultimo_pago.isoformat() if ultimo_pago else "",
        "dias_mora": dias_mora,
        "cumplimiento_pct": cumplimiento,
        "fecha_inicio": fi.isoformat(),
        "valor_cuota": int(round(valor_cuota)),
    }


def build_report_rows() -> list[dict[str, str]]:
    """Filas del reporte general para web/CSV (mismo formato que db_general)."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(SQL_CLIENTES_ACTIVOS)
        clientes = cur.fetchall()
        if not clientes:
            return []

        cedulas = [c[0] for c in clientes]
        cur.execute(SQL_REGISTROS_LOTE, (cedulas,))
        registros_rows = cur.fetchall()

        registros_por_cedula: dict[str, list] = {}
        for ced, fecha, valor, tipo, ref in registros_rows:
            registros_por_cedula.setdefault(ced, []).append((fecha, valor, tipo, ref))

        filas: list[dict[str, str]] = []
        for row in clientes:
            cedula, nombre, placa, telefono, visitador, fecha_inicio, valor_cuota = row[:7]
            fecha_final = row[7] if len(row) > 7 else None
            valor_cuota = float(valor_cuota)
            regs = registros_por_cedula.get(cedula, [])
            m = metricas_cliente_web(
                fecha_inicio,
                valor_cuota,
                regs,
                dias_credito=parse_dias_credito(
                    str(fecha_final) if fecha_final is not None else None
                ),
            )
            filas.append(
                {
                    "cedula": str(cedula),
                    "nombre": nombre or "",
                    "placa": placa or "",
                    "telefono": telefono or "",
                    "visitador": visitador or "",
                    "fecha_inicio": str(m["fecha_inicio"]),
                    "valor_cuota": str(m["valor_cuota"]),
                    "cuotas_generadas": str(m["cuotas_generadas"]),
                    "cuotas_completas": str(m["cuotas_completas"]),
                    "cuotas_pagadas": str(m["cuotas_pagadas"]),
                    "cuotas_pendientes": str(m["cuotas_pendientes"]),
                    "total_pagado": str(m["total_pagado"]),
                    "deuda_total": str(m["deuda_total"]),
                    "ultimo_pago": str(m["ultimo_pago"]),
                    "dias_mora": str(m["dias_mora"]),
                    "cumplimiento_pct": str(m["cumplimiento_pct"]),
                }
            )

        filas.sort(
            key=lambda x: (
                float(x.get("cumplimiento_pct") or 0),
                -int(x.get("dias_mora") or 0),
                x.get("nombre") or "",
            )
        )
        return filas
    finally:
        cur.close()
        conn.close()


def _formato_fecha_pago(valor_fecha_pago: Any) -> str:
    if pd.isna(valor_fecha_pago) or valor_fecha_pago == "":
        return ""
    if isinstance(valor_fecha_pago, datetime):
        return valor_fecha_pago.strftime("%d-%m-%Y")
    try:
        return datetime.strptime(str(valor_fecha_pago), "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        return str(valor_fecha_pago)


def _formato_cop(valor: float) -> str:
    return f"${valor:,.0f}".replace(",", ".")


# 🔹 FUNCIÓN: SANITIZAR NOMBRE DE ARCHIVO
def _sanitizar_nombre_archivo(nombre: str) -> str:
    """Elimina caracteres inválidos para nombres de archivo en cualquier SO."""
    # Reemplazar caracteres problemáticos por guión bajo
    nombre_limpio = re.sub(r'[<>:"/\\|?*]', '_', nombre)
    # Eliminar espacios extras y convertir a mayúsculas para consistencia
    return '_'.join(nombre_limpio.strip().upper().split())


# 🔹 FUNCIÓN: EXPORTAR EXTRACTO A CSV
def exportar_extracto_csv(
    placa: str,
    cliente: tuple[str, str, str, date, float],
    df: pd.DataFrame,
    resumen: ResumenExtracto,
    ruta_salida: str = "."
) -> str:
    """
    Exporta el extracto del cliente a CSV con formato: informe_placa_XXXXXX.csv
    
    El CSV incluye:
    - Hoja 1: Resumen financiero (métricas clave)
    - Hoja 2: Detalle diario de pagos programados vs realizados
    """
    cedula_db, nombre, placa_db, fecha_inicio, valor_cuota = cliente
    
    # Nombre del archivo: informe_placa_XXXXXX.csv
    placa_limpia = _sanitizar_nombre_archivo(placa_db or placa)
    nombre_archivo = f"informe_placa_{placa_limpia}.csv"
    ruta_completa = os.path.join(ruta_salida, nombre_archivo)
    
    # Preparar DataFrame de resumen
    resumen_data = {
        "Campo": [
            "Cédula",
            "Nombre",
            "Placa",
            "Fecha de inicio",
            "Valor de cuota",
            "Cuotas generadas",
            "Cuotas pagadas",
            "Cuotas pendientes",
            "Total pagado",
            "Deuda total",
            "Fecha de generación",
        ],
        "Valor": [
            cedula_db,
            nombre or "",
            placa_db or "",
            fecha_inicio.strftime("%Y-%m-%d"),
            f"${valor_cuota:,.0f}".replace(",", "."),
            resumen.cuotas_generadas,
            f"{resumen.cuotas_pagadas:.1f}",
            f"{resumen.cuotas_pendientes:.1f}",
            f"${resumen.total_pagado:,.0f}".replace(",", "."),
            f"${resumen.valor_pendiente:,.0f}".replace(",", "."),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ]
    }
    df_resumen = pd.DataFrame(resumen_data)
    
    # Preparar DataFrame de detalle (formateado para CSV)
    df_detalle = df.copy()
    df_detalle["Fecha Programada"] = df_detalle["Fecha Programada"].dt.strftime("%d-%m-%Y")
    df_detalle["Fecha Pago"] = df_detalle["Fecha Pago"].apply(_formato_fecha_pago)
    df_detalle["Valor Pagado"] = df_detalle["Valor Pagado"].apply(
        lambda x: f"${x:,.0f}".replace(",", ".") if pd.notna(x) and x > 0 else ""
    )
    
    # Exportar a CSV con dos secciones separadas por líneas en blanco
    with open(ruta_completa, "w", encoding="utf-8-sig") as f:
        # Sección 1: Resumen
        f.write("=== RESUMEN FINANCIERO ===\n")
        df_resumen.to_csv(f, index=False, sep=";", encoding="utf-8-sig")
        f.write("\n")
        
        # Sección 2: Detalle
        f.write("=== DETALLE DE PAGOS ===\n")
        df_detalle.to_csv(f, index=False, sep=";", encoding="utf-8-sig", float_format="%.2f")
    
    return ruta_completa


# 🔹 FUNCIÓN MODIFICADA: CARGAR CLIENTE POR PLACA
def cargar_cliente_y_registros_por_placa(placa: str) -> tuple[
    tuple[str, str, str, date, float, int],
    list[tuple[date, float, str | None, str | None]],
]:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(SQL_CLIENTE_PLACA, (placa.strip(),))
        cliente = cur.fetchone()
        if not cliente:
            raise LookupError(f"Cliente con placa '{placa}' no encontrado.")

        cedula_db, nombre, placa_db, fecha_inicio, valor_cuota, fecha_final = cliente
        if not fecha_inicio or not valor_cuota:
            raise ValueError("Datos del cliente incompletos.")

        cur.execute(SQL_REGISTROS_CLIENTE_PLACA, (placa.strip(),))
        registros = cur.fetchall()
        dias_credito = parse_dias_credito(
            str(fecha_final) if fecha_final is not None else None
        )
        return (
            cedula_db,
            nombre,
            placa_db,
            fecha_inicio,
            float(valor_cuota),
            dias_credito,
        ), list(registros)
    finally:
        cur.close()
        conn.close()


# 🔹 FUNCIÓN MODIFICADA: EXTRACTO POR PLACA
def extracto_cliente_por_placa(placa: str) -> tuple[
    tuple[str, str, str, date, float, int],
    pd.DataFrame,
    ResumenExtracto,
]:
    cliente, registros = cargar_cliente_y_registros_por_placa(placa)
    _, _, _, fecha_inicio, valor_cuota, dias_credito = cliente
    df = generar_dataframe_extracto(
        fecha_inicio, valor_cuota, registros, dias_credito=dias_credito
    )
    total_reg = sum(float(x[1]) for x in registros if x[1] is not None)
    resumen = calcular_resumen_extracto(
        df, valor_cuota, dias_credito=dias_credito, total_registros=total_reg
    )
    return cliente, df, resumen


# 🔹 FUNCIÓN MODIFICADA: IMPRIMIR EXTRACTO POR PLACA
def imprimir_extracto_cliente_por_placa(placa: str) -> None:
    try:
        (cedula_db, nombre, placa_db, fecha_inicio, valor_cuota), df, resumen = extracto_cliente_por_placa(placa)
    except LookupError as e:
        print(f"❌ {e}")
        return
    except ValueError as e:
        print(f"❌ {e}")
        return
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        return

    print("\n" + "=" * 72)
    print("Extracto de pagos")
    print("=" * 72)

    print("\n--- Información del cliente ---")
    print(f"Cédula: {cedula_db}")
    print(f"Nombre: {nombre}")
    print(f"Placa: {placa_db}")
    print(f"Fecha inicio: {fecha_inicio}")
    print(f"Valor cuota: {_formato_cop(valor_cuota)}")

    print("\n--- Estado financiero ---")
    print(f"Cuotas generadas: {resumen.cuotas_generadas}")
    print(f"Cuotas pagadas: {resumen.cuotas_pagadas:.1f}")
    print(f"Cuotas pendientes: {resumen.cuotas_pendientes:.1f}")
    print(f"Valor para estar al día: {_formato_cop(resumen.valor_pendiente)}")

    filas_tabla = []
    for _, row in df.iterrows():
        filas_tabla.append(
            [
                row["Fecha Programada"].strftime("%d-%m-%Y"),
                _formato_fecha_pago(row["Fecha Pago"]),
                row["Valor Pagado"],
                row["Tipo"],
                row["Referencia"],
            ]
        )

    print("\n--- Detalle por día ---")
    print(
        tabulate(
            filas_tabla,
            headers=["Fecha Programada", "Fecha Pago", "Valor Pagado", "Tipo", "Referencia"],
            tablefmt="grid",
        )
    )


# 🔹 NUEVA FUNCIÓN: EXTRAER Y EXPORTAR A CSV
def extraer_y_exportar_csv(placa: str, ruta_salida: str = ".") -> bool:
    """
    Obtiene el extracto del cliente por placa y lo exporta a CSV.
    Retorna True si la exportación fue exitosa.
    """
    try:
        cliente, df, resumen = extracto_cliente_por_placa(placa)
        ruta_archivo = exportar_extracto_csv(placa, cliente, df, resumen, ruta_salida)
        
        print(f"\n✅ Archivo exportado exitosamente:")
        print(f"   📄 {os.path.abspath(ruta_archivo)}")
        print(f"   📊 Tamaño: {os.path.getsize(ruta_archivo) / 1024:.1f} KB")
        return True
        
    except LookupError as e:
        print(f"❌ {e}")
    except ValueError as e:
        print(f"❌ {e}")
    except PermissionError:
        print(f"❌ Error de permisos: no se puede escribir en '{ruta_salida}'")
    except Exception as e:
        print(f"❌ Error inesperado al exportar: {e}")
    
    return False


def ejecutar_reporte_general() -> list[tuple]:
    """Métricas de todos los clientes activos con la misma lógica del extracto."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(SQL_CLIENTES_ACTIVOS)
        clientes = cur.fetchall()
        if not clientes:
            print("⚠️ No se encontraron clientes activos.")
            return []

        cedulas = [c[0] for c in clientes]
        cur.execute(SQL_REGISTROS_LOTE, (cedulas,))
        registros_rows = cur.fetchall()

        registros_por_cedula: dict[str, list] = {}
        for ced, fecha, valor, tipo, ref in registros_rows:
            registros_por_cedula.setdefault(ced, []).append((fecha, valor, tipo, ref))

        resultados = []
        for row in clientes:
            cedula, nombre, placa, telefono, visitador, fecha_inicio, valor_cuota = row[:7]
            fecha_final = row[7] if len(row) > 7 else None
            valor_cuota = float(valor_cuota)
            regs = registros_por_cedula.get(cedula, [])
            m = metricas_cliente_web(
                fecha_inicio,
                valor_cuota,
                regs,
                dias_credito=parse_dias_credito(
                    str(fecha_final) if fecha_final is not None else None
                ),
            )
            resultados.append(
                (
                    cedula,
                    nombre,
                    placa,
                    telefono,
                    visitador,
                    m["fecha_inicio"],
                    m["valor_cuota"],
                    m["cuotas_generadas"],
                    m["cuotas_completas"],
                    m["cuotas_pagadas"],
                    m["cuotas_pendientes"],
                    m["total_pagado"],
                    m["deuda_total"],
                    m["ultimo_pago"],
                    m["dias_mora"],
                    m["cumplimiento_pct"],
                )
            )

        resultados.sort(key=lambda x: (float(x[15] or 0), -int(x[14] or 0), x[1] or ""))

        deuda_total = sum(r[12] for r in resultados)
        cumpl_prom = sum(r[15] for r in resultados) / len(resultados)

        print(f"\n📈 Reporte general — {date.today()}\n")
        print("=" * 100)
        print(f"👥 Clientes: {len(resultados)}")
        print(f"💰 Deuda total (extracto): {_formato_cop(deuda_total)}")
        print(f"📊 Cumplimiento promedio: {cumpl_prom:.1f}%")
        print()

        rows = []
        for r in resultados:
            dias_mora = int(r[14])
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
                    r[9],
                    f"{r[10]:.1f}",
                    dias_mora,
                    f"${int(r[12]):,}",
                    f"{r[15]:.1f}%",
                    estado,
                ]
            )

        print(
            tabulate(
                rows,
                headers=[
                    "Cédula",
                    "Placa",
                    "Cliente",
                    "Visitador",
                    "Generadas",
                    "Pagadas",
                    "Pendientes",
                    "Mora",
                    "Deuda",
                    "%",
                    "Estado",
                ],
                tablefmt="grid",
                stralign="right",
            )
        )
        return resultados
    finally:
        cur.close()
        conn.close()


# 🔹 MENÚ PRINCIPAL ACTUALIZADO CON OPCIONES DE EXPORTACIÓN
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        print(json.dumps(build_report_rows(), ensure_ascii=False))
        sys.exit(0)

    # Soporte para exportar directamente desde línea de comandos:
    # python script.py --csv ABC123
    if len(sys.argv) == 3 and sys.argv[1] == "--csv":
        placa_arg = sys.argv[2].strip()
        print(f"🔄 Generando informe para placa: {placa_arg}")
        if extraer_y_exportar_csv(placa_arg):
            sys.exit(0)
        else:
            sys.exit(1)

    print("📋 REPORTE DE CLIENTES (lógica extracto)")
    print("=" * 60)
    while True:
        print("\nOpciones:")
        print("  1. Ver extracto de un cliente (por placa) 🔍")
        print("  2. Exportar extracto a CSV 📥 (informe_placa_XXXXXX.csv)")
        print("  3. Reporte general (todos los activos) 📊")
        print("  4. Salir 👋")
        
        opcion = input("\n👉 Tu elección: ").strip()
        
        if opcion == "1":
            placa = input("🚗 Placa del vehículo: ").strip()
            if placa:
                imprimir_extracto_cliente_por_placa(placa)
                
        elif opcion == "2":
            placa = input("🚗 Placa del vehículo a exportar: ").strip()
            if placa:
                # Opcional: especificar ruta de salida
                ruta = input("📁 Ruta de salida (Enter para carpeta actual): ").strip()
                ruta = ruta if ruta else "."
                extraer_y_exportar_csv(placa, ruta)
                
        elif opcion == "3":
            ejecutar_reporte_general()
            
        elif opcion == "4":
            print("👋 ¡Hasta luego!")
            break
        else:
            print("⚠️ Opción no válida. Intenta de nuevo.")