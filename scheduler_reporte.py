#!/usr/bin/env python3
"""
Ejecuta exportar_csv_actual cada 30 minutos entre las 06:00 y las 18:00 (hora local).

Uso:
  python scheduler_reporte.py

Requiere que el proceso siga en marcha (servidor, tmux, systemd, etc.).
Alternativa: cron cada 30 min que llame a `python -c "from db_general import exportar_csv_actual; exportar_csv_actual()"`
y valide la ventana horaria en exportar_csv_actual — aquí la ventana la impone `schedule`.
"""
import schedule
import time

from db_general import exportar_csv_actual


def job():
    try:
        exportar_csv_actual(imprimir_log=True)
    except Exception as e:
        print(f"❌ [{time.strftime('%H:%M:%S')}] Falló la actualización: {e}")


def registrar_horarios():
    """De 06:00 a 17:30 cada 30 min, más 18:00."""
    for h in range(6, 18):
        for m in (0, 30):
            schedule.every().day.at(f"{h:02d}:{m:02d}").do(job)
    schedule.every().day.at("18:00").do(job)


if __name__ == "__main__":
    registrar_horarios()
    print("⏰ Scheduler activo: actualización cada 30 min (06:00–18:00, hora local).")
    print("   Archivo: data/reporte_clientes_actual.csv")
    print("   Ctrl+C para detener.\n")
    while True:
        schedule.run_pending()
        time.sleep(15)
