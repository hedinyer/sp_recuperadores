import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(join(__dirname, "motos-sin-tracking.json"), "utf8"),
);

const compact = (m) => ({
  p: m.placa,
  c: m.cliente,
  t: m.telefono,
  f: m.fecha_inicio,
  da: m.dias_sin_airtag,
  ua: m.airtag_ultima,
  dg: m.dias_sin_senal,
  ug: m.gps_ultima_senal,
  pr: m.gps_proveedor,
  ma: m.motivo_airtag,
  mg: m.motivo_gps,
  m: m.motivo,
});

const airtagViejo = raw.motos.filter((m) =>
  String(m.motivo_airtag).startsWith("AirTag sin marcar"),
);
const airtagNoFound = raw.motos.filter(
  (m) => m.motivo_airtag === "AirTag no encontrado",
);
const sinAirTag = raw.motos.filter((m) => m.motivo_airtag === "Sin AirTag");

/** Prioridad: AirTag viejo/no found + GPS con historial muerto; luego sin AirTag con GPS muerto */
const prioridad = [
  ...airtagViejo,
  ...airtagNoFound,
  ...sinAirTag.filter(
    (m) =>
      String(m.motivo_gps).startsWith("GPS sin señal") ||
      String(m.motivo_gps).startsWith("GPS no activo"),
  ),
];

const data = {
  generado: raw.generado_en,
  totales: raw.totales,
  prioridad: prioridad.map(compact),
  airtagViejo: airtagViejo.map(compact),
  sinAirTag: sinAirTag.map(compact),
  todas: raw.motos.map(compact),
};

writeFileSync(
  join(__dirname, "motos-canvas-data.json"),
  JSON.stringify(data, null, 2),
  "utf8",
);
console.log(JSON.stringify(raw.totales, null, 2));
console.log(
  "prioridad",
  prioridad.length,
  "airtagViejo",
  airtagViejo.length,
  "sinAirTag",
  sinAirTag.length,
);
