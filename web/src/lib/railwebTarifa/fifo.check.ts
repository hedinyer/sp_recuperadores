/**
 * Self-check FIFO. Run: npx tsx src/lib/railwebTarifa/fifo.check.ts
 */
import assert from "node:assert";

import { planFifo, type FacturaPendiente } from "./fifo";

const facturas: FacturaPendiente[] = [
  { id: 101, fecha: "2026-06-18", total: 41000, pagado: 0, saldo: 41000 },
  { id: 102, fecha: "2026-06-19", total: 41000, pagado: 0, saldo: 41000 },
  { id: 103, fecha: "2026-06-21", total: 41000, pagado: 0, saldo: 41000 },
];

let r = planFifo(facturas, 8000);
assert.strictEqual(r.plan.length, 1);
assert.strictEqual(r.plan[0]!.aplicar, 8000);
assert.strictEqual(r.sobrante, 0);

r = planFifo(facturas, 100000);
assert.strictEqual(r.plan.length, 3);
assert.strictEqual(r.plan[0]!.aplicar, 41000);
assert.strictEqual(r.plan[2]!.aplicar, 18000);
assert.strictEqual(r.sobrante, 0);

r = planFifo(facturas, 200000);
assert.strictEqual(r.plan.length, 3);
assert.strictEqual(r.sobrante, 77000);

r = planFifo([], 5000);
assert.strictEqual(r.plan.length, 0);
assert.strictEqual(r.sobrante, 5000);

// Guardrail: el módulo de registro no debe ejecutar DELETE ni anular
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registrarSrc = readFileSync(join(__dirname, "index.ts"), "utf8");
const facturaSrc = readFileSync(join(__dirname, "facturaTarifa.ts"), "utf8");
const all = `${registrarSrc}\n${facturaSrc}`;
assert.ok(
  !/\bDELETE\s+FROM\b/i.test(all),
  "railwebTarifa no debe contener DELETE FROM",
);
assert.ok(
  !/\b(UPDATE|SET)\b[\s\S]{0,80}\banulad/i.test(all),
  "railwebTarifa no debe anular facturas",
);

console.log("railwebTarifa/fifo.check: ok");
