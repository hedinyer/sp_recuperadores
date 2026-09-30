/**
 * Harness de /informe-cartera: freeze no genera deuda; retenidas/inactivas/vitrina fuera.
 * Run: npx tsx src/lib/informeCartera.selfcheck.ts
 */
import { calcularMetricasExtracto } from "./extractoCliente";
import {
  bucketMora,
  clasificarZonaErp,
  esCarteraInformeActiva,
  esCompraSpEnCalle,
  esPlacaInforme,
  haversineKm,
  placaYaContada,
  registrarPlacas,
  BUCARAMANGA,
  CHIA,
} from "./informeCartera";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const inicio = new Date(2026, 0, 1);
const ref = new Date(2026, 0, 10);
const freeze = ["2026-01-06", "2026-01-07"];

const conFreeze = calcularMetricasExtracto(inicio, 1000, [], 365, ref, freeze);
assert(conFreeze.cuotas_generadas === 8, `freeze cuotas ${conFreeze.cuotas_generadas}`);
assert(conFreeze.deuda_total === 8000, `freeze deuda ${conFreeze.deuda_total}`);

const sinFreeze = calcularMetricasExtracto(inicio, 1000, [], 365, ref);
assert(sinFreeze.deuda_total === 10000, `sin freeze ${sinFreeze.deuda_total}`);
assert(
  conFreeze.deuda_total < sinFreeze.deuda_total,
  "congelados no pueden aumentar la deuda",
);

const pagoYFreeze = calcularMetricasExtracto(
  inicio,
  1000,
  [{ fecha: new Date(2026, 0, 5), valor: 5000, tipo: "", referencia: "" }],
  365,
  ref,
  freeze,
);
assert(pagoYFreeze.deuda_total === 3000, `deuda pago+freeze ${pagoYFreeze.deuda_total}`);
assert(pagoYFreeze.dias_mora === 3, `mora freeze ${pagoYFreeze.dias_mora}`);

assert(esCarteraInformeActiva("Activo", "Activo"), "activo+activo entra");
assert(!esCarteraInformeActiva("Retenido", "Activo"), "retenido fuera");
assert(!esCarteraInformeActiva("Activo", "Retenido"), "moto retenida fuera");
assert(!esCarteraInformeActiva("Inactivo", "Activo"), "inactivo fuera");
assert(!esCarteraInformeActiva("Activo", "Inactivo"), "moto inactiva fuera");
assert(!esCarteraInformeActiva("Activo", "Vitrina"), "vitrina fuera");
assert(!esCarteraInformeActiva("Cancelado", "Activo"), "cancelado fuera");
assert(!esCarteraInformeActiva("Activo", "Bodega"), "bodega fuera");

assert(esPlacaInforme("ABC12H"), "placa normal entra");
assert(!esPlacaInforme("TIR90H"), "TIR90H fuera");
assert(!esPlacaInforme(""), "sin placa fuera");

assert(bucketMora(0, 40_000) === "alDia", "mora 0 al día");
assert(bucketMora(4, 0) === "alDia", "sin deuda al día");
assert(bucketMora(3, 40_000) === "mora1a7", "1-7");
assert(bucketMora(8, 40_000) === "moraMas7", "+7");

assert(
  clasificarZonaErp({ nombre: "Juan Perez" }) === "santander",
  "sin GPS ni ciudad → Santander",
);
assert(
  clasificarZonaErp({ nombre: "Ana Bogota" }) === "bogota_chia",
  "nombre Bogotá",
);
assert(
  clasificarZonaErp({ nombre: "Luis", direccion: "Chia centro" }) ===
    "bogota_chia",
  "dirección Chía",
);
assert(
  clasificarZonaErp({
    nombre: "Pedro",
    pos: { lat: 4.71, lng: -74.07 },
  }) === "bogota_chia",
  "GPS lejos de Bucaramanga",
);
assert(
  haversineKm(BUCARAMANGA, CHIA) > SANTANDER_FROM_CHIA_MIN(),
  "Chía queda fuera del radio de Santander",
);

assert(esCompraSpEnCalle("entregada", "activa"), "SP activa");
assert(esCompraSpEnCalle("entregada", "en_transito"), "SP tránsito");
assert(esCompraSpEnCalle("entregada", null), "SP sin físico = activa");
assert(!esCompraSpEnCalle("entregada", "retenida"), "SP retenida fuera");
assert(!esCompraSpEnCalle("cancelada", "activa"), "SP cancelada fuera");

const calle80 = new Set<string>();
registrarPlacas(calle80, "ABC12H");
assert(placaYaContada("ABC12H", calle80), "misma placa Calle 80");
assert(placaYaContada("ABC12", calle80), "variante sin H también está en Calle 80");
assert(placaYaContada("ABC-12H", calle80), "con guion");
assert(!placaYaContada("XYZ99H", calle80), "otra placa no está");

function SANTANDER_FROM_CHIA_MIN(): number {
  return 150;
}

console.log("informeCartera.selfcheck: ok");
