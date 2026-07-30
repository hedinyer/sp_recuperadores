/**
 * Análisis de patrones de pago y detección de morosidad.
 * Basado en placas_pipeline/feature_engine.py + métricas de extractoCliente.
 */

import {
  calcularMetricasExtracto,
  type RegistroExtracto,
} from "@/lib/extractoCliente";

export const ANTIGUEDAD_MIN_DIAS = 14;
/** Excluye contratos con más de 280 días desde inicio (y ≥365). */
export const ANTIGUEDAD_MAX_DIAS = 280;

/** Más de 5 días sin pago (referencia en UI). */
export const DIAS_MORA_RECUPERACION = 5;
/** Cuotas en mora: más de 5 pendientes. */
export const CUOTAS_MORA_RECUPERACION = 5;
/** Deuda mínima para recuperación: más de $250.000 COP. */
export const DEUDA_MIN_RECUPERACION_COP = 250_000;

export type FrecuenciaPago =
  | "diaria"
  | "cada_3_dias"
  | "semanal"
  | "quincenal"
  | "mensual"
  | "irregular"
  | "insuficiente_datos";

export type RiesgoMora = "bajo" | "medio" | "alto" | "critico";
export type TendenciaDeuda = "estable" | "creciente" | "mejorando";

const PATRON_ESPERADO: Record<
  Exclude<FrecuenciaPago, "irregular" | "insuficiente_datos">,
  [number, number]
> = {
  diaria: [1, 1.5],
  cada_3_dias: [2.5, 4],
  semanal: [6, 8],
  quincenal: [13, 17],
  mensual: [25, 35],
};

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  diaria: "Diaria",
  cada_3_dias: "Cada 2–3 días",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  irregular: "Irregular",
  insuficiente_datos: "Sin patrón claro",
};

export type EntradaAnalisisMoroso = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  visitador: string;
  fecha_inicio: Date;
  valor_cuota: number;
  dias_credito: number;
  registros: RegistroExtracto[];
};

export type ResultadoMoroso = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  visitador: string;
  fecha_inicio: string;
  valor_cuota: number;
  dias_antiguedad: number;
  deuda_total: number;
  dias_mora: number;
  cumplimiento_pct: number;
  ultimo_pago: string;
  pago_hoy: boolean;
  frecuencia_principal: FrecuenciaPago;
  frecuencia_etiqueta: string;
  frecuencia_confianza: number;
  dias_promedio_entre_pagos: number;
  regularidad_score: number;
  pagos_irregulares: boolean;
  tendencia_deuda: TendenciaDeuda;
  delta_deuda_30d: number;
  riesgo_mora: RiesgoMora;
  dias_excedidos_patron: number;
  cuotas_pendientes: number;
  pago_diario_sin_abono: boolean;
  score_prioridad: number;
  motivo: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / 86400000);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function calcularIntervalos(fechas: Date[]): number[] {
  if (fechas.length < 2) return [];
  const ord = [...fechas].map(startOfDay).sort((a, b) => a.getTime() - b.getTime());
  const out: number[] = [];
  for (let i = 1; i < ord.length; i++) {
    out.push(daysBetween(ord[i - 1], ord[i]));
  }
  return out;
}

export type PatronPago = {
  frecuencia_principal: FrecuenciaPago;
  frecuencia_etiqueta: string;
  frecuencia_confianza: number;
  dias_promedio_entre_pagos: number;
  regularidad_score: number;
  pagos_irregulares: boolean;
};

/** Intervalos entre pagos → media, regularidad (1 − std/media) y bucket de frecuencia. */
export function analizarPatronPago(
  registros: RegistroExtracto[],
): PatronPago {
  const regsValidos = registros.filter(
    (r) => r.valor != null && !Number.isNaN(Number(r.valor)) && Number(r.valor) > 0,
  );
  if (regsValidos.length < 2) {
    return {
      frecuencia_principal: "insuficiente_datos",
      frecuencia_etiqueta: ETIQUETA_FRECUENCIA.insuficiente_datos,
      frecuencia_confianza: 0,
      dias_promedio_entre_pagos: 0,
      regularidad_score: 0,
      pagos_irregulares: false,
    };
  }

  const intervalos = calcularIntervalos(regsValidos.map((r) => r.fecha));
  const detectado = detectarFrecuencia(intervalos);
  const pagos_irregulares =
    detectado.frecuencia === "irregular" ||
    (detectado.regularidad < 0.45 && detectado.confianza < 0.5);

  return {
    frecuencia_principal: detectado.frecuencia,
    frecuencia_etiqueta: ETIQUETA_FRECUENCIA[detectado.frecuencia],
    frecuencia_confianza: detectado.confianza,
    dias_promedio_entre_pagos: detectado.media,
    regularidad_score: detectado.regularidad,
    pagos_irregulares,
  };
}

