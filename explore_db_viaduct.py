# explore_db_viaduct.py — listar tablas y ver estructura (Railway viaduct)
import os
import psycopg2
from dotenv import load_dotenv

import db_viaduct_defaults

load_dotenv()


def get_connection():
    """Conexión por DATABASE_URL_VIADUCT o parámetros sueltos (mismo patrón que db_general)."""
    url = os.getenv("DATABASE_URL_VIADUCT", "").strip()
    if url:
        return psycopg2.connect(url)
    return psycopg2.connect(
        host=os.getenv("DB_VIADUCT_HOST", db_viaduct_defaults.DB_HOST),
        port=os.getenv("DB_VIADUCT_PORT", db_viaduct_defaults.DB_PORT),
        database=os.getenv("DB_VIADUCT_NAME", db_viaduct_defaults.DB_NAME),
        user=os.getenv("DB_VIADUCT_USER", db_viaduct_defaults.DB_USER),
        password=os.getenv(
            "DB_VIADUCT_PASSWORD", db_viaduct_defaults.DB_PASSWORD
        ),
    )


def listar_tablas(esquema="public"):
    """Lista tablas y vistas del esquema indicado."""
    conn = get_connection()
    cursor = conn.cursor()

    print(f"🔍 Tablas en el esquema '{esquema}'...\n")

    cursor.execute(
        """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = %s
        ORDER BY table_name;
        """,
        (esquema,),
    )
    tablas = cursor.fetchall()

    if tablas:
        print(f"✅ {len(tablas)} objeto(s) encontrado(s):\n")
        for i, (nombre, tipo) in enumerate(tablas, 1):
            print(f"  {i}. 📦 {nombre} ({tipo})")
    else:
        print(f"⚠️ No hay tablas en '{esquema}'.")

    cursor.close()
    conn.close()
    return [t[0] for t in tablas]


def ver_estructura_tabla(nombre_tabla, esquema="public"):
    """Columnas, tipos, nullability y defaults."""
    conn = get_connection()
    cursor = conn.cursor()

    print(f"\n📋 Estructura: {esquema}.{nombre_tabla}")
    print("-" * 72)

    cursor.execute(
        """
        SELECT
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position;
        """,
        (esquema, nombre_tabla),
    )
    columnas = cursor.fetchall()

    if not columnas:
        print("⚠️ No se encontraron columnas (revisa nombre o esquema).")
        cursor.close()
        conn.close()
        return

    print(f"{'Columna':<28} {'Tipo':<22} {'Null':<6} {'Default'}")
    print("-" * 72)
    for col, dtype, max_len, nullable, default in columnas:
        tipo = dtype
        if max_len:
            tipo = f"{dtype}({max_len})"
        print(f"{col:<28} {tipo:<22} {nullable:<6} {default or '-'}")

    cursor.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = %s
          AND tc.table_name = %s
        ORDER BY kcu.ordinal_position;
        """,
        (esquema, nombre_tabla),
    )
    pks = [r[0] for r in cursor.fetchall()]
    if pks:
        print(f"\n🔑 Clave primaria: {', '.join(pks)}")

    cursor.close()
    conn.close()


def ver_muestra_datos(nombre_tabla, limite=5, esquema="public"):
    """Primeras filas de la tabla."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        print(f"\n📊 Muestra de '{esquema}.{nombre_tabla}' (máx. {limite} filas):")
        cursor.execute(
            f'SELECT * FROM "{esquema}"."{nombre_tabla}" LIMIT %s;',
            (limite,),
        )
        encabezados = [desc[0] for desc in cursor.description]
        filas = cursor.fetchall()

        if filas:
            print(" | ".join(encabezados))
            print("-" * 80)
            for fila in filas:
                print(" | ".join(str(v) for v in fila))
        else:
            print("⚠️ La tabla está vacía.")
    except psycopg2.Error as e:
        print(f"⚠️ Error al consultar: {e.pgerror or e}")
    finally:
        cursor.close()
        conn.close()


def listar_todas_las_estructuras(esquema="public"):
    """Imprime la estructura de cada tabla del esquema (modo no interactivo)."""
    tablas = listar_tablas(esquema)
    for nombre in tablas:
        ver_estructura_tabla(nombre, esquema)
    return tablas


if __name__ == "__main__":
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        print("🗄️  Exploración completa — Railway viaduct\n")
        listar_todas_las_estructuras()
        print("\n👋 Listo.")
        sys.exit(0)

    tablas = listar_tablas()

    if not tablas:
        sys.exit(1)

    print("\n" + "=" * 60)
    print("🎮 Escribe el número de tabla, 'all' para todas, o 'q' para salir")
    print("=" * 60)

    while True:
        opcion = input("\n👉 Tu elección: ").strip()

        if opcion.lower() == "q":
            print("👋 ¡Hasta luego!")
            break
        if opcion.lower() == "all":
            for t in tablas:
                ver_estructura_tabla(t)
            continue
        if opcion.isdigit() and 1 <= int(opcion) <= len(tablas):
            tabla = tablas[int(opcion) - 1]
            ver_estructura_tabla(tabla)
            if input("\n¿Ver muestra de datos? (s/n): ").strip().lower() == "s":
                ver_muestra_datos(tabla)
        else:
            print("⚠️ Opción no válida.")
