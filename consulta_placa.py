# consulta_placa_csv.py
import os
import pandas as pd
from datetime import datetime

from db_general import CSV_ACTUAL

# Opcional: REPORTE_CSV_PATH=/ruta/custom.csv
def _ruta_csv():
    return os.environ.get("REPORTE_CSV_PATH", CSV_ACTUAL)


def consultar_por_placa(archivo_csv, placa_busqueda):
    """Busca y muestra info de una placa desde el CSV"""
    
    try:
        # Leer CSV (una sola vez al inicio)
        df = pd.read_csv(archivo_csv, sep=';', encoding='utf-8-sig')
        
        # Normalizar placa para búsqueda case-insensitive
        df['placa_upper'] = df['placa'].astype(str).str.upper().str.strip()
        placa_busqueda = placa_busqueda.upper().strip()
        
        # Buscar
        resultado = df[df['placa_upper'] == placa_busqueda]
        
        if resultado.empty:
            print(f"❌ No se encontró la placa: `{placa_busqueda}`")
            return None
        
        # Obtener primera coincidencia
        row = resultado.iloc[0]
        
        # 🖨️ Mostrar información formateada
        print("\n" + "="*60)
        print(f"🏍️  FICHA TÉCNICA - PLACA: {row['placa'].upper()}")
        print("="*60)
        print(f"👤 Nombre:      {row['nombre']}")
        print(f"🆔 Cédula:      {row['cedula']}")
        print(f"📞 Teléfono:    {row['telefono'] if pd.notna(row['telefono']) else 'N/A'}")
        print(f"👨‍ Visitador:   {row['visitador'] if pd.notna(row['visitador']) else 'N/A'}")
        print(f"📅 Inicio:      {row['fecha_inicio']}")
        print(f"💰 Valor Cuota: ${int(row['valor_cuota']):,} COP")
        print("-"*60)
        print("📊 MÉTRICAS FINANCIERAS:")
        print(f"   📈 Cuotas Generadas:  {int(row['cuotas_generadas'])}")
        print(f"   ✅ Cuotas Pagadas:    {row['cuotas_pagadas']}")
        print(f"   ⏳ Cuotas Pendientes: {row['cuotas_pendientes']}")
        print(f"   💵 Total Pagado:      ${int(row['total_pagado']):,}")
        print(f"   🔗 Deuda Total:       ${int(row['deuda_total']):,}")
        print(f"   📅 Último Pago:       {row['ultimo_pago'] if pd.notna(row['ultimo_pago']) else 'NUNCA'}")
        print(f"   🗓️ Días de Mora:      {int(row['dias_mora'])}")
        print(f"   📉 Cumplimiento:      {row['cumplimiento_pct']}%")
        
        # 🚦 Estado visual
        dias = int(row['dias_mora'])
        if dias <= 7: estado = "✅ AL DÍA"
        elif dias <= 15: estado = "⚠️ PRÓXIMO A VENCER"
        elif dias <= 30: estado = "🟡 MORA LEVE"
        else: estado = "🔴 MORA CRÍTICA"
        print(f"   🚦 ESTADO: {estado}")
        print("="*60 + "\n")
        
        return row
        
    except FileNotFoundError:
        print(f"❌ Error: No se encontró el archivo '{archivo_csv}'")
        print("💡 Ejecuta `python exportar_reporte_una_vez.py` o `python scheduler_reporte.py`.")
        return None
    except Exception as e:
        print(f"❌ Error: {type(e).__name__} - {e}")
        return None

def main():
    archivo = _ruta_csv()

    print("🔍 CONSULTA RÁPIDA POR PLACA (desde CSV)")
    print(f"📁 Archivo: {archivo}")
    print("Escribe 'q' o 'salir' para terminar.\n")
    
    # Verificar si existe el archivo
    try:
        df = pd.read_csv(archivo, sep=';', encoding='utf-8-sig')
        print(f"✅ {len(df):,} clientes cargados en memoria\n")
    except FileNotFoundError:
        print(f"❌ No se encontró: {archivo}")
        print("💡 Genera el CSV con: python db_general.py (exporta si eliges 's')")
        print("   o deja corriendo: python scheduler_reporte.py")
        return
    
    # Bucle interactivo
    while True:
        placa = input("🏍️ Ingresa la placa: ").strip()
        
        if placa.lower() in ('q', 'salir', 'quit', ''):
            if placa.lower() in ('q', 'salir', 'quit'):
                print("👋 ¡Hasta luego!")
            break
        
        if placa:
            consultar_por_placa(archivo, placa)

if __name__ == "__main__":
    main()