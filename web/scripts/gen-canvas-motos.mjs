import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(join(__dirname, "motos-sin-tracking.json"), "utf8"),
);

/** Una sola lista: AirTag muerto + GPS muerto (mismo criterio del script). */
const lista = raw.motos.map((m) => ({
  p: m.placa,
  c: m.cliente,
  t: m.telefono,
  f: m.fecha_inicio,
  da: m.dias_sin_airtag,
  dg: m.dias_sin_senal,
  ma: m.motivo_airtag,
  mg: m.motivo_gps,
  pr: m.gps_proveedor,
}));

const data = {
  generado: raw.generado_en,
  totales: raw.totales,
  lista,
};

writeFileSync(
  join(__dirname, "motos-canvas-data.json"),
  JSON.stringify(data, null, 2),
  "utf8",
);

const out = join(
  "C:/Users/hedin/.cursor/projects/c-Users-hedin-Documents-airtags-Demo/canvases",
  "motos-sin-tracking.canvas.tsx",
);

const canvas = `import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

const DATA = ${JSON.stringify(data)} as const;

export default function MotosSinTracking() {
  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1200 }}>
      <Stack gap={6}>
        <H1>Sin GPS ni AirTag</H1>
        <Text tone="secondary">
          Una sola lista: contratos activos donde AirTag y GPS estan muertos
          (sin dispositivo, no activo, o mas de 3 dias sin marcar). Generado{" "}
          {new Date(DATA.generado).toLocaleString("es-CO", {
            timeZone: "America/Bogota",
          })}
          .
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat
          value={String(DATA.totales.candidatas)}
          label="En la lista"
          tone="danger"
        />
        <Stat
          value={String(DATA.totales.sin_airtag)}
          label="Sin AirTag"
        />
        <Stat
          value={String(
            DATA.totales.airtag_viejo_3d + DATA.totales.airtag_no_encontrado,
          )}
          label="AirTag muerto (>3d / no found)"
          tone="warning"
        />
        <Stat
          value={String(DATA.totales.contratos_activos)}
          label="Contratos activos"
        />
      </Grid>

      <Callout tone="info" title="Criterio">
        Sale si falla el AirTag (no tiene, no found, o &gt;3 dias sin marcar) y
        tambien falla el GPS (sin dispositivo, no activo, o &gt;3 dias sin senal).
      </Callout>

      <Stack gap={8}>
        <H2>Lista unificada — sin GPS ni AirTag</H2>
        <Text tone="secondary">{DATA.lista.length} motos</Text>
        <Table
          stickyHeader
          striped
          headers={[
            "Placa",
            "Cliente",
            "Telefono",
            "AirTag",
            "GPS",
            "Dias AirTag",
            "Dias GPS",
          ]}
          columnAlign={[
            "left",
            "left",
            "left",
            "left",
            "left",
            "right",
            "right",
          ]}
          rowTone={DATA.lista.map((r) =>
            r.ma === "Sin AirTag" && String(r.mg).includes("Sin dispositivo")
              ? "danger"
              : "warning",
          )}
          rows={DATA.lista.map((r) => [
            r.p,
            r.c,
            r.t || "—",
            r.ma,
            r.mg,
            r.da != null ? String(r.da) : "—",
            r.dg != null ? String(r.dg) : "—",
          ])}
        />
      </Stack>

      <Divider />
      <Text tone="secondary">
        Fuentes: ERP + locations.json (demoairtag) + IOP GPS + DS Track.
      </Text>
    </Stack>
  );
}
`;

writeFileSync(out, canvas, "utf8");
console.log("lista", lista.length, "→", out);
