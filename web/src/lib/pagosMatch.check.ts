/**
 * Self-check: parse COP, ventana de hora, no reusar documento.
 * Run: npx tsx src/lib/pagosMatch.check.ts
 */

import {
  parseFechaYmd,
  parseHora,
  parseMontoCop,
  esIngreso,
} from "./pagosExtracto";
import {
  diferenciaMinutos,
  filtrarCandidatos,
  marcarUsado,
  claveMovimiento,
  type OcrConsenso,
} from "./pagosMatch";
import type { MovimientoExtracto } from "./pagosExtracto";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const movs: MovimientoExtracto[] = [
  {
    id: "111|2026-09-10|23:50:04",
    fecha: "2026-09-10",
    hora: "23:50:04",
    monto_cop: 40000,
    documento: "111",
    transaccion: "Nota Crédito",
    oficina: "Redeban BreB",
    referencia2: "x",
    motivo: "Pago",
  },
  {
    id: "222|2026-09-10|23:40:29",
    fecha: "2026-09-10",
    hora: "23:40:29",
    monto_cop: 40000,
    documento: "222",
    transaccion: "Nota Crédito",
    oficina: "Redeban BreB",
    referencia2: "x",
    motivo: "Pago",
  },
];

assert(parseMontoCop("$ 40.000,00") === 40000, "parse COP $ 40.000,00");
assert(parseMontoCop("$ 63.968,67") === 63969 || parseMontoCop("$ 63.968,67") === 63968, "parse COP redondeo");
// Exact: Math.round(63968.67) = 63969
assert(parseMontoCop("$ 63.968,67") === 63969, "parse COP centavos");
assert(parseFechaYmd("10/09/2026") === "2026-09-10", "fecha dmy");
assert(parseHora("23:50:04") === "23:50:04", "hora");
assert(esIngreso("Nota Crédito"), "ingreso credito");
assert(!esIngreso("Nota Débito"), "no debito");

assert(diferenciaMinutos("23:50:04", "23:45:00") === 5, "delta 5 min");
assert(diferenciaMinutos("23:50:04", "23:20:00") === 30, "delta 30 min");

const ocr: OcrConsenso = {
  monto_cop: 40000,
  fecha: "2026-09-10",
  hora: "23:48:00",
  votos: 8,
  total_ocr: 10,
};

const c1 = filtrarCandidatos(movs, ocr);
assert(c1.length === 2, "dos candidatos ±20");
assert(c1[0]!.documento === "111", "más cercano primero");

let usados = new Set<string>();
usados = marcarUsado(usados, c1[0]!);
const c2 = filtrarCandidatos(movs, ocr, usados);
assert(c2.length === 1 && c2[0]!.documento === "222", "no reusa documento");
assert(usados.has(claveMovimiento(c1[0]!)), "marcado usado");

const fuera = filtrarCandidatos(movs, {
  monto_cop: 40000,
  fecha: "2026-09-10",
  hora: "10:00:00",
});
assert(fuera.length === 0, "fuera de ventana");

console.log("pagosMatch.check: ok");
