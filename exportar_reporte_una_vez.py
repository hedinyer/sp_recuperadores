#!/usr/bin/env python3
"""Útil para cron: una ejecución que actualiza el CSV si estamos en ventana 06:00–18:00."""
from datetime import datetime

from db_general import exportar_csv_actual


def en_ventana_diaria(ahora: datetime | None = None) -> bool:
    ahora = ahora or datetime.now()
    mins = ahora.hour * 60 + ahora.minute
    return 6 * 60 <= mins <= 18 * 60


if __name__ == "__main__":
    if not en_ventana_diaria():
        print(
            f"⏭️ Fuera de ventana (06:00–18:00). Hora local: {datetime.now():%H:%M}. No se exporta."
        )
        raise SystemExit(0)
    n = exportar_csv_actual(imprimir_log=True)
    raise SystemExit(0 if n >= 0 else 1)
