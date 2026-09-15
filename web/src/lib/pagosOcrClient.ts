/**
 * Cliente del harness de pagos en la DGX (PaddleOCR-VL + match).
 * No usa Hermes/cobrador para OCR.
 */

import type { MovimientoExtracto } from "@/lib/pagosExtracto";
import type { PagosHarnessResult, VeredictoPago } from "@/lib/pagosHarness";
import type { OcrConsenso } from "@/lib/pagosMatch";
import { claveMovimiento } from "@/lib/pagosMatch";

const DEFAULT_BASE = "http://159.65.228.108/pagos-ocr";

export type PagosOcrEstado =
  | "ok"
  | "revision_manual"
  | "ambiguo"
  | "ocr_fallido";

export type PagosOcrResult = {
  monto_cop: number | null;
  fecha: string | null;
  hora: string | null;
  banco: string | null;
  referencia: string | null;
  es_comprobante_pago: boolean;
  confianza: number;
  votos: number;
  total_ocr: number;
  raw_text?: string | null;
};

export type PagosOcrMovimiento = {
  documento?: string | null;
  fecha?: string | null;
  hora?: string | null;
  monto_cop?: number | null;
  oficina?: string | null;
  motivo?: string | null;
};

export type PagosOcrValidarResponse = {
  estado: PagosOcrEstado;
  ocr: PagosOcrResult;
  candidatos: PagosOcrMovimiento[];
  documento?: string | null;
  coincide?: boolean | null;
  razon?: string | null;
  confirma?: boolean | null;
  extracto_id?: string | null;
};

export type SparkExtractoMeta = {
  id: string;
  nombre: string;
  filas: number;
  activo: boolean;
  created_at?: string | null;
  columnas_detectadas?: Record<string, string> | null;
};

export type SparkExtractoDetalle = SparkExtractoMeta & {
  path?: string | null;
  preview: PagosOcrMovimiento[];
  fechas: string[];
  fecha_min: string | null;
  fecha_max: string | null;
};

export type SparkExtractosList = {
  extractos: SparkExtractoMeta[];
  activo_id: string | null;
};

function pagosOcrBase(): string {
  return (
    process.env.PAGOS_OCR_BASE_URL?.trim() || DEFAULT_BASE
  ).replace(/\/$/, "");
}

/** data:image/...;base64,XXX → XXX */
export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf("base64,");
  if (i >= 0) return dataUrl.slice(i + "base64,".length);
  return dataUrl;
}

function toOcrConsenso(ocr: PagosOcrResult): OcrConsenso | null {
  if (
    ocr.monto_cop == null ||
    !ocr.fecha ||
    !ocr.hora ||
    ocr.es_comprobante_pago === false
  ) {
    return null;
  }
  return {
    monto_cop: ocr.monto_cop,
    fecha: ocr.fecha,
    hora: ocr.hora,
    banco: ocr.banco,
    referencia: ocr.referencia,
    votos: ocr.votos ?? 1,
    total_ocr: ocr.total_ocr ?? 1,
  };
}

function movimientoFromOcr(
  m: PagosOcrMovimiento,
  i: number,
): MovimientoExtracto {
  const fecha = String(m.fecha ?? "");
  const hora = String(m.hora ?? "");
  const documento = String(m.documento ?? "");
  return {
    id: `${documento}|${fecha}|${hora || "sin-hora"}|${i}`,
    fecha,
    hora,
    monto_cop: Math.round(Number(m.monto_cop) || 0),
    documento,
    transaccion: "",
    oficina: String(m.oficina ?? ""),
    referencia2: "",
    motivo: String(m.motivo ?? ""),
  };
}

