"""
Script principal para ejecución diaria automatizada.
Ejecuta: extracción → análisis → predicción → exportación lista de recuperación.
"""

import pandas as pd
import os
import sys
import logging
from datetime import datetime
from pathlib import Path

# ✅ Asegurar imports relativos funcionando desde cualquier directorio de ejecución
sys.path.append(str(Path(__file__).parent))

from extractor_masivo import extraer_dataset_completo
from feature_engine import PaymentPatternAnalyzer
from predictor_riesgo import RiesgoMoraPredictor

# ✅ CREAR DIRECTORIOS NECESARIOS ANTES DE CONFIGURAR LOGGING
BASE_DIR = Path(__file__).parent
DIRECTORIOS = ["logs", "data", "models", "output"]
for directorio in DIRECTORIOS:
    (BASE_DIR / directorio).mkdir(exist_ok=True)

# Configuración de logging robusta
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(BASE_DIR / "logs" / "runner_diario.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def ejecutar_pipeline_diario(
    ruta_datos: str = "data",
    ruta_modelo: str = "models",
    ruta_salida: str = "output",
    umbral_recuperacion: float = 0.6,
    max_vehiculos_recuperar: int = 50
) -> dict:
    """
    Ejecuta el pipeline completo de análisis predictivo.
    
    Returns:
        dict con resumen de la ejecución y rutas de archivos generados
    """
    inicio = datetime.now()
    logger.info("🚀 Iniciando pipeline diario de recuperación")
    
    resultados = {}
    
    try:
        # Paso 1: Extraer datos actualizados
        logger.info("📥 Paso 1: Extrayendo datos de PostgreSQL...")
        ruta_dataset = extraer_dataset_completo(ruta_datos)
        resultados['dataset'] = ruta_dataset
        
        # Paso 2: Analizar patrones de pago
        logger.info("🔍 Paso 2: Analizando patrones de pago...")
        df_raw = pd.read_parquet(ruta_dataset)
        analyzer = PaymentPatternAnalyzer(df_raw)
        df_patrones = analyzer.analizar_todos()
        
        ruta_patrones = os.path.join(ruta_datos, f"patrones_{datetime.now().strftime('%Y%m%d')}.parquet")
        df_patrones.to_parquet(ruta_patrones, index=False)
        resultados['patrones'] = ruta_patrones
        logger.info(f"   ✅ {len(df_patrones)} placas analizadas")
        
        # Paso 3: Cargar modelo y predecir riesgo
        logger.info("🤖 Paso 3: Prediciendo riesgo de mora...")
        predictor = RiesgoMoraPredictor(ruta_modelo)
        
        if not predictor.cargar_modelo():
            logger.warning("⚠️ No se encontró modelo entrenado. Usando reglas heurísticas.")
        
        # Paso 4: Generar lista de recuperación
        logger.info("📋 Paso 4: Generando lista priorizada de recuperación...")
        lista_recuperacion = predictor.generar_lista_recuperacion(
            df_patrones,
            umbral_proba=umbral_recuperacion,
            max_registros=max_vehiculos_recuperar
        )
        
        # Exportar resultados
        os.makedirs(ruta_salida, exist_ok=True)
        fecha_hoy = datetime.now().strftime('%Y%m%d')
        
        # CSV para equipo operativo
        ruta_csv = os.path.join(ruta_salida, f"recuperacion_{fecha_hoy}.csv")
        lista_recuperacion.to_csv(ruta_csv, index=False, sep=';', encoding='utf-8-sig')
        
        # JSON para API/webhook
        ruta_json = os.path.join(ruta_salida, f"recuperacion_{fecha_hoy}.json")
        lista_recuperacion.to_json(ruta_json, orient='records', force_ascii=False, indent=2)
        
        resultados.update({
            'lista_csv': ruta_csv,
            'lista_json': ruta_json,
            'total_analizados': len(df_patrones),
            'total_en_lista': len(lista_recuperacion),
            'deuda_total_lista': float(lista_recuperacion['deuda_estimada'].sum()),
            'tiempo_ejecucion_seg': (datetime.now() - inicio).total_seconds()
        })
        
        # Resumen en logs
        logger.info("✅ Pipeline completado exitosamente")
        logger.info(f"   📊 Vehículos analizados: {resultados['total_analizados']}")
        logger.info(f"   🎯 En lista de recuperación: {resultados['total_en_lista']}")
        logger.info(f"   💰 Deuda priorizada: ${resultados['deuda_total_lista']:,.0f}")
        logger.info(f"   ⏱️ Tiempo total: {resultados['tiempo_ejecucion_seg']:.1f} segundos")
        
        return resultados
        
    except Exception as e:
        logger.error(f"❌ Error en pipeline: {e}", exc_info=True)
        resultados['error'] = str(e)
        return resultados


def enviar_notificacion(resultados: dict, canal: str = "consola"):
    """Envía notificación con resultados (placeholder para integrar con Slack/Email)."""
    if 'error' in resultados:
        mensaje = f"❌ Error en pipeline diario:\n{resultados['error']}"
    else:
        mensaje = (
            f"✅ Pipeline diario completado\n"
            f"📊 Analizados: {resultados['total_analizados']} vehículos\n"
            f"🎯 Recuperación: {resultados['total_en_lista']} vehículos\n"
            f"💰 Deuda priorizada: ${resultados['deuda_total_lista']:,.0f}\n"
            f"📄 CSV: {resultados['lista_csv']}"
        )
    
    if canal == "email":
        logger.info(f"📧 Email pendiente de configurar:\n{mensaje}")
    elif canal == "slack":
        logger.info(f"💬 Slack pendiente de configurar:\n{mensaje}")
    else:
        logger.info(mensaje)


if __name__ == "__main__":
    # Ejecutar pipeline
    resultados = ejecutar_pipeline_diario()
    
    # Notificar
    enviar_notificacion(resultados, canal="consola")
    
    # Código de salida para cron (0 = éxito, 1 = error)
    sys.exit(1 if 'error' in resultados else 0)