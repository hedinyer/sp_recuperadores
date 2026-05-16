/**
 * Algoritmo de extracto — réplica de `client_report.py` / `func extrac.txt`.
 * `generarFilasExtracto` ≡ `generar_dataframe_extracto`
 * `calcularResumenExtracto` ≡ `calcular_resumen_extracto`
 */

export type RegistroExtracto = {
  fecha: Date;
  valor: number;
  tipo: string;
  referencia: string;
};

export type MetricasExtracto = {
  cuotas_generadas: number;
  cuotas_completas: number;
  cuotas_pagadas: number;
  cuotas_pendientes: number;
  total_pagado: number;
  deuda_total: number;
  ultimo_pago: string;
  dias_mora: number;
  cumplimiento_pct: number;
};

type RegistroModificado = {
  fecha: Date;
  valor: number;
  tipo: string;
  referencia: string;
};

export type FilaExtracto = {
  fechaProgramada: Date;
  fechaPago: Date | "";
  valorPagado: number;
  tipo: string;
  referencia: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / 86400000);
}

function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cur = startOfDay(start);
  const endD = startOfDay(end);
  while (cur.getTime() <= endD.getTime()) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function formatFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Equivalente a `generar_dataframe_extracto` en client_report.py */
export function generarFilasExtracto(
  fechaInicio: Date,
  valorCuota: number,
  registros: RegistroExtracto[],
): FilaExtracto[] {
  if (valorCuota <= 0) {
    throw new Error("valor_cuota inválido");
  }

  const inicio = startOfDay(fechaInicio);
  let fin = startOfDay(new Date());

  const registrosModificados: RegistroModificado[] = registros
    .filter((r) => r.valor != null && !Number.isNaN(Number(r.valor)))
    .map((r) => ({
      fecha: startOfDay(r.fecha),
      valor: Number(r.valor),
      tipo: r.tipo || "",
      referencia: r.referencia || "",
    }));

  const total = registrosModificados.reduce((s, r) => s + r.valor, 0);
  const cuotasPagadasCeil = total > 0 ? Math.ceil(total / valorCuota) : 0;

  const diasRango = daysBetween(inicio, fin) + 1;
  if (cuotasPagadasCeil > diasRango) {
    fin = new Date(fin);
    fin.setDate(fin.getDate() + (cuotasPagadasCeil - diasRango));
  }

  const filas: FilaExtracto[] = dateRange(inicio, fin).map((d) => ({
    fechaProgramada: d,
    fechaPago: "",
    valorPagado: 0,
    tipo: "",
    referencia: "",
  }));

  let saldo = 0;
  let pagosIdx = 0;

  for (let i = 0; i < filas.length; i++) {
    while (pagosIdx < registrosModificados.length && saldo < valorCuota) {
      const reg = registrosModificados[pagosIdx];
      let valor = reg.valor;

      while (valor + saldo >= valorCuota) {
        const faltaParaCuota = valorCuota - saldo;
        filas[i].valorPagado += faltaParaCuota;
        filas[i].fechaPago = reg.fecha;
        if (filas[i].referencia === "") filas[i].referencia = reg.referencia;
        if (filas[i].tipo === "") filas[i].tipo = reg.tipo;
        valor -= faltaParaCuota;
        saldo = 0;
        i += 1;
        if (i >= filas.length) break;
      }
      if (i >= filas.length) break;

      saldo += valor;
      if (valor > 0) {
        filas[i].valorPagado += valor;
        if (filas[i].tipo === "") filas[i].tipo = reg.tipo;
      }
      if (saldo >= valorCuota) {
        filas[i].fechaPago = reg.fecha;
        if (filas[i].referencia === "") filas[i].referencia = reg.referencia;
        if (filas[i].tipo === "") filas[i].tipo = reg.tipo;
        saldo -= valorCuota;
      } else {
        pagosIdx += 1;
      }
    }
  }

  return filas;
}

/** Equivalente a `calcular_resumen_extracto` en client_report.py */
export function calcularResumenExtracto(
  filas: FilaExtracto[],
  valorCuota: number,
): Pick<
  MetricasExtracto,
  | "cuotas_generadas"
  | "cuotas_completas"
  | "cuotas_pagadas"
  | "cuotas_pendientes"
  | "total_pagado"
  | "deuda_total"
> {
  const total = filas.reduce((s, f) => s + f.valorPagado, 0);
  let cuotasPagadasCompletas = 0;
  let remanente = 0;
  for (const f of filas) {
    cuotasPagadasCompletas += Math.floor(f.valorPagado / valorCuota);
    remanente += f.valorPagado % valorCuota;
  }
  const fraccionCuota = remanente / valorCuota;
  const cuotasPagadas = cuotasPagadasCompletas + fraccionCuota;
  const cuotasVencidas = filas.length;
  const cuotasPendientes = cuotasVencidas - cuotasPagadas;
  const valorPendiente = cuotasPendientes * valorCuota;

  return {
    cuotas_generadas: cuotasVencidas,
    cuotas_completas: cuotasPagadasCompletas,
    cuotas_pagadas: cuotasPagadas,
    cuotas_pendientes: cuotasPendientes,
    total_pagado: total,
    deuda_total: valorPendiente,
  };
}

/** Métricas completas para la web (client_report + campos de mora). */
export function calcularMetricasExtracto(
  fechaInicio: Date,
  valorCuota: number,
  registros: RegistroExtracto[],
): MetricasExtracto {
  const filas = generarFilasExtracto(fechaInicio, valorCuota, registros);
  const resumen = calcularResumenExtracto(filas, valorCuota);

  let ultimoPago = "";
  if (registros.length > 0) {
    const maxFecha = registros.reduce(
      (max, r) => (r.fecha > max ? r.fecha : max),
      registros[0].fecha,
    );
    ultimoPago = formatFecha(startOfDay(maxFecha));
  }

  const fin = startOfDay(new Date());
  const diasMora = ultimoPago
    ? daysBetween(new Date(ultimoPago), fin)
    : resumen.cuotas_generadas;

  const cumplimientoPct =
    resumen.cuotas_generadas > 0
      ? Math.round((1000 * resumen.cuotas_pagadas) / resumen.cuotas_generadas) /
        10
      : 0;

  return {
    ...resumen,
    ultimo_pago: ultimoPago,
    dias_mora: diasMora,
    cumplimiento_pct: cumplimientoPct,
  };
}
