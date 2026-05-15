/**
 * Métricas del extracto — misma lógica que `mostrar_registros` en `func extrac.txt`.
 * Consultas equivalentes:
 *   clientes: cedula, nombre, placa, fecha_inicio, valor_cuota (+ telefono, visitador para la web)
 *   registros: fecha_registro, valor, tipo, referencia ORDER BY fecha_registro
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / 86400000);
}

function formatFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Replica el reparto de pagos por día del DataFrame en `func extrac.txt`. */
export function calcularMetricasExtracto(
  fechaInicio: Date,
  valorCuota: number,
  registros: RegistroExtracto[],
): MetricasExtracto {
  if (valorCuota <= 0) {
    throw new Error("valor_cuota inválido");
  }

  const inicio = startOfDay(fechaInicio);
  let fin = startOfDay(new Date());

  const total = registros.reduce((s, r) => s + r.valor, 0);
  const cuotasPagadasCeil = Math.ceil(total / valorCuota);

  let diasRango = daysBetween(inicio, fin) + 1;
  if (cuotasPagadasCeil > diasRango) {
    fin = new Date(fin);
    fin.setDate(fin.getDate() + (cuotasPagadasCeil - diasRango));
  }

  const n = daysBetween(inicio, fin) + 1;
  const valorPagado = new Array<number>(n).fill(0);

  let saldo = 0;
  let pagosIdx = 0;
  const regs = registros.map((r) => ({ ...r, valor: Number(r.valor) }));

  for (let i = 0; i < n; i++) {
    while (pagosIdx < regs.length && saldo < valorCuota) {
      let { valor } = regs[pagosIdx];

      while (valor + saldo >= valorCuota) {
        const faltaParaCuota = valorCuota - saldo;
        valorPagado[i] += faltaParaCuota;
        valor -= faltaParaCuota;
        saldo = 0;
        i += 1;
        if (i >= n) break;
      }
      if (i >= n) break;

      saldo += valor;
      if (valor > 0) {
        valorPagado[i] += valor;
      }
      if (saldo >= valorCuota) {
        saldo -= valorCuota;
      } else {
        pagosIdx += 1;
      }
    }
  }

  let cuotasPagadasCompletas = 0;
  let remanente = 0;
  for (const v of valorPagado) {
    cuotasPagadasCompletas += Math.floor(v / valorCuota);
    remanente += v % valorCuota;
  }
  const fraccionCuota = remanente / valorCuota;
  const cuotasPagadas = cuotasPagadasCompletas + fraccionCuota;
  const cuotasVencidas = n;
  const cuotasPendientes = cuotasVencidas - cuotasPagadas;
  const valorPendiente = cuotasPendientes * valorCuota;

  let ultimoPago = "";
  if (registros.length > 0) {
    const maxFecha = registros.reduce(
      (max, r) => (r.fecha > max ? r.fecha : max),
      registros[0].fecha,
    );
    ultimoPago = formatFecha(startOfDay(maxFecha));
  }

  const diasMora = ultimoPago
    ? daysBetween(new Date(ultimoPago), fin)
    : cuotasVencidas;

  const cumplimientoPct =
    cuotasVencidas > 0
      ? Math.round((1000 * cuotasPagadas) / cuotasVencidas) / 10
      : 0;

  return {
    cuotas_generadas: cuotasVencidas,
    cuotas_completas: cuotasPagadasCompletas,
    cuotas_pagadas: cuotasPagadas,
    cuotas_pendientes: cuotasPendientes,
    total_pagado: total,
    deuda_total: valorPendiente,
    ultimo_pago: ultimoPago,
    dias_mora: diasMora,
    cumplimiento_pct: cumplimientoPct,
  };
}
