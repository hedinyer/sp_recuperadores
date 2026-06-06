import type { ResultadoAtraso } from "@/lib/atrasosFromDb";
import type { ResultadoMoroso, RiesgoMora, TendenciaDeuda } from "@/lib/analisisMorosidad";
import { PORCENTAJE_MINIMO_COBRO } from "@/lib/formatoDinero";

export type BucketMora = {
  etiqueta: string;
  min: number;
  max: number | null;
  cantidad: number;
  deuda: number;
};

export type BucketDeuda = {
  etiqueta: string;
  min: number;
  max: number | null;
  cantidad: number;
  deuda: number;
};

export type TopDeudor = {
  placa: string;
  nombre: string;
  deuda_total: number;
  dias_mora: number;
  visitador: string;
};

export type DeudaPorVisitador = {
  visitador: string;
  cantidad: number;
  deuda: number;
};

export type CarteraMetricas = {
  generado_en: string;
  cartera: {
    deuda_total: number;
    total_clientes: number;
    deuda_promedio: number;
    sin_pago_hoy: number;
    con_pago_hoy: number;
    pct_sin_pago_hoy: number;
    cumplimiento_promedio: number;
    con_gps_funcional: number;
  };
  morosos: {
    total: number;
    deuda_total: number;
    pct_de_cartera: number;
    criticos: number;
    sin_pago_hoy: number;
    con_gps_funcional: number;
    pago_diario_sin_abono: number;
    recuperable_minimo: number;
    por_riesgo: Record<RiesgoMora, { cantidad: number; deuda: number }>;
    por_tendencia: Record<TendenciaDeuda, { cantidad: number; deuda: number }>;
  };
  distribucion_mora: BucketMora[];
  distribucion_deuda: BucketDeuda[];
  top_deudores: TopDeudor[];
  por_visitador: DeudaPorVisitador[];
};

const BUCKETS_MORA: Array<{ etiqueta: string; min: number; max: number | null }> = [
  { etiqueta: "0–7 días", min: 0, max: 7 },
  { etiqueta: "8–15 días", min: 8, max: 15 },
  { etiqueta: "16–30 días", min: 16, max: 30 },
  { etiqueta: "31–60 días", min: 31, max: 60 },
  { etiqueta: "60+ días", min: 61, max: null },
];

const BUCKETS_DEUDA: Array<{ etiqueta: string; min: number; max: number | null }> = [
  { etiqueta: "< $500k", min: 0, max: 499_999 },
  { etiqueta: "$500k–1M", min: 500_000, max: 999_999 },
  { etiqueta: "$1M–2M", min: 1_000_000, max: 1_999_999 },
  { etiqueta: "$2M+", min: 2_000_000, max: null },
];

function enBucket(
  valor: number,
  min: number,
  max: number | null,
): boolean {
  if (valor < min) return false;
  if (max != null && valor > max) return false;
  return true;
}

function initRiesgo(): Record<RiesgoMora, { cantidad: number; deuda: number }> {
  return {
    bajo: { cantidad: 0, deuda: 0 },
    medio: { cantidad: 0, deuda: 0 },
    alto: { cantidad: 0, deuda: 0 },
    critico: { cantidad: 0, deuda: 0 },
  };
}

function initTendencia(): Record<TendenciaDeuda, { cantidad: number; deuda: number }> {
  return {
    estable: { cantidad: 0, deuda: 0 },
    creciente: { cantidad: 0, deuda: 0 },
    mejorando: { cantidad: 0, deuda: 0 },
  };
}