export function detectarFrecuencia(intervalos: number[]): {
  frecuencia: FrecuenciaPago;
  confianza: number;
  media: number;
  std: number;
  regularidad: number;
} {
  if (intervalos.length === 0) {
    return {
      frecuencia: "insuficiente_datos",
      confianza: 0,
      media: 0,
      std: 0,
      regularidad: 0,
    };
  }

  const media =
    intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
  const variance =
    intervalos.reduce((s, v) => s + (v - media) ** 2, 0) /
    intervalos.length;
  const std = Math.sqrt(variance);

  let mejorPatron: FrecuenciaPago = "irregular";
  let mejorDistancia = Infinity;

  for (const [patron, [minD, maxD]] of Object.entries(PATRON_ESPERADO) as [
    Exclude<FrecuenciaPago, "irregular" | "insuficiente_datos">,
    [number, number],
  ][]) {
    const mid = (minD + maxD) / 2;
    const distancia = Math.abs(media - mid);
    if (distancia < mejorDistancia && media >= minD && media <= maxD) {
      mejorDistancia = distancia;
      mejorPatron = patron;
    }
  }

  const regularidad =
    std === 0 ? 1 : Math.max(0, 1 - std / media);

  let confianza: number;
  if (mejorPatron !== "irregular") {
    const [minD, maxD] = PATRON_ESPERADO[mejorPatron];
    const midRange = (minD + maxD) / 2;
    const ajuste = 1 - Math.min(1, Math.abs(media - midRange) / 3);
    confianza = Math.round((regularidad * 0.6 + ajuste * 0.4) * 100) / 100;
  } else {
    confianza = 0.3;
  }

  return {
    frecuencia: mejorPatron,
    confianza,
    media: Math.round(media * 10) / 10,
    std: Math.round(std * 10) / 10,
    regularidad: Math.round(regularidad * 100) / 100,
  };
}

function calcularRiesgoMora(
  diasUltimoPago: number,
  cuotasAtrasadas: number,
): RiesgoMora {
  if (diasUltimoPago <= 7 && cuotasAtrasadas < 1) return "bajo";
  if (diasUltimoPago <= 15 || cuotasAtrasadas < 3) return "medio";
  if (diasUltimoPago <= 30 || cuotasAtrasadas < 7) return "alto";
  return "critico";
}

function pagoEnFecha(registros: RegistroExtracto[], dia: Date): boolean {
  const key = formatFecha(startOfDay(dia));
  return registros.some((r) => formatFecha(startOfDay(r.fecha)) === key);
}

export function antiguedadPermitida(fechaInicio: Date, hoy = new Date()): boolean {
  const dias = daysBetween(fechaInicio, hoy);
  return dias >= ANTIGUEDAD_MIN_DIAS && dias <= ANTIGUEDAD_MAX_DIAS;
}

