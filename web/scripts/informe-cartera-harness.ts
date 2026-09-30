/**
 * Harness canónico de /informe-cartera.
 * npx tsx scripts/informe-cartera-harness.ts
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  hoyBogotaYmd,
  totalesInforme,
  type ZonaId,
} from "../src/lib/informeCartera";
import {
  calcularInformeCarteraDesdeDb,
  cerrarPoolsInforme,
} from "../src/lib/informeCarteraFromDb";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const ymd = process.argv[2] || hoyBogotaYmd();
  console.log(`informe-cartera harness · corte ${ymd}`);

  const { corte, meta } = await calcularInformeCarteraDesdeDb(ymd);
  const tot = totalesInforme(corte.zonas);

  assert(meta.erp_incluidos > 0, "ERP sin motos activas");
  assert(
    tot.motos ===
      meta.erp_incluidos + corte.zonas.calle_80.motos + corte.zonas.girardot.motos,
    "suma motos",
  );
  assert(
    tot.alDia + tot.mora1a7 + tot.moraMas7 === tot.motos,
    "buckets cubren todas las motos",
  );
  assert(corte.taller >= 0, "taller");
  for (const id of Object.keys(corte.zonas) as ZonaId[]) {
    const z = corte.zonas[id];
    assert(z.motos === z.alDia + z.mora1a7 + z.moraMas7, `buckets ${id}`);
    assert(z.cartera >= 0, `cartera ${id}`);
  }

  const outPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "app",
    "informe-cartera",
    "corte.json",
  );
  writeFileSync(outPath, `${JSON.stringify(corte, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        corte: corte.corte,
        erp: meta.erp_incluidos,
        omitidas_sp: meta.omitidas_sp,
        freeze_contratos: meta.freeze_contratos,
        gps_keys: meta.gps_keys,
        taller: corte.taller,
        zonas: corte.zonas,
        total: tot,
      },
      null,
      2,
    ),
  );
  console.log(`Harness → ${outPath}`);

  await cerrarPoolsInforme();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
