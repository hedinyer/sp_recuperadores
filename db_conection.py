# metrics_report.py - VERSIÓN CORREGIDA PARA POSTGRESQL
import os
import psycopg2
from datetime import datetime, timedelta
from dotenv import load_dotenv
from tabulate import tabulate

import db_defaults

load_dotenv()

def get_connection():
    """Retorna conexión a la BD"""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", db_defaults.DB_HOST),
        port=os.getenv("DB_PORT", db_defaults.DB_PORT),
        database=os.getenv("DB_NAME", db_defaults.DB_NAME),
        user=os.getenv("DB_USER", db_defaults.DB_USER),
        password=os.getenv("DB_PASSWORD", db_defaults.DB_PASSWORD),
    )

def generar_reporte_métricas(fecha_corte=None):
    """
    Genera reporte de métricas por cliente con casts explícitos para PostgreSQL
    """
    if fecha_corte is None:
        fecha_corte = datetime.now().date()
    
    conn = get_connection()
    cursor = conn.cursor()
    
    print(f"📈 Generando reporte de métricas al: {fecha_corte}\n")
    
    # Query corregido con CASTs explícitos para PostgreSQL
    query = """
    WITH clientes_activos AS (
        SELECT 
            c.cedula,
            c.nombre,
            c.telefono,
            c.placa,
            c.fecha_inicio::date as fecha_inicio,
            c.tipo_contrato,
            c.valor_cuota,
            c.estado,
            COALESCE(c.otras_deudas, 0) as otras_deudas,
            -- Calcular cuotas pactadas: fecha_final es TEXT que contiene número de días
            CASE 
                WHEN c.fecha_final ~ '^[0-9]+$' THEN c.fecha_final::integer
                ELSE 365  -- default si no es número
            END AS cuotas_pactadas,
            -- Días desde inicio de contrato (CAST explícito)
            (CURRENT_DATE - c.fecha_inicio::date)::integer AS dias_desde_inicio
        FROM clientes c
        WHERE c.estado = 'activo'
    ),
    pagos_por_cliente AS (
        SELECT 
            cedula,
            COUNT(*) as total_pagos,
            SUM(valor) as total_pagado,
            MAX(fecha_registro::date) as ultimo_pago,
            AVG(valor) as promedio_pago
        FROM registros
        WHERE tipo NOT ILIKE '%anulacion%' 
        GROUP BY cedula
    ),
    metricas AS (
        SELECT 
            ca.*,
            COALESCE(ppc.total_pagos, 0) as cuotas_pagadas,
            COALESCE(ppc.total_pagado, 0) as monto_total_pagado,
            COALESCE(ppc.ultimo_pago, ca.fecha_inicio) as fecha_ultimo_pago,
            COALESCE(ppc.promedio_pago, ca.valor_cuota) as promedio_pago,
            -- Cuotas pendientes
            GREATEST(0, ca.cuotas_pactadas - COALESCE(ppc.total_pagos, 0)) as cuotas_pendientes,
            -- Días sin pagar (mora) - CAST explícito
            (CURRENT_DATE - COALESCE(ppc.ultimo_pago, ca.fecha_inicio))::integer as dias_mora,
            -- Deuda estimada
            GREATEST(0, (ca.cuotas_pactadas - COALESCE(ppc.total_pagos, 0)) * ca.valor_cuota) as deuda_cuotas,
            -- Deuda total
            GREATEST(0, (ca.cuotas_pactadas - COALESCE(ppc.total_pagos, 0)) * ca.valor_cuota + ca.otras_deudas) as deuda_total,
            -- % de cumplimiento (evitar división por cero)
            CASE 
                WHEN ca.cuotas_pactadas > 0 
                THEN ROUND(100.0 * COALESCE(ppc.total_pagos, 0) / ca.cuotas_pactadas, 1)
                ELSE 0 
            END as cumplimiento_pct
        FROM clientes_activos ca
        LEFT JOIN pagos_por_cliente ppc ON ca.cedula = ppc.cedula
    )
    SELECT 
        cedula,
        nombre,
        telefono,
        placa,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
        tipo_contrato,
        valor_cuota,
        cuotas_pactadas,
        cuotas_pagadas,
        cuotas_pendientes,
        dias_desde_inicio,
        dias_mora,
        TO_CHAR(fecha_ultimo_pago, 'YYYY-MM-DD') as ultimo_pago,
        ROUND(monto_total_pagado::numeric, 0) as monto_total_pagado,
        ROUND(promedio_pago::numeric, 0) as promedio_pago,
        ROUND(deuda_cuotas::numeric, 0) as deuda_cuotas,
        ROUND(otras_deudas::numeric, 0) as otras_deudas,
        ROUND(deuda_total::numeric, 0) as deuda_total,
        cumplimiento_pct,
        CASE 
            WHEN dias_mora <= 0 THEN '✅ Al día'
            WHEN dias_mora <= 7 THEN '⚠️ Pronto a vencer'
            WHEN dias_mora <= 15 THEN '🟡 Mora leve'
            WHEN dias_mora <= 30 THEN '🟠 Mora media'
            ELSE '🔴 Mora crítica'
        END as estado_mora
    FROM metricas
    ORDER BY 
        cumplimiento_pct ASC,
        dias_mora DESC,
        nombre;
    """
    
    try:
        cursor.execute(query)
        columnas = [desc[0] for desc in cursor.description]
        resultados = cursor.fetchall()
        
        if not resultados:
            print("⚠️ No se encontraron clientes activos con métricas.")
            return []
        
        # Resumen ejecutivo
        print("="*100)
        print("📋 RESUMEN EJECUTIVO")
        print("="*100)
        print(f"Total clientes analizados: {len(resultados)}")
        
        total_deuda = sum(r[17] or 0 for r in resultados)
        cumplimiento_promedio = sum(r[18] or 0 for r in resultados) / len(resultados) if resultados else 0
        clientes_mora = sum(1 for r in resultados if (r[11] or 0) > 15)
        
        print(f"💰 Deuda total estimada: ${total_deuda:,.0f} COP")
        print(f"📊 Cumplimiento promedio: {cumplimiento_promedio:.1f}%")
        print(f"🔴 Clientes en mora (>15 días): {clientes_mora}")
        print()
        
        # Tabla con métricas principales
        print("📦 DETALLE POR CLIENTE:")
        print("-"*100)
        
        headers = [
            "Cédula", "Cliente", "Cuotas\nPactadas", "Cuotas\nPagadas", 
            "Pendientes", "Días\nMora", "Deuda\nTotal", "Cumplimiento", "Estado"
        ]
        
        rows = []
        for r in resultados:
            rows.append([
                r[0],  # cedula
                (r[1][:25] + "...") if r[1] and len(str(r[1])) > 25 else r[1],
                r[7], r[8], r[9], r[11],
                f"${int(r[17] or 0):,}",
                f"{r[18]}%" if r[18] is not None else "N/A",
                r[19]
            ])
        
        print(tabulate(rows, headers=headers, tablefmt="grid", stralign="right"))
        
        # Exportar opcional
        print("\n" + "="*100)
        exportar = input("¿Exportar reporte completo a CSV? (s/n): ").strip().lower()
        if exportar == 's':
            exportar_a_csv(resultados, columnas, f"reporte_metricas_{fecha_corte}.csv")
            print("✅ Archivo exportado exitosamente.")
        
        return resultados
        
    except psycopg2.Error as e:
        print(f"❌ Error de PostgreSQL: {e.pgerror or e}")
        return []
    except Exception as e:
        print(f"❌ Error inesperado: {type(e).__name__} - {e}")
        return []
    finally:
        cursor.close()
        conn.close()

