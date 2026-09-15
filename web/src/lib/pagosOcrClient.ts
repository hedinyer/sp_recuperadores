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
  movimientos: MovimientoExtracto[];
  usados?: string[];
  ventanaMinutos?: number;
  askCobradorSiAmbiguo?: boolean;
  timeoutMs?: number;
}): Promise<PagosOcrValidarResponse> {
  const usados = new Set(opts.usados ?? []);
  const movs = opts.movimientos
    .filter((m) => !usados.has(claveMovimiento(m)))
    .map((m) => ({
      documento: m.documento || null,
      fecha: m.fecha || null,
      hora: m.hora.trim() ? m.hora : null,
      monto_cop: m.monto_cop,
      oficina: m.oficina || null,
      motivo: m.motivo || null,
    }));

  const upstream = await fetch(`${pagosOcrBase()}/v1/validar-pago`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      image_base64: opts.imageBase64,
      movimientos: movs,
      ventana_minutos: opts.ventanaMinutos ?? 20,
      ask_cobrador_si_ambiguo: opts.askCobradorSiAmbiguo ?? false,
    }),
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
