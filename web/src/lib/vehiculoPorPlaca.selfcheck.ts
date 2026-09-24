/**
 * Self-check: mapeo SP + prioridad BGA/Bogotá vs Railweb.
 * Run: npx tsx src/lib/vehiculoPorPlaca.selfcheck.ts
 */
import {
  buildFilaSp,
  elegirCompraSp,
  type CompraSp,
} from "./vehiculoPorPlacaBga";
import { elegirFilaPlaca, elegirMejorSp, esFuenteSp } from "./vehiculoPorPlaca";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const compraBase: CompraSp = {
  id: "c1",
  placa: "abc 12d",
  estado: "entregada",
  estado_fisico: "activa",
  user_id: 1,
  monto_cuota_periodo: 40000,
  fecha_entrega: "2026-01-10",
  digital_contract_id: "dc1",
  seleccionado_at: "2026-01-01T00:00:00Z",
};

const cliente = { cedula: "123", nombre: "Ana", telefono: "300" };

const filaBga = buildFilaSp(
  "bga",
  compraBase,
  cliente,
  {
    monto_adeudado: 120000,
    dias_atraso: 9,
    periodos_pagados: 3,
    periodos_debidos: 6,
  },
  { total_pagado: 200000, ultimo_pago: "2026-03-01" },
);

assert(filaBga.fuente === "bga", "fuente bga");
assert(filaBga.placa === "ABC12D", `placa ${filaBga.placa}`);
assert(filaBga.deuda_total === "120000", `deuda ${filaBga.deuda_total}`);
assert(filaBga.cuotas_pagadas === "3", `pagadas ${filaBga.cuotas_pagadas}`);
assert(filaBga.cuotas_generadas === "6", `gen ${filaBga.cuotas_generadas}`);
assert(filaBga.cuotas_pendientes === "9", `pend ${filaBga.cuotas_pendientes}`);
assert(filaBga.ultimo_pago === "2026-03-01", `ult ${filaBga.ultimo_pago}`);
assert(filaBga.estado_contrato === "Activo", `ct ${filaBga.estado_contrato}`);
assert(filaBga.etiqueta_estado === "", "sin banner si está en calle");
assert(esFuenteSp(filaBga), "esFuenteSp bga");

const filaTaller = buildFilaSp(
  "bogota",
  { ...compraBase, estado_fisico: "taller" },
  cliente,
  { monto_adeudado: 80000, dias_atraso: 4 },
  { total_pagado: 0, ultimo_pago: "" },
);
assert(filaTaller.fuente === "bogota", "fuente bogota");
assert(filaTaller.estado_vehiculo === "Taller", filaTaller.estado_vehiculo);
assert(filaTaller.etiqueta_estado === "TALLER", filaTaller.etiqueta_estado);
assert(filaTaller.deuda_al_corte === "1", "deuda al corte si no está en calle");
assert(filaTaller.cuotas_pendientes === "4", `pend dias ${filaTaller.cuotas_pendientes}`);

const railwebActivo = {
  fuente: "railweb",
  estado_contrato: "Activo",
  estado_vehiculo: "Activo",
  placa: "ABC12D",
  deuda_total: "1",
};

assert(
  elegirFilaPlaca(railwebActivo, filaBga, null)?.fuente === "bga",
  "SP vigente gana a Railweb activo",
);
assert(
  elegirFilaPlaca(railwebActivo, null, null)?.fuente === "railweb",
  "solo Railweb",
);
assert(
  elegirFilaPlaca(null, null, filaTaller)?.fuente === "bogota",
  "solo Bogotá",
);

const filaBgaVieja = buildFilaSp(
  "bga",
  { ...compraBase, fecha_entrega: "2025-01-01", seleccionado_at: "2025-01-01" },
  cliente,
  { monto_adeudado: 1 },
  { total_pagado: 0, ultimo_pago: "" },
);
assert(
  elegirMejorSp(filaBgaVieja, filaTaller)?.fuente === "bga",
  "en calle gana a taller aunque sea más vieja",
);

const cancelada = buildFilaSp(
  "bga",
  { ...compraBase, estado: "cancelada" },
  cliente,
  { monto_adeudado: 0 },
  { total_pagado: 0, ultimo_pago: "" },
);
assert(cancelada.estado_contrato === "Inactivo", cancelada.estado_contrato);
assert(cancelada.etiqueta_estado === "INACTIVO", cancelada.etiqueta_estado);
assert(
  elegirFilaPlaca(railwebActivo, cancelada, null)?.fuente === "railweb",
  "cancelada no gana a Railweb",
);
assert(
  elegirFilaPlaca(null, cancelada, null)?.fuente === "bga",
  "cancelada se muestra si no hay Railweb",
);

const compras: CompraSp[] = [
  { ...compraBase, id: "old", placa: "ABC12D", estado: "cancelada" },
  {
    ...compraBase,
    id: "new",
    placa: "ABC12D",
    estado: "entregada",
    fecha_entrega: "2026-06-01",
  },
  { ...compraBase, id: "other", placa: "ABC99Z", estado: "entregada" },
];
assert(elegirCompraSp(compras, "ABC12D")?.id === "new", "elige vigente exacta");
assert(elegirCompraSp(compras, "ABC12")?.id === "new", "prefijo 5 letras");

console.log("vehiculoPorPlaca.selfcheck ok");
