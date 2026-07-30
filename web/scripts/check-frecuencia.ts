/**
 * Check mínimo del detector de frecuencia.
 * npx tsx scripts/check-frecuencia.ts
 */
import {
  analizarPatronPago,
  detectarFrecuencia,
} from "../src/lib/analisisMorosidad";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const diaria = detectarFrecuencia([1, 1, 1, 1]);
assert(diaria.frecuencia === "diaria", `esperaba diaria, got ${diaria.frecuencia}`);
assert(diaria.regularidad >= 0.9, `esperaba regular, got ${diaria.regularidad}`);

// Media ~10.3 queda entre semanal y quincenal → bucket irregular
const fueraBucket = detectarFrecuencia([10, 11, 10]);
assert(
  fueraBucket.frecuencia === "irregular",
  `esperaba irregular (fuera de bucket), got ${fueraBucket.frecuencia}`,
);

// Alta dispersión aunque la media caiga en semanal → pagos_irregulares
const base = new Date("2026-01-01");
const gaps = [1, 7, 2, 14];
let t = 0;
const regs = gaps.map((g, i) => {
  t += g;
  return {
    fecha: new Date(base.getTime() + t * 86400000),
    valor: 50000,
    tipo: "pago",
    referencia: String(i),
  };
});
// primer pago en día 0
regs.unshift({
  fecha: base,
  valor: 50000,
  tipo: "pago",
  referencia: "0",
});

const patron = analizarPatronPago(regs);
assert(patron.pagos_irregulares, "esperaba pagos_irregulares con gaps dispersos");
assert(patron.regularidad_score < 0.45, `regularidad alta: ${patron.regularidad_score}`);

console.log("ok: detectarFrecuencia + analizarPatronPago");