export function calcularMetricasCartera(
  atrasos: ResultadoAtraso[],
  morosos: ResultadoMoroso[],
  conGpsFuncionalAtrasos = 0,
  conGpsFuncionalMorosos = 0,
): CarteraMetricas {
  const deudaCartera = atrasos.reduce((s, a) => s + a.deuda_total, 0);
  const deudaMorosos = morosos.reduce((s, m) => s + m.deuda_total, 0);
  const sinPagoHoy = atrasos.filter((a) => !a.pago_hoy).length;
  const cumplimientoPromedio =
    atrasos.length > 0
      ? Math.round(
          atrasos.reduce((s, a) => s + a.cumplimiento_pct, 0) / atrasos.length,
        )
      : 0;

  const porRiesgo = initRiesgo();
  const porTendencia = initTendencia();
  for (const m of morosos) {
    porRiesgo[m.riesgo_mora].cantidad += 1;
    porRiesgo[m.riesgo_mora].deuda += m.deuda_total;
    porTendencia[m.tendencia_deuda].cantidad += 1;
    porTendencia[m.tendencia_deuda].deuda += m.deuda_total;
  }

  const distribucionMora: BucketMora[] = BUCKETS_MORA.map((b) => {
    const items = atrasos.filter((a) => enBucket(a.dias_mora, b.min, b.max));
    return {
      ...b,
      cantidad: items.length,
      deuda: items.reduce((s, a) => s + a.deuda_total, 0),
    };
  });

  const distribucionDeuda: BucketDeuda[] = BUCKETS_DEUDA.map((b) => {
    const items = atrasos.filter((a) => enBucket(a.deuda_total, b.min, b.max));
    return {
      ...b,
      cantidad: items.length,
      deuda: items.reduce((s, a) => s + a.deuda_total, 0),
    };
  });

  const visitadorMap = new Map<string, { cantidad: number; deuda: number }>();
  for (const a of atrasos) {
    const v = a.visitador?.trim() || "Sin visitador";
    const prev = visitadorMap.get(v) ?? { cantidad: 0, deuda: 0 };
    visitadorMap.set(v, {
      cantidad: prev.cantidad + 1,
      deuda: prev.deuda + a.deuda_total,
    });
  }

  const porVisitador = [...visitadorMap.entries()]
    .map(([visitador, data]) => ({ visitador, ...data }))
    .sort((a, b) => b.deuda - a.deuda)
    .slice(0, 8);

  const topDeudores: TopDeudor[] = [...atrasos]
    .sort((a, b) => b.deuda_total - a.deuda_total)
    .slice(0, 5)
    .map((a) => ({
      placa: a.placa,
      nombre: a.nombre,
      deuda_total: a.deuda_total,
      dias_mora: a.dias_mora,
      visitador: a.visitador,
    }));

  return {
    generado_en: new Date().toISOString(),
    cartera: {
      deuda_total: deudaCartera,
      total_clientes: atrasos.length,
      deuda_promedio:
        atrasos.length > 0 ? Math.round(deudaCartera / atrasos.length) : 0,
      sin_pago_hoy: sinPagoHoy,
      con_pago_hoy: atrasos.length - sinPagoHoy,
      pct_sin_pago_hoy:
        atrasos.length > 0
          ? Math.round((sinPagoHoy / atrasos.length) * 100)
          : 0,
      cumplimiento_promedio: cumplimientoPromedio,
      con_gps_funcional: conGpsFuncionalAtrasos,
    },
    morosos: {
      total: morosos.length,
      deuda_total: deudaMorosos,
      pct_de_cartera:
        deudaCartera > 0
          ? Math.round((deudaMorosos / deudaCartera) * 100)
          : 0,
      criticos: morosos.filter((m) => m.riesgo_mora === "critico").length,
      sin_pago_hoy: morosos.filter((m) => !m.pago_hoy).length,
      con_gps_funcional: conGpsFuncionalMorosos,
      pago_diario_sin_abono: morosos.filter((m) => m.pago_diario_sin_abono)
        .length,
      recuperable_minimo: Math.round(deudaMorosos * PORCENTAJE_MINIMO_COBRO),
      por_riesgo: porRiesgo,
      por_tendencia: porTendencia,
    },
    distribucion_mora: distribucionMora,
    distribucion_deuda: distribucionDeuda,
    top_deudores: topDeudores,
    por_visitador: porVisitador,
  };
}
