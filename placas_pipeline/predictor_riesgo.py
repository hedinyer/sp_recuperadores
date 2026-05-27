"""
Modelo de Machine Learning para predecir probabilidad de mora.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib
import os
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')


class RiesgoMoraPredictor:
    FEATURES = [
        'dias_desde_ultimo_pago', 'cuotas_atrasadas_estimadas', 'regularidad_score',
        'frecuencia_confianza', 'dias_promedio_entre_pagos', 'dias_std_entre_pagos',
        'total_pagos', 'dias_desde_inicio', 'frecuencia_cada_3_dias', 'frecuencia_semanal', 
        'frecuencia_quincenal', 'frecuencia_mensual', 'frecuencia_irregular', 'riesgo_previo_alto'
    ]
    
    def __init__(self, modelo_path: str = "./models"):
        self.modelo_path = modelo_path
        self.model = None
        os.makedirs(modelo_path, exist_ok=True)
    
    def _preparar_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df_feat = df.copy()
        for freq in ['cada_3_dias', 'semanal', 'quincenal', 'mensual', 'irregular']:
            df_feat[f'frecuencia_{freq}'] = (df_feat['frecuencia_principal'] == freq).astype(int)
        df_feat['riesgo_previo_alto'] = (df_feat['riesgo_mora'].isin(['alto', 'crítico'])).astype(int)
        available = [f for f in self.FEATURES if f in df_feat.columns]
        return df_feat[available].fillna(0)
    
    def entrenar(self, df_entrenamiento: pd.DataFrame, target_col: str = 'etiqueta_mora_futura') -> dict:
        if target_col not in df_entrenamiento.columns:
            raise ValueError(f"Columna target '{target_col}' no encontrada.")
        
        X = self._preparar_features(df_entrenamiento)
        y = df_entrenamiento[target_col]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        self.model = RandomForestClassifier(n_estimators=100, max_depth=10, min_samples_leaf=5, 
                                            class_weight='balanced', random_state=42, n_jobs=-1)
        self.model.fit(X_train, y_train)
        
        ruta_modelo = os.path.join(self.modelo_path, f"riesgo_mora_{datetime.now().strftime('%Y%m%d')}.joblib")
        joblib.dump(self.model, ruta_modelo)
        return {'train_accuracy': self.model.score(X_train, y_train), 'test_accuracy': self.model.score(X_test, y_test)}
    
    def cargar_modelo(self, ruta: str = None) -> bool:
        if ruta is None:
            modelos = [f for f in os.listdir(self.modelo_path) if f.startswith('riesgo_mora_')]
            if not modelos: return False
            ruta = os.path.join(self.modelo_path, sorted(modelos)[-1])
        try:
            self.model = joblib.load(ruta)
            print(f"✅ Modelo cargado: {ruta}")
            return True
        except Exception as e:
            print(f"❌ Error cargando modelo: {e}")
            return False
    
    def predecir_proba(self, df_features: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise RuntimeError("Primero carga o entrena un modelo.")
        X = self._preparar_features(df_features)
        for col in self.FEATURES:
            if col not in X.columns: X[col] = 0
        return self.model.predict_proba(X[self.FEATURES])[:, 1]
    
    def generar_lista_recuperacion(self, df_analisis: pd.DataFrame, 
                                  umbral_proba: float = 0.6, max_registros: int = 50) -> pd.DataFrame:
        if self.model is None:
            print("⚠️ Sin modelo cargado. Usando reglas heurísticas...")
            df_analisis = df_analisis.copy()
            df_analisis['probabilidad_mora'] = np.where(
                df_analisis['riesgo_mora'].isin(['crítico', 'alto']), 0.8,
                np.where(df_analisis['riesgo_mora'] == 'medio', 0.4, 0.1)
            )
        else:
            df_analisis['probabilidad_mora'] = self.predecir_proba(df_analisis)
        
        lista = df_analisis[
            (df_analisis['probabilidad_mora'] >= umbral_proba) &
            (df_analisis['cuotas_atrasadas_estimadas'] > 0)
        ].copy()
        
        lista['deuda_estimada'] = lista['cuotas_atrasadas_estimadas'] * lista['valor_cuota']
        lista['score_prioridad'] = (
            lista['probabilidad_mora'] * lista['deuda_estimada'] * (1 + lista['dias_desde_ultimo_pago'] / 30)
        )
        lista = lista.sort_values('score_prioridad', ascending=False).head(max_registros)
        
        columnas_salida = [
            'placa', 'nombre', 'telefono', 'visitador', 'probabilidad_mora', 
            'cuotas_atrasadas_estimadas', 'valor_cuota', 'deuda_estimada',
            'dias_desde_ultimo_pago', 'riesgo_mora', 'frecuencia_principal', 
            'regularidad_score', 'score_prioridad'
        ]
        # 🔹 Fallback seguro si falta alguna columna
        cols_existentes = [c for c in columnas_salida if c in lista.columns]
        return lista[cols_existentes].round(2)