/** Detecta aviso de comprobante reutilizado en el texto de Spark. */
export function parseAlertaReuso(resumen: string): {
  activa: boolean;
  aviso: string | null;
  cuerpo: string;
  veces: number | null;
  primera_vez: string | null;
} {
  const text = resumen.trim();
  if (!text) {
    return {
      activa: false,
      aviso: null,
      cuerpo: "",
      veces: null,
      primera_vez: null,
    };
  }

  const activa =
    /ya se valid[oó]\s+antes/i.test(text) ||
    /posible\s+reuso/i.test(text) ||
    /ya\s+va\s+\d+\s+veces/i.test(text);

  if (!activa) {
    return {
      activa: false,
      aviso: null,
      cuerpo: text,
      veces: null,
      primera_vez: null,
    };
  }

  const vecesMatch = text.match(/ya\s+va\s+(\d+)\s+veces/i);
  const veces = vecesMatch ? Number(vecesMatch[1]) : null;
  const primeraMatch = text.match(/primera\s+vez:\s*([^\s.]+)/i);
  const primera_vez = primeraMatch?.[1] ?? null;

  // Separa el bloque de alerta del resto (match / ambigüedad).
  const split = text.match(
    /^(.*?posible\s+reuso[^.]*\.)\s*(.*)$/i,
  ) ?? text.match(
    /^(.*?ya\s+va\s+\d+\s+veces\.)\s*(.*)$/i,
  ) ?? text.match(
    /^(.*?ya se valid[oó]\s+antes[^.]*\.)\s*(.*)$/i,
  );

  if (split) {
    return {
      activa: true,
      aviso: split[1]!.trim(),
      cuerpo: (split[2] ?? "").trim(),
      veces: Number.isFinite(veces) ? veces : null,
      primera_vez,
    };
  }

  return {
    activa: true,
    aviso: text,
    cuerpo: "",
    veces: Number.isFinite(veces) ? veces : null,
    primera_vez,
  };
}

function mapEstado(res: PagosOcrValidarResponse): {
  veredicto: VeredictoPago;
  resumen: string;
} {
  const { estado, ocr, documento, coincide, confirma, razon } = res;

  if (estado === "ocr_fallido") {
    return {
      veredicto: "revisar",
      resumen:
        razon?.trim() ||
        "No se pudo leer el comprobante. Prueba otra foto más nítida.",
    };
  }
  if (estado === "ambiguo") {
    return {
      veredicto: "revisar",
      resumen:
        razon?.trim() ||
        `Hay varios movimientos similares${documento ? ` (sugerido doc ${documento})` : ""}. Revisa manualmente.`,
    };
  }
  if (estado === "revision_manual") {
    return {
      veredicto: "revisar",
      resumen: razon?.trim() || "Revisa el cruce manualmente.",
    };
  }

  // estado === "ok"
  const entro =
    confirma === true ||
    (confirma == null && coincide === true) ||
    (confirma == null && coincide == null && Boolean(documento));

  if (entro) {
    const monto = ocr.monto_cop?.toLocaleString("es-CO") ?? "?";
    const fecha = ocr.fecha ?? "?";
    const hora = ocr.hora?.slice(0, 5) ?? "—";
    return {
      veredicto: "entro",
      resumen:
        razon?.trim() ||
        `Entró: $${monto} el ${fecha} a las ${hora}${documento ? ` (doc ${documento})` : ""}.`,
    };
  }

  return {
    veredicto: "no_entro",
    resumen:
      razon?.trim() ||
      "No hay coincidencia clara en el extracto con este comprobante.",
  };
}

export function mapPagosOcrToHarness(
  res: PagosOcrValidarResponse,
): PagosHarnessResult {
  const { veredicto, resumen } = mapEstado(res);
  const ocr = toOcrConsenso(res.ocr);
  const candidatos = (res.candidatos ?? []).map(movimientoFromOcr);
  let candidato: MovimientoExtracto | null = null;
  if (res.documento) {
    candidato =
      candidatos.find((c) => c.documento === res.documento) ??
      candidatos[0] ??
      null;
    if (!candidato && ocr) {
      candidato = {
        id: `${res.documento}|${ocr.fecha}|${ocr.hora}`,
        fecha: ocr.fecha,
        hora: ocr.hora,
        monto_cop: ocr.monto_cop,
        documento: res.documento,
        transaccion: "",
        oficina: "",
        referencia2: "",
        motivo: "",
      };
    }
  } else if (candidatos.length === 1) {
    candidato = candidatos[0]!;
  }

  return {
    veredicto,
    resumen,
    ocr,
    candidato,
    candidatos,
    ocr_ok: res.ocr.es_comprobante_pago ? 1 : 0,
    match_ok: res.coincide ? 1 : 0,
    eval_ok: res.confirma != null ? 1 : 0,
    detalle: {
      ocr_votos: ocr
        ? [
            {
              key: `${ocr.monto_cop}|${ocr.fecha}|${ocr.hora.slice(0, 5)}`,
              count: ocr.votos,
            },
          ]
        : [],
      match_votes: res.documento
        ? [{ documento: res.documento, count: 1 }]
        : [],
      eval_si: res.confirma ? 1 : 0,
      latencias_ms: { ocr: 0, match: 0, eval: 0, total: 0 },
    },
  };
}

