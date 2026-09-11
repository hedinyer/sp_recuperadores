/**
 * Motos candidatas a "sin tracking" / posibles robadas:
 * - Sin AirTag asociado
 * - Y (sin GPS activo OR última señal GPS > 3 días)
 */
import pg from "pg";
import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "motos-sin-tracking.json");

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;
const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://postgres:nzodrSFiCoFVhmcChrywBGsHVciVEgio@viaduct.proxy.rlwy.net:50499/railway";

const LOCATIONS_URL =
  "https://rpjkwoxqnvwcnlnffudt.supabase.co/storage/v1/object/public/airtags/locations.json";

const DSTRACK_BASE = "https://dstrack.uno";
const DSTRACK_AUTH = Buffer.from(
  "solucionespinilla:SPinilla91222",
).toString("base64");

const CUENTAS_IOP = [
  {
    appid: "solucionespinilla",
    secretKey: "qr5i85fszplr0m149mskasoyx6fqhwei",
  },
  { appid: "berala37", secretKey: "q16guj78wwkxqjh2r7o833qj920rgve0" },
  {
    appid: "all4motosbera",
    secretKey: "tc1z9k9volktkclrz1c6tsh0m2emni7w",
  },
];

function normalizarPlaca(p) {
  return String(p ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function variantesPlaca(placa) {
  const norm = normalizarPlaca(placa);
  if (!norm) return [];
  const variantes = new Set([norm]);
  if (/^[A-Z]{3}\d{2}H$/.test(norm)) variantes.add(norm.slice(0, -1));
  else if (/^[A-Z]{3}\d{2}$/.test(norm)) variantes.add(`${norm}H`);
  if (/^[A-Z]{3}\d{2}[A-Z0-9]$/.test(norm)) variantes.add(norm.slice(0, 5));
  return [...variantes];
}

const PATRONES = [
  /[A-Z]{3}-?\d{2}H?\b/gi,
  /[A-Z]{3}\d{3}\b/gi,
  /[A-Z]{3}\d{2}[A-Z0-9]\b/gi,
];

function extraerPlacasDeTexto(texto) {
  const raw = String(texto ?? "").toUpperCase();
  const out = new Set();
  for (const re of PATRONES) {
    for (const m of raw.matchAll(re)) {
      for (const v of variantesPlaca(m[0])) out.add(v);
    }
  }
  return [...out];
}

async function fetchContratos() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        ct.id AS contrato_id,
        cl.nombre,
        cl.telefono,
        v.placa,
        ct.fecha_inicio::date AS fecha_inicio,
        ct.tarifa::numeric AS valor_cuota
      FROM arrendamientos_contrato ct
      JOIN clientes_cliente cl ON cl.id = ct.cliente_id
      JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
      WHERE ct.estado = 'Activo'
        AND ct.fecha_inicio IS NOT NULL
        AND ct.tarifa > 0
        AND v.placa IS NOT NULL
        AND TRIM(v.placa) <> ''
      ORDER BY v.placa
    `);
    return rows.map((r) => ({
      contrato_id: String(r.contrato_id),
      nombre: String(r.nombre ?? ""),
      telefono: String(r.telefono ?? ""),
      placa: normalizarPlaca(r.placa),
      fecha_inicio: r.fecha_inicio
        ? new Date(r.fecha_inicio).toISOString().slice(0, 10)
        : "",
      valor_cuota: Number(r.valor_cuota) || 0,
    }));
  } finally {
    await client.end();
  }
}

async function fetchAirTags() {
  const res = await fetch(LOCATIONS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`locations.json ${res.status}`);
  const data = await res.json();
  /** @type {Map<string, { found: boolean, lastMs: number|null, visto_en: string|null }>} */
  const map = new Map();
  for (const d of data.devices ?? []) {
    const placa = normalizarPlaca(d.name);
    if (!placa) continue;
    const visto =
      typeof d.timestamp === "string" && d.timestamp.trim()
        ? d.timestamp.trim()
        : null;
    const lastMs = visto ? new Date(visto).getTime() : null;
    const prev = map.get(placa);
    if (prev?.lastMs != null && lastMs != null && lastMs < prev.lastMs) {
      continue;
    }
    map.set(placa, {
      found: Boolean(d.found),
      lastMs: Number.isFinite(lastMs) ? lastMs : null,
      visto_en: visto,
    });
  }
  return map;
}

async function fetchDsTrack() {
  /** @type {Map<string, { online: string, lastMs: number|null, proveedor: string }>} */
  const map = new Map();
  const headers = {
    Authorization: `Basic ${DSTRACK_AUTH}`,
    Accept: "application/json",
  };
  const [devices, positions] = await Promise.all([
    fetch(`${DSTRACK_BASE}/api/devices`, { headers }).then((r) => r.json()),
    fetch(`${DSTRACK_BASE}/api/positions`, { headers }).then((r) => r.json()),
  ]);
  const posById = new Map();
  for (const p of positions ?? []) {
    if (p.deviceId) posById.set(Number(p.deviceId), p);
  }
  for (const d of devices ?? []) {
    if (d.disabled) continue;
    const pos = posById.get(Number(d.id));
    const iso = pos?.deviceTime || pos?.fixTime || d.lastUpdate || null;
    const lastMs = iso ? new Date(iso).getTime() : null;
    let online = String(d.status ?? "offline").toLowerCase();
    if (
      (online === "online" || online === "ack") &&
      lastMs &&
      Date.now() - lastMs > 86_400_000
    ) {
      online = "offline";
    }
    const textos = [String(d.name ?? ""), String(d.attributes?.plate ?? "")];
    for (const t of textos) {
      for (const placa of extraerPlacasDeTexto(t)) {
        const prev = map.get(placa);
        const entry = { online, lastMs, proveedor: "ds track" };
        if (!prev || (lastMs ?? 0) >= (prev.lastMs ?? 0)) map.set(placa, entry);
      }
    }
  }
  return map;
}

function md5(texto) {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

async function iopToken(cuenta) {
  const time = Math.floor(Date.now() / 1000);
  // Firma IOP: md5( md5(secretKey) + time )
  const signature = md5(`${md5(cuenta.secretKey)}${time}`);
  const res = await fetch("https://open.iopgps.com/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appid: cuenta.appid,
      time,
      signature,
    }),
  });
  const data = await res.json();
  if (data.code !== 0 || !data.accessToken) {
    throw new Error(
      `IOP auth falló (${cuenta.appid}): ${data.result ?? res.status}`,
    );
  }
  return data.accessToken;
}

async function fetchIop() {
  /** @type {Map<string, { online: string, lastMs: number|null, proveedor: string }>} */
  const map = new Map();

  for (const cuenta of CUENTAS_IOP) {
    try {
      const token = await iopToken(cuenta);
      const headers = {
        accessToken: token,
        Accept: "application/json",
      };
      // list devices (paginated) — mismo endpoint que la app
      let page = 1;
      const nombres = new Map();
      let total = Infinity;
      while (nombres.size < total && page <= 20) {
        const listRes = await fetch(
          `https://open.iopgps.com/api/device?pageSize=100&currentPage=${page}`,
          { headers },
        );
        const listData = await listRes.json();
        if (listData.code !== 0) break;
        const rows = listData.data ?? [];
        for (const d of rows) {
          const imei = String(d.imei ?? "").trim();
          if (imei) nombres.set(imei, String(d.deviceName ?? "").trim());
        }
        total = Number(listData.page?.count ?? nombres.size);
        if (rows.length === 0) break;
        page += 1;
      }

      const statusRes = await fetch(
        `https://open.iopgps.com/api/device/status?account=${encodeURIComponent(cuenta.appid)}`,
        { headers },
      );
      const statusData = await statusRes.json();
      for (const st of statusData.data ?? []) {
        const imei = String(st.imei ?? "").trim();
        const nombre = nombres.get(imei) || String(st.deviceName ?? "") || imei;
        const epoch = Number(st.gpsTime || st.signalTime || 0);
        const lastMs =
          Number.isFinite(epoch) && epoch > 0
            ? epoch < 1e12
              ? epoch * 1000
              : epoch
            : null;
        // Misma lógica que iopGps.ts mapearEstadoOnline
        const stRaw = String(st.status ?? "");
        let online = "ack";
        if (
          stRaw.includes("离线") ||
          stRaw.toLowerCase().includes("offline")
        ) {
          online = "offline";
        } else if (lastMs && Date.now() - lastMs > 86_400_000) {
          online = "offline";
        } else if (stRaw.includes("运动") || stRaw.includes("行驶")) {
          online = "online";
        }
        for (const placa of extraerPlacasDeTexto(nombre)) {
          const prev = map.get(placa);
          const entry = { online, lastMs, proveedor: "iop gps" };
          if (!prev || (lastMs ?? 0) >= (prev.lastMs ?? 0)) {
            map.set(placa, entry);
          }
        }
      }
    } catch (e) {
      console.warn(`[iop] ${cuenta.appid}:`, e.message);
    }
  }
  return map;
}

