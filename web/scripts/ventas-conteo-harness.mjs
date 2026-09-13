/**
 * Harness canónico de ventas.
 * Alineado con ventasMetricas.ts:
 *   Contado = ventas_moto (fecha created_at Bogotá)
 *   Crédito SP = ≥1 pago confirmado contexto ∈ {cuota_adelantada, tarifa, producto_cuota}
 *                (NO usa flag pago_cuota_confirmado solo)
 *   Fecha SP = pago_inicial_confirmado_at → fecha_entrega → seleccionado_at
 *   Rail = opcion_compra + EXISTS ítem tarifa pagada; fecha = fecha_inicio
 * Ventanas [hoy-(N-1), hoy] America/Bogota.
 *
 * node scripts/ventas-conteo-harness.mjs
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HOY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00-05:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function ymdBogota(iso) {
  if (!iso) return "";
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

const SEDES = [
  {
    id: "bga",
    url: "https://ngjpndqmkhhdqjjljfmp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY",
  },
  {
    id: "girardot",
    url: "https://iilgrapnrkwdcouielwz.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbGdyYXBucmt3ZGNvdWllbHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDEyODEsImV4cCI6MjA5NjUxNzI4MX0.82GJcFxinFQqxI8OSh40JdivYWK9hr1GRw6lyiqW_3E",
  },
  {
    id: "bogota",
    url: "https://ziihqvtjacqzwmcmpiyp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppaWhxdnRqYWNxendtY21waXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODYyODEsImV4cCI6MjA5OTU2MjI4MX0.DpEws4CRAb3B6Y35TJ7o0afxpaFu56Jfsh-9IKeCQkc",
  },
];

const RAIL = process.env.DATABASE_URL?.trim();
if (!RAIL) {
  console.error("DATABASE_URL requerida para Railweb");
  process.exit(1);
}

const CUOTA_CTX = new Set(["tarifa", "producto_cuota", "cuota_adelantada"]);

async function fetchAll(sb, table, select) {
  const page = 1000;
  const out = [];
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < page) break;
  }
  return out;
}

async function spRows(sede) {
  const sb = createClient(sede.url, sede.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const out = [];

  const contado = await fetchAll(sb, "ventas_moto", "id, created_at, placa");
  for (const r of contado) {
    out.push({
      sede: sede.id,
      tipo: "contado",
      fecha: ymdBogota(r.created_at),
      def: "contado",
      placa: r.placa,
    });
  }

  const pagos = await fetchAll(
    sb,
    "pagos",
    "user_moto_compra_id, contexto_pago, estado",
  );
  const compraHasCuota = new Set();
  for (const p of pagos) {
    if (p.estado !== "confirmado" || !p.user_moto_compra_id) continue;
    if (CUOTA_CTX.has(p.contexto_pago)) {
      compraHasCuota.add(String(p.user_moto_compra_id));
    }
  }

  const credito = await fetchAll(
    sb,
    "user_moto_compra",
    "id, estado, placa, fecha_entrega, seleccionado_at, pago_inicial_confirmado_at",
  );

  for (const r of credito) {
    if (r.estado === "cancelada") continue;
    if (!compraHasCuota.has(String(r.id))) continue;
    const fechaVenta =
      ymdBogota(r.pago_inicial_confirmado_at) ||
      ymdBogota(r.fecha_entrega) ||
      ymdBogota(r.seleccionado_at);
    if (!fechaVenta) continue;
    out.push({
      sede: sede.id,
      tipo: "credito",
      fecha: fechaVenta,
      def: "sp_con_cuota",
      placa: r.placa,
    });
  }
  return out;
}

async function railRows() {
  const pool = new pg.Pool({ connectionString: RAIL });
  try {
    const { rows } = await pool.query(`
      SELECT ct.id, ct.fecha_inicio::date::text AS fecha
      FROM arrendamientos_contrato ct
      JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
      JOIN clientes_cliente cl ON cl.id = ct.cliente_id
      LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
      WHERE ct.tipo_contrato = 'opcion_compra'
        AND COALESCE(ven.nombre, '') NOT ILIKE '%RENOVACION%'
        AND COALESCE(ven.nombre, '') NOT ILIKE '%CAMBIO TITULAR%'
        AND EXISTS (
          SELECT 1
          FROM terminal_pagos_factura f
          JOIN terminal_pagos_itemfactura i
            ON i.factura_id = f.id AND i.tipo_item = 'tarifa'
          WHERE f.contrato_id = ct.id
            AND lower(f.estado) <> 'anulada'
            AND f.estado_pago = 'pagada'
            AND COALESCE(i.subtotal, 0) > 0
        )
    `);
    return rows.map((r) => ({
      sede: "railweb",
      tipo: "credito",
      fecha: r.fecha,
      def: "rail_con_cuota",
      placa: null,
    }));
  } finally {
    await pool.end();
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function sliceVentana(all, n) {
  const desde = addDays(HOY, -(n - 1));
  return all.filter((r) => r.fecha >= desde && r.fecha <= HOY);
}

function metrics(slice) {
  const bySede = { bga: 0, girardot: 0, bogota: 0, railweb: 0 };
  let contado = 0;
  let credito = 0;
  for (const r of slice) {
    bySede[r.sede] = (bySede[r.sede] ?? 0) + 1;
    if (r.tipo === "contado") contado++;
    else credito++;
  }
  return {
    total: slice.length,
    contado,
    credito,
    bga: bySede.bga,
    gir: bySede.girardot,
    bog: bySede.bogota,
    rail: bySede.railweb,
  };
}

console.log("Hoy Bogotá:", HOY);
console.log("Canónica: ≥1 cuota_adelantada|tarifa|producto_cuota (+ contado)\n");

const [spParts, rail] = await Promise.all([
  Promise.all(SEDES.map((s) => spRows(s))),
  railRows(),
]);
const all = [...spParts.flat(), ...rail];

const VENTANAS = [7, 15, 30, 60, 90, 120];
const SEDES_KEYS = ["bga", "gir", "bog", "rail"];
const fails = [];
const warns = [];
const block = [];

console.log("N | total | contado | credito | bga | gir | bog | rail");
for (const n of VENTANAS) {
  const desde = addDays(HOY, -(n - 1));
  const m = metrics(sliceVentana(all, n));
  const row = { n, desde, hasta: HOY, ...m };
  block.push(row);
  console.log(
    `${n} | ${m.total} | ${m.contado} | ${m.credito} | ${m.bga} | ${m.gir} | ${m.bog} | ${m.rail}`,
  );
}

// Monotonía global + por sede
for (let i = 0; i < VENTANAS.length - 1; i++) {
  const a = block[i];
  const b = block[i + 1];
  if (a.total > b.total) {
    fails.push(`monotonía total: ${a.n}d=${a.total} > ${b.n}d=${b.total}`);
  }
  for (const k of SEDES_KEYS) {
    if (a[k] > b[k]) {
      fails.push(`monotonía ${k}: ${a.n}d=${a[k]} > ${b.n}d=${b[k]}`);
    }
  }
}

const row7 = block[0];
if (row7.bog <= 0) {
  fails.push("Bogotá 7d = 0 (regresión: debe incluir cuota_adelantada)");
}

const basura = all.filter(
  (r) =>
    r.def === "sp_con_cuota" &&
    (!r.placa || String(r.placa).toUpperCase() === "XXXX"),
);
if (basura.length) {
  warns.push(
    `${basura.length} crédito SP con placa vacía/XXXX (no excluidas de la fórmula)`,
  );
}

const desde7 = addDays(HOY, -6);
const bog7 = all.filter(
  (r) =>
    r.sede === "bogota" &&
    r.def === "sp_con_cuota" &&
    r.fecha >= desde7 &&
    r.fecha <= HOY,
);
console.log("\nBogotá 7d placas:", bog7.map((r) => `${r.fecha} ${r.placa}`));

const ok = fails.length === 0;
const veredicto = { ok, fails, warns };

const report = {
  hoy: HOY,
  definicion:
    "contado ventas_moto + crédito con ≥1 pago cuota_adelantada|tarifa|producto_cuota; rail ítem tarifa",
  definiciones: { CANONICA_cuota: block },
  veredicto,
};

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "ventas-conteo-harness.json",
);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("\n=== Canónicos ===");
for (const r of block) {
  console.log(
    `${r.n}d → ${r.total} (BGA ${r.bga} · Gir ${r.gir} · Bog ${r.bog} · Rail ${r.rail})`,
  );
}
console.log("\nVeredicto:", ok ? "OK" : "FAIL", JSON.stringify(veredicto));
console.log(`Harness → ${outPath}`);

if (!ok) {
  for (const f of fails) assert(false, f);
}
