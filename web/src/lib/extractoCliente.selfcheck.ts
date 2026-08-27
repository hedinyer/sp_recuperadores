/**
 * Self-check: días congelados no generan cuota ni mora.
 * Run: npx tsx src/lib/extractoCliente.selfcheck.ts
 */
import { calcularMetricasExtracto } from "./extractoCliente";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const inicio = new Date(2026, 0, 1);
const ref = new Date(2026, 0, 10);
const freeze = ["2026-01-06", "2026-01-07"];

const sinPago = calcularMetricasExtracto(inicio, 1000, [], 365, ref, freeze);
assert(sinPago.cuotas_generadas === 8, `cuotas gen ${sinPago.cuotas_generadas}`);
assert(sinPago.deuda_total === 8000, `deuda ${sinPago.deuda_total}`);

const sinFreeze = calcularMetricasExtracto(inicio, 1000, [], 365, ref);
assert(sinFreeze.cuotas_generadas === 10, "sin freeze 10 días");
assert(sinFreeze.deuda_total === 10000, "sin freeze 10000");

const conPago = calcularMetricasExtracto(
  inicio,
  1000,
  [{ fecha: new Date(2026, 0, 5), valor: 5000, tipo: "", referencia: "" }],
  365,
  ref,
  freeze,
);
assert(conPago.deuda_total === 3000, `deuda tras pago ${conPago.deuda_total}`);
assert(conPago.dias_mora === 3, `mora ${conPago.dias_mora}`);

console.log("extractoCliente.selfcheck: ok");
