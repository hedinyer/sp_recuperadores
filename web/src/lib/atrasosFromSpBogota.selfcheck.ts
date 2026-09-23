/**
 * Self-check: mapper Pinilla → placa / deuda / nombre.
 * Run: npx tsx src/lib/atrasosFromSpBogota.selfcheck.ts
 */
import { mapearFilaPinilla } from "./atrasosFromSpBogota";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const mapped = mapearFilaPinilla({
  dias_atraso: 6,
  monto_adeudado: 850000,
  user_id: 1,
  user_moto_compra: { placa: "abc 12d", monto_cuota_periodo: 40000 },
  users: {
    user: "123456",
    digital_contracts: [
      {
        hoja_vida_data: { nombre_completo: "Ana Pérez", celular: "3001234567" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
});

assert(mapped != null, "mapea fila válida");
assert(mapped!.placa === "ABC12D", `placa ${mapped?.placa}`);
assert(mapped!.deuda_total === 850000, `deuda ${mapped?.deuda_total}`);
assert(mapped!.nombre === "Ana Pérez", `nombre ${mapped?.nombre}`);
assert(mapped!.telefono === "3001234567", `tel ${mapped?.telefono}`);
assert(mapped!.cedula === "123456", `cedula ${mapped?.cedula}`);
assert(mapped!.origen === "pinilla", "origen pinilla");

assert(mapearFilaPinilla({ monto_adeudado: 1000 }) === null, "sin placa");
assert(
  mapearFilaPinilla({
    monto_adeudado: 0,
    user_moto_compra: { placa: "ABC12D" },
  }) === null,
  "sin deuda",
);

console.log("atrasosFromSpBogota.selfcheck ok");
