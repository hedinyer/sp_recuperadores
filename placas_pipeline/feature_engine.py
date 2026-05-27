"""
Ingeniería de características para análisis de patrones de pago.
Detecta frecuencia: cada 3 días, semanal, quincenal, mensual, irregular.
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, asdict
import warnings
warnings.filterwarnings('ignore')


@dataclass
class PaymentPattern:
    """Resultado del análisis de patrón de pago."""
    placa: str = ""
    cedula: str = ""
    nombre: str = ""
    telefono: str = ""
    visitador: str = ""
    total_pagos: int = 0
    total_pagado: float = 0.0
    valor_cuota: float = 0.0
    fecha_inicio: str = ""
    dias_desde_inicio: int = 0
    frecuencia_principal: str = "insuficiente_datos"
    frecuencia_confianza: float = 0.0
    dias_promedio_entre_pagos: float = 0.0
    dias_std_entre_pagos: float = 0.0
    regularidad_score: float = 0.0
    dias_desde_ultimo_pago: int = 0
    cuotas_atrasadas_estimadas: float = 0.0
    riesgo_mora: str = "bajo"
    pago_typico_dia_semana: Optional[int] = None
    pago_typico_quincena: Optional[str] = None
    metodo_pago_predominante: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


class PaymentPatternAnalyzer:
    PATRON_ESPERADO = {
        'diaria': (1, 1.5), 'cada_3_dias': (2.5, 4), 'semanal': (6, 8),
        'quincenal': (13, 17), 'mensual': (25, 35),
    }

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.hoy = datetime.now().date()

    def _parsear_historial(self, historial) -> pd.DataFrame:
        if historial is None:
            return pd.DataFrame(columns=['fecha', 'valor', 'tipo', 'referencia'])
        if isinstance(historial, (list, np.ndarray)):
            if len(historial) == 0:
                return pd.DataFrame(columns=['fecha', 'valor', 'tipo', 'referencia'])

        pagos = []
        for p in historial:
            if isinstance(p, dict) and p.get('fecha'):
                pagos.append({
                    'fecha': pd.to_datetime(p['fecha']).date(),
                    'valor': float(p.get('valor', 0)),
                    'tipo': str(p.get('tipo', '')),
                    'referencia': str(p.get('referencia', ''))
                })
        return pd.DataFrame(pagos)

    def _calcular_intervalos(self, fechas: pd.Series) -> list:
        if len(fechas) < 2:
            return []
        fechas_ord = sorted(fechas)
        return [(fechas_ord[i+1] - fechas_ord[i]).days for i in range(len(fechas_ord)-1)]

    def _detectar_frecuencia(self, intervalos: list) -> tuple[str, float]:
        if len(intervalos) == 0:
            return 'insuficiente_datos', 0.0

        mean_interval = np.mean(intervalos)
        std_interval = np.std(intervalos)

        mejor_patron = 'irregular'
        mejor_distancia = float('inf')

        for patron, (min_d, max_d) in self.PATRON_ESPERADO.items():
            mid = (min_d + max_d) / 2
            distancia = abs(mean_interval - mid)
            if distancia < mejor_distancia and min_d <= mean_interval <= max_d:
                mejor_distancia = distancia
                mejor_patron = patron

        regularidad = 1.0 if std_interval == 0 else max(0, 1 - (std_interval / mean_interval))

        if mejor_patron != 'irregular':
            mid_range = (self.PATRON_ESPERADO[mejor_patron][0] + self.PATRON_ESPERADO[mejor_patron][1]) / 2
            ajuste_patron = 1 - min(1, abs(mean_interval - mid_range) / 3)
            confianza = regularidad * 0.6 + ajuste_patron * 0.4
        else:
            confianza = 0.3

        return mejor_patron, round(confianza, 2)

    def _calcular_riesgo_mora(self, dias_ultimo_pago: int, cuotas_atrasadas: float) -> str:
        if dias_ultimo_pago <= 7 and cuotas_atrasadas < 1: return 'bajo'
        elif dias_ultimo_pago <= 15 or cuotas_atrasadas < 3: return 'medio'
        elif dias_ultimo_pago <= 30 or cuotas_atrasadas < 7: return 'alto'
        return 'crítico'

    def analizar_placa(self, row: pd.Series) -> Optional[PaymentPattern]:
        try:
            placa = str(row['placa'])
            cedula = str(row['cedula'])
            nombre = str(row.get('nombre', ''))
            telefono = str(row.get('telefono', ''))
            visitador = str(row.get('visitador', ''))
            valor_cuota = float(row['valor_cuota'])
            
            fi = row['fecha_inicio']
            fecha_inicio = pd.to_datetime(fi).date() if isinstance(fi, str) else fi

            df_pagos = self._parsear_historial(row['historial_pagos'])
            if df_pagos.empty:
                return None

            fechas_pago = df_pagos['fecha']
            dias_desde_inicio = (self.hoy - fecha_inicio).days
            dias_desde_ultimo = (self.hoy - fechas_pago.max()).days

            intervalos = self._calcular_intervalos(fechas_pago)
            frecuencia, confianza = self._detectar_frecuencia(intervalos)

            mean_interval = np.mean(intervalos) if len(intervalos) > 0 else 0
            std_interval = np.std(intervalos) if len(intervalos) > 0 else 0
            regularidad = max(0, 1 - (std_interval / mean_interval)) if mean_interval > 0 else 0

            total_pagado = df_pagos['valor'].sum()
            cuotas_esperadas = dias_desde_inicio
            cuotas_pagadas = total_pagado / valor_cuota if valor_cuota > 0 else 0
            cuotas_atrasadas = max(0, cuotas_esperadas - cuotas_pagadas)

            dia_semana_typico = None
            quincena_typica = None
            if len(fechas_pago) >= 5:
                dias_semana = [f.weekday() for f in fechas_pago]
                dia_semana_typico = max(set(dias_semana), key=dias_semana.count)
                dias_mes = [f.day for f in fechas_pago]
                if np.mean([1 if d <= 15 else 0 for d in dias_mes]) > 0.7: quincena_typica = 'inicio'
                elif np.mean([1 if d > 15 else 0 for d in dias_mes]) > 0.7: quincena_typica = 'fin'

            metodo_pred = None
            tipos_validos = df_pagos['tipo'].dropna()
            if len(tipos_validos) > 0:
                metodo_pred = tipos_validos.mode().iloc[0]

            riesgo = self._calcular_riesgo_mora(dias_desde_ultimo, cuotas_atrasadas)

            return PaymentPattern(
                placa=placa, cedula=cedula, nombre=nombre, telefono=telefono, visitador=visitador,
                total_pagos=len(df_pagos), total_pagado=total_pagado, valor_cuota=valor_cuota,
                fecha_inicio=fecha_inicio.isoformat(), dias_desde_inicio=dias_desde_inicio,
                frecuencia_principal=frecuencia, frecuencia_confianza=confianza,
                dias_promedio_entre_pagos=round(mean_interval, 1), dias_std_entre_pagos=round(std_interval, 1),
                regularidad_score=round(regularidad, 2), dias_desde_ultimo_pago=dias_desde_ultimo,
                cuotas_atrasadas_estimadas=round(cuotas_atrasadas, 1), riesgo_mora=riesgo,
                pago_typico_dia_semana=dia_semana_typico, pago_typico_quincena=quincena_typica,
                metodo_pago_predominante=metodo_pred
            )
        except Exception as e:
            print(f"⚠️ Error analizando placa {row.get('placa', 'N/A')}: {e}")
            return None

    def analizar_todos(self) -> pd.DataFrame:
        resultados = []
        print(f"🔄 Analizando {len(self.df)} placas...")
        for idx, row in self.df.iterrows():
            patron = self.analizar_placa(row)
            if patron:
                resultados.append(patron.to_dict())
            if (idx + 1) % 50 == 0:
                print(f"   ✅ {idx + 1}/{len(self.df)} procesados")

        df_resultados = pd.DataFrame(resultados)
        if not df_resultados.empty:
            orden_riesgo = {'crítico': 0, 'alto': 1, 'medio': 2, 'bajo': 3}
            df_resultados['_orden_riesgo'] = df_resultados['riesgo_mora'].map(orden_riesgo)
            df_resultados = df_resultados.sort_values(
                ['_orden_riesgo', 'cuotas_atrasadas_estimadas', 'dias_desde_ultimo_pago'],
                ascending=[True, False, False]
            ).drop(columns=['_orden_riesgo'])
        return df_resultados