"""
Métricas del extracto — misma lógica que `mostrar_registros` en `func extrac.txt`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Sequence

DIAS_CREDITO_DEFAULT = 365


def parse_dias_credito(fecha_final: str | None = None) -> int:
    raw = (fecha_final or "").strip()
    if raw.isdigit():
        n = int(raw)
        return n if n > 0 else DIAS_CREDITO_DEFAULT
    return DIAS_CREDITO_DEFAULT


@dataclass(frozen=True)
class RegistroExtracto:
    fecha: date
    valor: float
    tipo: str = ""
    referencia: str = ""


@dataclass(frozen=True)
class MetricasExtracto:
    cuotas_generadas: int
    cuotas_completas: int
    cuotas_pagadas: float
    cuotas_pendientes: float
    total_pagado: float
    deuda_total: float
    ultimo_pago: str
    dias_mora: int
    cumplimiento_pct: float


def _as_date(d: date | datetime) -> date:
    if isinstance(d, datetime):
        return d.date()
    return d


def _days_between(a: date, b: date) -> int:
    return (b - a).days


def calcular_metricas_extracto(
    fecha_inicio: date | datetime,
    valor_cuota: float,
    registros: Sequence[RegistroExtracto],
    dias_credito: int = DIAS_CREDITO_DEFAULT,
) -> MetricasExtracto:
    """Replica el reparto de pagos por día del DataFrame en `func extrac.txt`."""
    if valor_cuota <= 0:
        raise ValueError("valor_cuota inválido")

    inicio = _as_date(fecha_inicio)
    fecha_fin_credito = inicio + timedelta(days=dias_credito - 1)
    fin = date.today()
    if fin > fecha_fin_credito:
        fin = fecha_fin_credito

    total = sum(r.valor for r in registros)
    cuotas_pagadas_ceil = math.ceil(total / valor_cuota) if total else 0

    dias_rango = _days_between(inicio, fin) + 1
    if cuotas_pagadas_ceil > dias_rango:
        fin_extendido = fin + timedelta(days=cuotas_pagadas_ceil - dias_rango)
        fin = min(fin_extendido, fecha_fin_credito)

    n = _days_between(inicio, fin) + 1
    valor_pagado = [0.0] * n

    registros_list = [
        RegistroExtracto(
            fecha=_as_date(r.fecha),
            valor=float(r.valor),
            tipo=r.tipo or "",
            referencia=r.referencia or "",
        )
        for r in registros
    ]

    saldo = 0.0
    pagos_idx = 0

    for i in range(n):
        while pagos_idx < len(registros_list) and saldo < valor_cuota:
            valor = registros_list[pagos_idx].valor

            while valor + saldo >= valor_cuota:
                falta_para_cuota = valor_cuota - saldo
                valor_pagado[i] += falta_para_cuota
                valor -= falta_para_cuota
                saldo = 0.0
                i += 1
                if i >= n:
                    break

            if i >= n:
                break

            saldo += valor
            if valor > 0:
                valor_pagado[i] += valor
            if saldo >= valor_cuota:
                saldo -= valor_cuota
            else:
                pagos_idx += 1

    cuotas_pagadas_completas = 0
    remanente = 0.0
    for v in valor_pagado:
        cuotas_pagadas_completas += int(v // valor_cuota)
        remanente += v % valor_cuota

    fraccion_cuota = remanente / valor_cuota
    cuotas_pagadas = cuotas_pagadas_completas + fraccion_cuota
    if total > 0:
        cuotas_pagadas = max(cuotas_pagadas, total / valor_cuota)
    cuotas_vencidas = min(n, dias_credito)
    cuotas_pendientes = max(0.0, cuotas_vencidas - cuotas_pagadas)
    valor_pendiente = cuotas_pendientes * valor_cuota

    ultimo_pago = ""
    if registros_list:
        ultimo_pago = max(r.fecha for r in registros_list).isoformat()

    dias_mora = (
        _days_between(date.fromisoformat(ultimo_pago), fin) if ultimo_pago else cuotas_vencidas
    )

    cumplimiento_pct = (
        round(1000 * cuotas_pagadas / cuotas_vencidas) / 10 if cuotas_vencidas > 0 else 0.0
    )

    return MetricasExtracto(
        cuotas_generadas=cuotas_vencidas,
        cuotas_completas=cuotas_pagadas_completas,
        cuotas_pagadas=cuotas_pagadas,
        cuotas_pendientes=cuotas_pendientes,
        total_pagado=total,
        deuda_total=valor_pendiente,
        ultimo_pago=ultimo_pago,
        dias_mora=dias_mora,
        cumplimiento_pct=cumplimiento_pct,
    )