function lookupMap(map, placa) {
  for (const v of variantesPlaca(placa)) {
    if (map.has(v)) return map.get(v);
  }
  return null;
}

function diasDesde(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function formatearFecha(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
  });
}

async function main() {
  console.error("Cargando contratos, AirTags y GPS…");
  const [contratos, airTags, ds, iop] = await Promise.all([
    fetchContratos(),
    fetchAirTags(),
    fetchDsTrack(),
    fetchIop(),
  ]);

  const ahora = Date.now();
  const candidatos = [];

  for (const c of contratos) {
    const at = lookupMap(airTags, c.placa);
    const diasAirTag = at?.lastMs != null ? diasDesde(at.lastMs) : null;
    const airTagViejo =
      at != null &&
      (at.lastMs == null ||
        !at.found ||
        ahora - at.lastMs > TRES_DIAS_MS);
    const sinAirTag = !at;
    // Tracking AirTag “muerto”: no existe, no found, o >3 días sin marcar
    const airTagMuerto = sinAirTag || airTagViejo;
    if (!airTagMuerto) continue;

    const gpsDs = lookupMap(ds, c.placa);
    const gpsIop = lookupMap(iop, c.placa);
    let gps = null;
    if (gpsDs && gpsIop) {
      gps =
        (gpsDs.lastMs ?? 0) >= (gpsIop.lastMs ?? 0) ? gpsDs : gpsIop;
    } else {
      gps = gpsDs || gpsIop;
    }

    const funcional =
      gps != null &&
      (gps.online === "online" || gps.online === "ack") &&
      (gps.lastMs == null || ahora - gps.lastMs <= 86_400_000);

    const diasSinSenal = gps?.lastMs != null ? diasDesde(gps.lastMs) : null;
    const senalVieja =
      gps?.lastMs != null && ahora - gps.lastMs > TRES_DIAS_MS;
    const sinGps = !gps;
    const sinGpsActivo = !funcional;

    // También GPS muerto: sin activo O >3 días sin marcar
    if (!(sinGpsActivo || senalVieja || sinGps)) continue;

    let motivoGps;
    if (sinGps) motivoGps = "Sin dispositivo GPS";
    else if (senalVieja)
      motivoGps = `GPS sin señal >3 días (${diasSinSenal ?? "?"} d)`;
    else motivoGps = `GPS no activo (${gps.online})`;

    let motivoAirTag;
    if (sinAirTag) motivoAirTag = "Sin AirTag";
    else if (!at.found) motivoAirTag = "AirTag no encontrado";
    else if (at.lastMs == null) motivoAirTag = "AirTag sin timestamp";
    else
      motivoAirTag = `AirTag sin marcar >3 días (${diasAirTag ?? "?"} d)`;

    candidatos.push({
      placa: c.placa,
      cliente: c.nombre,
      telefono: c.telefono,
      fecha_inicio: c.fecha_inicio,
      valor_cuota: c.valor_cuota,
      motivo: `${motivoAirTag} · ${motivoGps}`,
      motivo_airtag: motivoAirTag,
      motivo_gps: motivoGps,
      airtag_ultima: formatearFecha(at?.lastMs ?? null),
      dias_sin_airtag: diasAirTag,
      gps_proveedor: gps?.proveedor ?? null,
      gps_online: gps?.online ?? null,
      gps_ultima_senal: formatearFecha(gps?.lastMs ?? null),
      dias_sin_senal: diasSinSenal,
    });
  }

  candidatos.sort((a, b) => {
    const score = (x) =>
      Math.max(x.dias_sin_senal ?? 0, x.dias_sin_airtag ?? 0) ||
      (String(x.motivo_gps).includes("Sin dispositivo") ? 9998 : 0);
    const da = score(a);
    const db = score(b);
    if (da !== db) return db - da;
    return a.placa.localeCompare(b.placa);
  });

  const resumen = {
    generado_en: new Date().toISOString(),
    criterio:
      "Contratos activos con AirTag muerto (sin AirTag o >3 días sin marcar) Y GPS muerto (no activo o >3 días sin marcar)",
    totales: {
      contratos_activos: contratos.length,
      con_airtag: [...new Set(contratos.map((c) => c.placa))].filter((p) =>
        lookupMap(airTags, p),
      ).length,
      candidatas: candidatos.length,
      sin_airtag: candidatos.filter((c) => c.motivo_airtag === "Sin AirTag")
        .length,
      airtag_viejo_3d: candidatos.filter((c) =>
        String(c.motivo_airtag).startsWith("AirTag sin marcar"),
      ).length,
      airtag_no_encontrado: candidatos.filter(
        (c) => c.motivo_airtag === "AirTag no encontrado",
      ).length,
      sin_dispositivo_gps: candidatos.filter((c) =>
        String(c.motivo_gps).includes("Sin dispositivo"),
      ).length,
      gps_viejo_3d: candidatos.filter((c) =>
        String(c.motivo_gps).startsWith("GPS sin señal"),
      ).length,
      gps_no_activo: candidatos.filter((c) =>
        String(c.motivo_gps).startsWith("GPS no activo"),
      ).length,
    },
    motos: candidatos,
  };

  writeFileSync(OUT_PATH, JSON.stringify(resumen, null, 2), "utf8");
  console.error(
    `OK: ${candidatos.length} candidatas → ${OUT_PATH}`,
  );
  console.error(JSON.stringify(resumen.totales));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
