/** Reparto FIFO de un pago sobre facturas pendientes (pesos enteros). */

export type FacturaPendiente = {
  id: number;
  fecha: string; // YYYY-MM-DD
  total: number;
  pagado: number;
  saldo: number;
};

export type Allocation = {
  facturaId: number;
  fecha: string;
  saldoAntes: number;
  aplicar: number;
};

export function planFifo(
  facturas: FacturaPendiente[],
  monto: number,
): { plan: Allocation[]; sobrante: number } {
  let restante = monto;
  const plan: Allocation[] = [];
  for (const f of facturas) {
    if (restante <= 0) break;
    const aplicar = Math.min(restante, f.saldo);
    if (aplicar <= 0) continue;
    plan.push({
      facturaId: f.id,
      fecha: f.fecha,
      saldoAntes: f.saldo,
      aplicar,
    });
    restante -= aplicar;
  }
  return { plan, sobrante: restante };
}
