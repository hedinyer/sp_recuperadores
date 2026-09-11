/**
 * Genera Excel (.xls SpreadsheetML) — Sin GPS ni AirTag.
 * Sin dependencias externas; Excel / LibreOffice lo abren bien.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(join(__dirname, "motos-sin-tracking.json"), "utf8"),
);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value, type = "String", style = "celda") {
  if (value == null || value === "") {
    return `<Cell ss:StyleID="${style}"><Data ss:Type="String"></Data></Cell>`;
  }
  if (type === "Number") {
    return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${esc(value)}</Data></Cell>`;
}

/** Prioridad visual: primero sin ambos dispositivos, luego AirTag viejo, etc. */
function prioridad(m) {
  const sinAt = m.motivo_airtag === "Sin AirTag" ? 0 : 1;
  const sinGps = String(m.motivo_gps).includes("Sin dispositivo") ? 0 : 1;
  const dias = Math.max(m.dias_sin_senal ?? 0, m.dias_sin_airtag ?? 0);
  return [sinAt + sinGps, -dias, m.placa];
}

const motos = [...raw.motos].sort((a, b) => {
  const pa = prioridad(a);
  const pb = prioridad(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
});

const generado = new Date(raw.generado_en).toLocaleString("es-CO", {
  timeZone: "America/Bogota",
});

const headers = [
  "#",
  "Placa",
  "Cliente",
  "Teléfono",
  "Fecha contrato",
  "Cuota",
  "Estado AirTag",
  "Días sin AirTag",
  "Última AirTag",
  "Estado GPS",
  "Días sin GPS",
  "Última GPS",
  "Proveedor GPS",
];

const filasXml = motos
  .map((m, i) => {
    const cells = [
      cell(i + 1, "Number", "num"),
      cell(m.placa, "String", "placa"),
      cell(m.cliente),
      cell(m.telefono),
      cell(m.fecha_inicio),
      cell(m.valor_cuota, "Number", "num"),
      cell(m.motivo_airtag),
      cell(m.dias_sin_airtag, "Number", "num"),
      cell(m.airtag_ultima ?? "—"),
      cell(m.motivo_gps),
      cell(m.dias_sin_senal, "Number", "num"),
      cell(m.gps_ultima_senal ?? "—"),
      cell(m.gps_proveedor ?? "—"),
    ].join("");
    return `<Row ss:AutoFitHeight="0" ss:Height="18">${cells}</Row>`;
  })
  .join("\n");

const resumenRows = [
  ["Informe", "Sin GPS ni AirTag"],
  ["Generado", generado],
  [
    "Criterio",
    "AirTag muerto (sin / no found / >3 días) Y GPS muerto (sin / no activo / >3 días)",
  ],
  ["Contratos activos", String(raw.totales.contratos_activos)],
  ["Motos en la lista", String(raw.totales.candidatas)],
  ["Sin AirTag", String(raw.totales.sin_airtag)],
  ["AirTag >3 días sin marcar", String(raw.totales.airtag_viejo_3d)],
  ["AirTag no encontrado", String(raw.totales.airtag_no_encontrado)],
  ["Sin dispositivo GPS", String(raw.totales.sin_dispositivo_gps)],
  ["GPS >3 días sin señal", String(raw.totales.gps_viejo_3d)],
  ["GPS no activo", String(raw.totales.gps_no_activo)],
]
  .map(
    ([k, v]) =>
      `<Row>${cell(k, "String", "bold")}${cell(v)}</Row>`,
  )
  .join("\n");

const headerRow = `<Row ss:Height="22">${headers
  .map((h) => cell(h, "String", "header"))
  .join("")}</Row>`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1F4E79" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="titulo">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#1F4E79"/>
  </Style>
  <Style ss:ID="bold">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
  <Style ss:ID="placa">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
  <Style ss:ID="celda">
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="num">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
 </Styles>

 <Worksheet ss:Name="Resumen">
  <Table ss:DefaultColumnWidth="80">
   <Column ss:Width="200"/>
   <Column ss:Width="520"/>
   <Row ss:Height="28"><Cell ss:StyleID="titulo"><Data ss:Type="String">Sin GPS ni AirTag — posibles robadas</Data></Cell></Row>
   <Row/>
   ${resumenRows}
   <Row/>
   <Row><Cell ss:StyleID="celda"><Data ss:Type="String">Orden de la hoja "Lista": 1) sin AirTag y sin GPS, 2) resto por más días sin señal, 3) placa.</Data></Cell></Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <FreezePanes/><FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>

 <Worksheet ss:Name="Lista">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="36"/>
   <Column ss:Width="72"/>
   <Column ss:Width="220"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="70"/>
   <Column ss:Width="160"/>
   <Column ss:Width="90"/>
   <Column ss:Width="140"/>
   <Column ss:Width="180"/>
   <Column ss:Width="80"/>
   <Column ss:Width="140"/>
   <Column ss:Width="90"/>
   ${headerRow}
   ${filasXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <LeftColumnRightPane>2</LeftColumnRightPane>
   <SplitVertical>2</SplitVertical>
  </WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${motos.length + 1}C13" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>
`;

const outDir = join(
  "C:/Users/hedin/Documents/sp_recuperadores/web",
  "exports",
);
const outName = `sin-gps-ni-airtag_${new Date().toISOString().slice(0, 10)}.xls`;
const outPath = join(outDir, outName);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, xml, "utf8");

// Copia también al Escritorio del usuario para encontrarla fácil
const desktop = join(
  process.env.USERPROFILE || "C:/Users/hedin",
  "Desktop",
  outName,
);
try {
  writeFileSync(desktop, xml, "utf8");
  console.log("Desktop:", desktop);
} catch {
  console.warn("No se pudo copiar al Escritorio");
}

console.log("OK:", outPath);
console.log("filas:", motos.length);
