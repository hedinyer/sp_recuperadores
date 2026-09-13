/**
 * node --experimental-strip-types src/lib/ventasMix.selfcheck.ts
 */
import {
  normalizarColor,
  normalizarFrecuencia,
  normalizarModelo,
} from "./ventasMix.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const modelos: Array<[string, string]> = [
  ["BERA SBR 150", "SBR 150"],
  ["Sbr 150", "SBR 150"],
  ["SBR150", "SBR 150"],
  ["SBR", "SBR 150"],
  ["Sbr 151", "SBR 150"],
  ["AKT NKD 125", "NKD 125"],
  ["NKD 125", "NKD 125"],
  ["NKD125", "NKD 125"],
  ["BERA GBR 200", "GBR 200"],
  ["Gbr 200", "GBR 200"],
  ["GBR200", "GBR 200"],
  ["BERA MILAN", "Milan 150"],
  ["Milan 150", "Milan 150"],
  ["MILAN", "Milan 150"],
  ["Chr 125", "CHR 125"],
  ["Flex 110", "Flex 110"],
  ["BERA150", "SBR 150"],
  ["Bera", "Bera"],
  ["", "Sin dato"],
];

for (const [in_, out] of modelos) {
  assert(
    normalizarModelo(in_) === out,
    `modelo(${JSON.stringify(in_)}) → ${normalizarModelo(in_)} ≠ ${out}`,
  );
}

assert(normalizarColor("MORADA") === "Morado", "morada");
assert(normalizarColor("MORADO") === "Morado", "morado");
assert(normalizarColor("NEGRA") === "Negro", "negra");
assert(normalizarColor("NEGRO MATE") === "Negro mate", "negro mate");

assert(normalizarFrecuencia("Diario_7") === "Diario", "diario_7");
assert(normalizarFrecuencia("diario") === "Diario", "diario");
assert(normalizarFrecuencia("semanal") === "Semanal", "semanal");

console.log("ventasMix.selfcheck ok");
