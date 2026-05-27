"""
Extracción masiva de datos de pago para todas las placas activas.
Genera dataset listo para análisis de patrones y ML.
"""

import pandas as pd
import psycopg2
import os
import json
from datetime import datetime
from dotenv import load_dotenv
import db_defaults
import warnings

# Silenciar warning conocido de pandas con psycopg2 (no afecta funcionalidad)
warnings.filterwarnings("ignore", message="pandas only supports SQLAlchemy")

load_dotenv()


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", db_defaults.DB_HOST),
        port=os.getenv("DB_PORT", db_defaults.DB_PORT),
        database=os.getenv("DB_NAME", db_defaults.DB_NAME),
        user=os.getenv("DB_USER", db_defaults.DB_USER),
        password=os.getenv("DB_PASSWORD", db_defaults.DB_PASSWORD),
    )


# ✅ CORREGIDO: JSON_AGG en lugar de ARRAY_AGG, y cast válido '[]'::json
SQL_TODOS_CLIENTES_REGISTROS = """
WITH cliente_base AS (
    SELECT 
        c.cedula,
        c.nombre,
        c.placa,
        c.telefono,
        c.visitador,
        c.fecha_inicio::date as fecha_inicio,
        c.valor_cuota::numeric as valor_cuota,
        c.estado
    FROM clientes c
    WHERE c.estado = 'activo'
      AND c.placa IS NOT NULL 
      AND TRIM(c.placa) <> ''
      AND c.fecha_inicio IS NOT NULL
      AND c.valor_cuota > 0
),
registros_agg AS (
    SELECT 
        r.cedula,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'fecha', r.fecha_registro::date,
                'valor', r.valor::numeric,
                'tipo', r.tipo,
                'referencia', r.referencia
            ) ORDER BY r.fecha_registro
        ) as historial_pagos
    FROM registros r
    INNER JOIN cliente_base cb ON r.cedula = cb.cedula
    GROUP BY r.cedula
)
SELECT 
    cb.*,
    COALESCE(ra.historial_pagos, '[]'::json) as historial_pagos
FROM cliente_base cb
LEFT JOIN registros_agg ra ON cb.cedula = ra.cedula
ORDER BY cb.placa;
"""


def _parsear_json_seguro(val) -> list:
    """Convierte el valor JSON de PostgreSQL a lista de Python de forma segura."""
    if val is None or val == "[]":
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return []
    # psycopg2 a veces devuelve objetos Json extras
    return list(val)


def extraer_dataset_completo(ruta_salida: str = "./data") -> str:
    """
    Extrae todos los clientes activos con su historial de pagos.
    Retorna la ruta del archivo Parquet generado.
    """
    os.makedirs(ruta_salida, exist_ok=True)
    conn = get_connection()
    
    try:
        print("🔄 Extrayendo datos de PostgreSQL...")
        df = pd.read_sql_query(SQL_TODOS_CLIENTES_REGISTROS, conn)
        
        if df.empty:
            raise ValueError("No se encontraron clientes activos con placa.")
        
        # ✅ Parseo seguro del historial JSON
        df['historial_pagos'] = df['historial_pagos'].apply(_parsear_json_seguro)
        
        # Guardar en Parquet (eficiente para análisis)
        nombre_archivo = f"dataset_pagos_{datetime.now().strftime('%Y%m%d')}.parquet"
        ruta_completa = os.path.join(ruta_salida, nombre_archivo)
        df.to_parquet(ruta_completa, index=False, compression='snappy')
        
        print(f"✅ Dataset exportado: {ruta_completa}")
        print(f"   📊 Registros: {len(df)} clientes")
        print(f"   💾 Tamaño: {os.path.getsize(ruta_completa) / 1024 / 1024:.2f} MB")
        
        return ruta_completa
        
    finally:
        conn.close()


if __name__ == "__main__":
    extraer_dataset_completo()