export async function validarPagoEnSpark(opts: {
  imageBase64: string;
  movimientos?: MovimientoExtracto[];
  extractoId?: string | null;
  usados?: string[];
  ventanaMinutos?: number;
  askCobradorSiAmbiguo?: boolean;
  timeoutMs?: number;
}): Promise<PagosOcrValidarResponse> {
  const usados = new Set(opts.usados ?? []);
  const movs = (opts.movimientos ?? [])
    .filter((m) => !usados.has(claveMovimiento(m)))
    .map((m) => ({
      documento: m.documento || null,
      fecha: m.fecha || null,
      hora: m.hora.trim() ? m.hora : null,
      monto_cop: m.monto_cop,
      oficina: m.oficina || null,
      motivo: m.motivo || null,
    }));

  const body: Record<string, unknown> = {
    image_base64: opts.imageBase64,
    ventana_minutos: opts.ventanaMinutos ?? 20,
    ask_cobrador_si_ambiguo: opts.askCobradorSiAmbiguo ?? false,
  };
  if (opts.extractoId) body.extracto_id = opts.extractoId;
  if (movs.length) body.movimientos = movs;

  const upstream = await fetch(`${pagosOcrBase()}/v1/validar-pago`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });

  const raw = await upstream.text();
  let data: PagosOcrValidarResponse & { detail?: unknown; error?: string };
  try {
    data = raw
      ? (JSON.parse(raw) as typeof data)
      : ({} as typeof data);
  } catch {
    throw new Error(raw.slice(0, 300) || "Respuesta inválida de pagos-ocr");
  }

  if (!upstream.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? JSON.stringify(data.detail).slice(0, 200)
          : data.error || `pagos-ocr HTTP ${upstream.status}`;
    throw new Error(String(detail));
  }

  if (!data.estado || !data.ocr) {
    throw new Error("pagos-ocr no devolvió estado/ocr");
  }
  return data;
}

async function parseSparkJson<T>(upstream: Response): Promise<T> {
  const raw = await upstream.text();
  let data: T & { detail?: unknown; error?: string };
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : ({} as typeof data);
  } catch {
    throw new Error(raw.slice(0, 300) || "Respuesta inválida de pagos-ocr");
  }
  if (!upstream.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? JSON.stringify(data.detail).slice(0, 200)
          : data.error || `pagos-ocr HTTP ${upstream.status}`;
    throw new Error(String(detail));
  }
  return data;
}

function fechasDesdePreview(preview: PagosOcrMovimiento[]): {
  fechas: string[];
  fecha_min: string | null;
  fecha_max: string | null;
} {
  const set = new Set<string>();
  for (const row of preview) {
    const f = String(row.fecha ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) set.add(f);
  }
  const fechas = Array.from(set).sort();
  return {
    fechas,
    fecha_min: fechas[0] ?? null,
    fecha_max: fechas[fechas.length - 1] ?? null,
  };
}

