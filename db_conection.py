# explore_db.py
import os
import psycopg2
from dotenv import load_dotenv
from tabulate import tabulate  # opcional, para mejor formato

load_dotenv()

def get_connection():
    """Retorna una conexión a la BD"""
    return psycopg2.connect(
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT'),
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD')
    )

def listar_tablas():
    """Lista todas las tablas del esquema público"""
    conn = get_connection()
    cursor = conn.cursor()
    
    print("🔍 Buscando tablas en el esquema 'public'...\n")
    
    # Consulta para obtener tablas del esquema público
    cursor.execute("""
        SELECT 
            table_name, 
            table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    
    tablas = cursor.fetchall()
    
    if tablas:
        print(f"✅ Se encontraron {len(tablas)} tabla(s):\n")
        for i, (nombre, tipo) in enumerate(tablas, 1):
            print(f"  {i}. 📦 {nombre} ({tipo})")
    else:
        print("⚠️ No se encontraron tablas en el esquema 'public'.")
    
    cursor.close()
    conn.close()
    return [t[0] for t in tablas]

def ver_estructura_tabla(nombre_tabla):
    """Muestra las columnas de una tabla específica"""
    conn = get_connection()
    cursor = conn.cursor()
    
    print(f"\n📋 Estructura de la tabla: {nombre_tabla}")
    print("-" * 60)
    
    cursor.execute("""
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position;
    """, (nombre_tabla,))
    
    columnas = cursor.fetchall()
    
    if columnas:
        print(f"{'Columna':<25} {'Tipo':<20} {'Nullable':<10} {'Default'}")
        print("-" * 60)
        for col in columnas:
            print(f"{col[0]:<25} {col[1]:<20} {col[2]:<10} {col[3] or '-'}")
    else:
        print("⚠️ No se encontraron columnas.")
    
    cursor.close()
    conn.close()

def ver_muestra_datos(nombre_tabla, limite=5):
    """Muestra las primeras filas de una tabla"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        print(f"\n📊 Muestra de datos de '{nombre_tabla}' (primeras {limite} filas):")
        cursor.execute(f'SELECT * FROM "{nombre_tabla}" LIMIT %s;', (limite,))
        
        columnas = [desc[0] for desc in cursor.description]
        filas = cursor.fetchall()
        
        if filas:
            # Imprimir encabezados
            print(" | ".join(columnas))
            print("-" * 80)
            # Imprimir filas
            for fila in filas:
                print(" | ".join(str(v) for v in fila))
        else:
            print("⚠️ La tabla está vacía.")
            
    except Exception as e:
        print(f"⚠️ No se pudo consultar la tabla: {e}")
    finally:
        cursor.close()
        conn.close()

# === MENÚ INTERACTIVO ===
if __name__ == "__main__":
    tablas = listar_tablas()
    
    if tablas:
        print("\n" + "="*60)
        print("🎮 MODO EXPLORACIÓN - Escribe el número de tabla para ver detalles")
        print("   o 'q' para salir")
        print("="*60)
        
        while True:
            opcion = input("\n👉 Tu elección: ").strip()
            
            if opcion.lower() == 'q':
                print("👋 ¡Hasta luego!")
                break
            elif opcion.isdigit() and 1 <= int(opcion) <= len(tablas):
                tabla_seleccionada = tablas[int(opcion) - 1]
                ver_estructura_tabla(tabla_seleccionada)
                
                # Preguntar si quiere ver datos
                ver_datos = input("\n¿Ver muestra de datos? (s/n): ").strip().lower()
                if ver_datos == 's':
                    ver_muestra_datos(tabla_seleccionada)
            else:
                print("⚠️ Opción no válida. Intenta de nuevo.")