def exportar_a_csv(datos, columnas, nombre_archivo):
    """Exporta los resultados a CSV"""
    import csv
    with open(nombre_archivo, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(columnas)
        for fila in datos:
            # Convertir None a vacío y manejar tipos
            fila_limpia = ['' if v is None else v for v in fila]
            writer.writerow(fila_limpia)

def reporte_clientes_criticos(limite_dias_mora=15):
    """Reporte enfocado en clientes con mora crítica - versión corregida"""
    conn = get_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT 
        c.cedula,
        c.nombre,
        c.telefono,
        c.valor_cuota,
        MAX(r.fecha_registro::date) as ultimo_pago,
        (CURRENT_DATE - COALESCE(MAX(r.fecha_registro::date), c.fecha_inicio::date))::integer as dias_mora,
        COUNT(r.id) as pagos_realizados
    FROM clientes c
    LEFT JOIN registros r ON c.cedula = r.cedula 
        AND r.tipo NOT ILIKE '%anulacion%'
    WHERE c.estado = 'activo'
    GROUP BY c.cedula, c.nombre, c.telefono, c.valor_cuota, c.fecha_inicio
    HAVING (CURRENT_DATE - COALESCE(MAX(r.fecha_registro::date), c.fecha_inicio::date))::integer > %s
        OR MAX(r.fecha_registro) IS NULL
    ORDER BY dias_mora DESC NULLS FIRST;
    """
    
    print(f"🚨 CLIENTES CON MORA > {limite_dias_mora} días:\n")
    
    cursor.execute(query, (limite_dias_mora,))
    resultados = cursor.fetchall()
    
    if resultados:
        headers = ["Cédula", "Cliente", "Teléfono", "Cuota", "Último Pago", "Días Mora", "Pagos"]
        rows = []
        for r in resultados:
            rows.append([
                r[0], 
                (r[1][:30] + "...") if r[1] and len(r[1]) > 30 else r[1], 
                r[2], 
                f"${int(r[3] or 0):,}", 
                r[4].strftime('%Y-%m-%d') if r[4] else "NUNCA", 
                int(r[5]) if r[5] is not None else "∞", 
                r[6]
            ])
        print(tabulate(rows, headers=headers, tablefmt="grid"))
        print(f"\n📌 Total clientes en mora crítica: {len(resultados)}")
    else:
        print("✅ ¡Excelente! No hay clientes con mora crítica.")
    
    cursor.close()
    conn.close()
    return resultados

# === MENÚ PRINCIPAL ===
if __name__ == "__main__":
    print("🎯 SISTEMA DE MÉTRICAS DE COBRO")
    print("="*60)
    
    while True:
        print("\n📋 Opciones:")
        print("  1. 📊 Reporte completo de métricas por cliente")
        print("  2. 🚨 Solo clientes en mora crítica")
        print("  3. 🔍 Buscar cliente específico por cédula")
        print("  4. ❌ Salir")
        
        opcion = input("\n👉 Tu elección: ").strip()
        
        if opcion == "1":
            generar_reporte_métricas()
        elif opcion == "2":
            dias = input("¿Días de mora para considerar crítico? [15]: ").strip()
            dias = int(dias) if dias.isdigit() else 15
            reporte_clientes_criticos(dias)
        elif opcion == "3":
            cedula = input("Ingresa la cédula a consultar: ").strip()
            if cedula:
                conn = get_connection()
                cursor = conn.cursor()
                
                # Datos básicos del cliente
                cursor.execute("""
                    SELECT nombre, telefono, valor_cuota, estado, otras_deudas, fecha_inicio, tipo_contrato
                    FROM clientes WHERE cedula = %s
                """, (cedula,))
                cliente = cursor.fetchone()
                
                if cliente:
                    print(f"\n✅ Cliente: {cliente[0]}")
                    print(f"   📞 {cliente[1]} | 💰 Cuota: ${int(cliente[2] or 0):,} | 📊 {cliente[3]}")
                    
                    # Métricas de pago
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as pagos,
                            SUM(valor) as total,
                            MAX(fecha_registro::date) as ultimo
                        FROM registros 
                        WHERE cedula = %s AND tipo NOT ILIKE '%anulacion%'
                    """, (cedula,))
                    pagos = cursor.fetchone()
                    
                    if pagos and pagos[0] > 0:
                        print(f"   💵 Pagos realizados: {pagos[0]} | Total: ${int(pagos[1] or 0):,}")
                        print(f"   📅 Último pago: {pagos[2].strftime('%Y-%m-%d') if pagos[2] else 'Nunca'}")
                        
                        # Calcular mora
                        if pagos[2]:
                            dias_mora = (datetime.now().date() - pagos[2]).days
                            print(f"   ⏳ Días sin pagar: {dias_mora}")
                    else:
                        print("   ⚠️ Sin pagos registrados")
                else:
                    print("❌ Cliente no encontrado.")
                
                cursor.close()
                conn.close()
        elif opcion == "4":
            print("👋 ¡Hasta luego!")
            break
        else:
            print("⚠️ Opción no válida.")