export async function listExtractosSpark(
  timeoutMs = 30_000,
): Promise<SparkExtractosList> {
  const upstream = await fetch(`${pagosOcrBase()}/v1/extractos`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await parseSparkJson<{
    extractos?: SparkExtractoMeta[];
    activo_id?: string | null;
  }>(upstream);
  return {
    extractos: Array.isArray(data.extractos) ? data.extractos : [],
    activo_id: data.activo_id ?? null,
  };
}

export async function getExtractoSpark(
  extractoId: string,
  preview = 20,
  timeoutMs = 60_000,
): Promise<SparkExtractoDetalle> {
  const url = new URL(
    `${pagosOcrBase()}/v1/extractos/${encodeURIComponent(extractoId)}`,
  );
  url.searchParams.set("preview", String(Math.max(0, preview)));
  const upstream = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await parseSparkJson<
    SparkExtractoMeta & {
      preview?: PagosOcrMovimiento[];
      path?: string | null;
    }
  >(upstream);
  const previewRows = Array.isArray(data.preview) ? data.preview : [];
  const { fechas, fecha_min, fecha_max } = fechasDesdePreview(previewRows);
  return {
    id: data.id,
    nombre: data.nombre,
    filas: data.filas,
    activo: Boolean(data.activo),
    created_at: data.created_at ?? null,
    columnas_detectadas: data.columnas_detectadas ?? null,
    path: data.path ?? null,
    preview: previewRows,
    fechas,
    fecha_min,
    fecha_max,
  };
}

/** Lista extractos con rango de fechas (lee filas del Excel en Spark). */
export async function listExtractosConFechas(
  timeoutMs = 90_000,
): Promise<{
  extractos: SparkExtractoDetalle[];
  activo_id: string | null;
}> {
  const list = await listExtractosSpark(timeoutMs);
  const extractos: SparkExtractoDetalle[] = [];
  for (const meta of list.extractos) {
    try {
      const detail = await getExtractoSpark(
        meta.id,
        Math.max(meta.filas || 0, 1),
        timeoutMs,
      );
      extractos.push(detail);
    } catch {
      extractos.push({
        ...meta,
        preview: [],
        fechas: [],
        fecha_min: null,
        fecha_max: null,
      });
    }
  }
  return { extractos, activo_id: list.activo_id };
}

export async function uploadExtractoSpark(opts: {
  bytes: Buffer | Uint8Array;
  filename: string;
  activar?: boolean;
  timeoutMs?: number;
}): Promise<SparkExtractoMeta & { preview?: PagosOcrMovimiento[] }> {
  const fd = new FormData();
  const blob = new Blob([new Uint8Array(opts.bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fd.append("file", blob, opts.filename);
  fd.append("activar", String(opts.activar !== false));

  const upstream = await fetch(`${pagosOcrBase()}/v1/extractos`, {
    method: "POST",
    body: fd,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  return parseSparkJson(upstream);
}

export async function ocrComprobanteSpark(opts: {
  imageBase64: string;
  timeoutMs?: number;
}): Promise<PagosOcrResult> {
  const upstream = await fetch(`${pagosOcrBase()}/v1/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ image_base64: opts.imageBase64 }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });
  return parseSparkJson<PagosOcrResult>(upstream);
}

/** Busca un extracto en Spark que tenga movimientos en la fecha del comprobante. */
export async function findExtractoParaFecha(
  fecha: string,
  timeoutMs = 90_000,
): Promise<SparkExtractoDetalle | null> {
  const ymd = fecha.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const { extractos, activo_id } = await listExtractosConFechas(timeoutMs);
  const covering = extractos.filter((e) => e.fechas.includes(ymd));
  if (!covering.length) return null;
  const activo = covering.find((e) => e.id === activo_id || e.activo);
  return activo ?? covering[0]!;
}

export function formatearFechaEs(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Pensamientos sintéticos para la UI (la Spark responde de una). */
export function thoughtsFromPagosOcr(
  res: PagosOcrValidarResponse,
): string[] {
  const out: string[] = [];
  out.push("Procesando en la Spark (PaddleOCR-VL)…");
  const { ocr, estado, documento, coincide, confirma, razon, candidatos } =
    res;
  if (ocr.es_comprobante_pago && ocr.monto_cop != null && ocr.fecha && ocr.hora) {
    out.push(
      `OCR: $${ocr.monto_cop.toLocaleString("es-CO")} el ${ocr.fecha} a las ${ocr.hora.slice(0, 5)}${ocr.banco ? ` · ${ocr.banco}` : ""} (confianza ${Math.round((ocr.confianza ?? 0) * 100)}%).`,
    );
  } else {
    out.push("OCR: no se pudo leer monto/fecha/hora del comprobante.");
  }
  out.push(
    candidatos?.length
      ? `${candidatos.length} candidato(s) en el extracto.`
      : "Sin candidatos en el extracto.",
  );
  if (documento) {
    out.push(
      `Match: doc ${documento}${coincide === false ? " (no coincide)" : ""}${confirma === true ? " · confirmado" : confirma === false ? " · rechazado" : ""}.`,
    );
  }
  if (razon?.trim()) out.push(razon.trim());
  out.push(`Estado Spark: ${estado}.`);
  return out;
}