export function analizarMorosidad(
  entrada: EntradaAnalisisMoroso,
  hoy = new Date(),
): ResultadoMoroso | null {
  const {
    placa,
    cedula,
    nombre,
    telefono,
    visitador,
    fecha_inicio,
    valor_cuota,
    dias_credito,
    registros,
  } = entrada;

  if (!antiguedadPermitida(fecha_inicio, hoy)) return null;
  if (valor_cuota <= 0) return null;

  const regsValidos = registros.filter(
    (r) => r.valor != null && !Number.isNaN(Number(r.valor)) && Number(r.valor) > 0,
  );

  const inicio = startOfDay(fecha_inicio);
  const hoyD = startOfDay(hoy);
  const diasAntiguedad = daysBetween(inicio, hoyD);

  const patron = analizarPatronPago(regsValidos);
  const {
    frecuencia_principal: frecuencia,
    frecuencia_confianza: confianza,
    dias_promedio_entre_pagos: media,
    regularidad_score: regularidad,
    pagos_irregulares: pagosIrregulares,
  } = patron;

  const metricasHoy = calcularMetricasExtracto(
    fecha_inicio,
    valor_cuota,
    regsValidos,
    dias_credito,
    hoyD,
  );

  const hace30 = addDays(hoyD, -30);
  const regsHace30 = regsValidos.filter(
    (r) => startOfDay(r.fecha).getTime() <= hace30.getTime(),
  );
  const metricas30 = calcularMetricasExtracto(
    fecha_inicio,
    valor_cuota,
    regsHace30.length > 0 ? regsHace30 : [],
    dias_credito,
    hace30,
  );

  const deltaDeuda30 = metricasHoy.deuda_total - metricas30.deuda_total;
  let tendencia: TendenciaDeuda = "estable";
  if (deltaDeuda30 > valor_cuota * 0.4) tendencia = "creciente";
  else if (deltaDeuda30 < -valor_cuota * 0.2) tendencia = "mejorando";

  const cuotasAtrasadas = metricasHoy.cuotas_pendientes;
  const riesgo = calcularRiesgoMora(
    metricasHoy.dias_mora,
    cuotasAtrasadas,
  );

  const diasExcedidos = Math.max(0, metricasHoy.dias_mora - DIAS_MORA_RECUPERACION);
  const superaDiasMora = metricasHoy.dias_mora > DIAS_MORA_RECUPERACION;
  const cumpleDeuda =
    metricasHoy.deuda_total > DEUDA_MIN_RECUPERACION_COP;
  const cumpleCuotasMora =
    metricasHoy.cuotas_pendientes > CUOTAS_MORA_RECUPERACION;

  /** Pagan la cuota del día pero la deuda sigue creciendo (no abonan backlog). */
  const pagoDiarioSinAbono =
    frecuencia === "diaria" &&
    confianza >= 0.45 &&
    cumpleDeuda &&
    (tendencia === "creciente" || deltaDeuda30 > valor_cuota * 0.25);

  const esMoroso =
    (cumpleCuotasMora && cumpleDeuda) || pagoDiarioSinAbono;

  if (!esMoroso) return null;

  const scorePrioridad =
    metricasHoy.deuda_total *
    (1 + metricasHoy.dias_mora / 30) *
    (1 + Math.min(cuotasAtrasadas, 20) / 10) *
    (pagoDiarioSinAbono ? 1.2 : cumpleCuotasMora && cumpleDeuda ? 1.15 : 1);

  const motivos: string[] = [];
  if (cumpleCuotasMora) {
    motivos.push(`${Math.ceil(cuotasAtrasadas)} cuotas en mora`);
  }
  if (pagoDiarioSinAbono) motivos.push("paga diario sin abonar deuda");
  motivos.push(
    `deuda ${Math.round(metricasHoy.deuda_total).toLocaleString("es-CO")}`,
  );
  if (superaDiasMora) motivos.push(`${metricasHoy.dias_mora}d sin pago`);
  if (pagosIrregulares && !pagoDiarioSinAbono) {
    motivos.push("pagos irregulares");
  }

  return {
    placa,
    cedula,
    nombre,
    telefono,
    visitador,
    fecha_inicio: formatFecha(inicio),
    valor_cuota: Math.round(valor_cuota),
    dias_antiguedad: diasAntiguedad,
    deuda_total: Math.round(metricasHoy.deuda_total),
    dias_mora: metricasHoy.dias_mora,
    cumplimiento_pct: metricasHoy.cumplimiento_pct,
    ultimo_pago: metricasHoy.ultimo_pago,
    pago_hoy: pagoEnFecha(regsValidos, hoyD),
    frecuencia_principal: frecuencia,
    frecuencia_etiqueta: patron.frecuencia_etiqueta,
    frecuencia_confianza: confianza,
    dias_promedio_entre_pagos: media,
    regularidad_score: regularidad,
    pagos_irregulares: pagosIrregulares,
    tendencia_deuda: tendencia,
    delta_deuda_30d: Math.round(deltaDeuda30),
    riesgo_mora: riesgo,
    dias_excedidos_patron: diasExcedidos,
    cuotas_pendientes: Math.round(cuotasAtrasadas * 10) / 10,
    pago_diario_sin_abono: pagoDiarioSinAbono,
    score_prioridad: Math.round(scorePrioridad),
    motivo: motivos.join(" · "),
  };
}

export function ordenarMorosos(lista: ResultadoMoroso[]): ResultadoMoroso[] {
  const ordenRiesgo: Record<RiesgoMora, number> = {
    critico: 0,
    alto: 1,
    medio: 2,
    bajo: 3,
  };
  return [...lista].sort((a, b) => {
    const ra = ordenRiesgo[a.riesgo_mora];
    const rb = ordenRiesgo[b.riesgo_mora];
    if (ra !== rb) return ra - rb;
    if (b.score_prioridad !== a.score_prioridad) {
      return b.score_prioridad - a.score_prioridad;
    }
    return b.dias_mora - a.dias_mora;
  });
}
