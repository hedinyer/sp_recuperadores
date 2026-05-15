# db_connection.py
import os
import psycopg2
from dotenv import load_dotenv

# Cargar variables desde archivo .env si existe
load_dotenv()

def conectar_postgresql():
    """Intenta conectar a la base de datos PostgreSQL y retorna el estado"""
    
    # Obtener credenciales desde variables de entorno (más seguro)
    config = {
        'host': os.getenv('DB_HOST', 'nozomi.proxy.rlwy.net'),
        'port': os.getenv('DB_PORT', '19507'),
        'database': os.getenv('DB_NAME', 'railway'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD')
    }
    
    try:
        print("🔗 Intentando conectar a PostgreSQL...")
        connection = psycopg2.connect(**config)
        
        if connection.closed == 0:  # 0 = conexión abierta
            print("✅ ¡Conexión exitosa!")
            print(f"📍 Conectado a: {config['host']}:{config['port']}/{config['database']}")
            
            # Obtener versión de PostgreSQL (prueba adicional)
            cursor = connection.cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()
            print(f"🐘 Versión de PostgreSQL: {version[0][:50]}...")
            cursor.close()
            
            connection.close()
            print("🔌 Conexión cerrada correctamente.")
            return True
            
    except psycopg2.OperationalError as e:
        print(f"❌ Error de conexión: {e}")
    except Exception as e:
        print(f"❌ Error inesperado: {type(e).__name__} - {e}")
    
    return False

if __name__ == "__main__":
    conectar_postgresql()