/**
 * Harness pagos: 10 OCR (Qwen vía Hermes) → consenso → 5 validadores Excel → 3 evals.
 * Concurrencia limitada a 5 (DGX).
 */

import {
  hermesChatCompletion,
  parseJsonLoose,
  type HermesContentPart,
} from "@/lib/hermesClient";
import {
  parseFechaYmd,
  parseHora,
  parseMontoCop,
  type MovimientoExtracto,
} from "@/lib/pagosExtracto";
import {
  filtrarCandidatos,
  type OcrConsenso,
} from "@/lib/pagosMatch";

const OCR_N = 10;
const MATCH_N = 5;
const EVAL_N = 3;
const CONCURRENCY = 5;

export type VeredictoPago = "entro" | "no_entro" | "revisar";

export type PagosHarnessResult = {
  veredicto: VeredictoPago;
  resumen: string;
  ocr: OcrConsenso | null;
  candidato: MovimientoExtracto | null;
  candidatos: MovimientoExtracto[];
  ocr_ok: number;
  match_ok: number;
  eval_ok: number;
  detalle: {
    ocr_votos: Array<{ key: string; count: number }>;
    match_votes: Array<{ documento: string | null; count: number }>;
    eval_si: number;
  };
};

type OcrRaw = {
  monto_cop?: number | string | null;
  fecha?: string | null;
  hora?: string | null;
  banco?: string | null;
  referencia?: string | null;
  es_comprobante_pago?: boolean;
  confianza?: number;
};

type MatchRaw = {
  documento?: string | null;
  coincide?: boolean;
  razon?: string;
};

type EvalRaw = {
  confirma?: boolean;
  razon?: string;
};

const SYSTEM_OCR = `Eres un lector OCR de comprobantes de pago colombianos (cualquier banco o voucher: Nequi, Bre-B, Bancolombia, Daviplata, PSE, corresponsal, transferencia, etc.).
Usa la capacidad de visión/OCR del modelo Qwen cargado en Hermes. Lee el texto visible en la imagen; no inventes.
Responde SOLO JSON:
{
  "monto_cop": number,          // pesos enteros COP (sin centavos)
  "fecha": "YYYY-MM-DD",        // fecha del pago en el comprobante
  "hora": "HH:MM:SS",           // hora del pago; si solo HH:MM usa :00
  "banco": string|null,
  "referencia": string|null,
  "es_comprobante_pago": true|false,
  "confianza": number           // 0..1
}
Reglas:
- Monto: quita puntos de miles y símbolo $; 40.000 → 40000.
- Fecha: convierte dd/mm/yyyy a YYYY-MM-DD (Colombia).
- Si la imagen no es un comprobante de pago → es_comprobante_pago false y campos null.
Solo JSON.`;

const SYSTEM_MATCH = `Eres validador de cruce extracto bancario ↔ comprobante.
Te dan el OCR consensuado del comprobante y una lista corta de candidatos del extracto (ya filtrados por monto/fecha/hora).
Responde SOLO JSON:
{
  "documento": string|null,   // documento del candidato elegido, o null
  "coincide": true|false,
  "razon": string
}
Elige el candidato cuya hora esté más cerca del OCR. Si ninguno encaja bien → coincide false y documento null.
Solo JSON.`;

const SYSTEM_EVAL = `Eres juez de calidad del cruce pago/comprobante.
Confirma solo si monto, fecha y hora (±20 min) del OCR cuadran con el movimiento del extracto.
Responde SOLO JSON:
{
  "confirma": true|false,
  "razon": string
}
Solo JSON.`;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

type OcrNorm = {
  monto_cop: number;
  fecha: string;
  hora: string;
  banco: string | null;
  referencia: string | null;
  es_comprobante_pago: true;
};

function normalizeOcr(raw: OcrRaw): OcrNorm | null {
  if (raw.es_comprobante_pago === false) return null;
  const monto_cop = parseMontoCop(raw.monto_cop);
  const fecha = parseFechaYmd(raw.fecha);
  const hora = parseHora(raw.hora);
  if (monto_cop == null || !fecha || !hora) return null;
  return {
    monto_cop,
    fecha,
    hora,
    banco: raw.banco != null ? String(raw.banco) : null,
    referencia: raw.referencia != null ? String(raw.referencia) : null,
    es_comprobante_pago: true,
  };
}

function votoKey(monto: number, fecha: string, hora: string): string {
  const hm = hora.slice(0, 5); // minuto
  return `${monto}|${fecha}|${hm}`;
}

function consensoOcr(
  samples: OcrNorm[],
  total: number,
): OcrConsenso | null {
  if (!samples.length) return null;
  const counts = new Map<string, { count: number; sample: OcrNorm }>();
  for (const s of samples) {
    const k = votoKey(s.monto_cop, s.fecha, s.hora);
    const prev = counts.get(k);
    if (prev) prev.count += 1;
    else counts.set(k, { count: 1, sample: s });
  }
  let best: { count: number; sample: OcrNorm } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }
  if (!best) return null;
  return {
    monto_cop: best.sample.monto_cop,
    fecha: best.sample.fecha,
    hora: best.sample.hora,
    banco: best.sample.banco,
    referencia: best.sample.referencia,
    votos: best.count,
    total_ocr: total,
  };
}

async function pasadaOcr(imageDataUrl: string): Promise<OcrRaw | null> {
  try {
    const parts: HermesContentPart[] = [
      {
        type: "text",
        text: "Lee el comprobante de pago en la imagen con OCR Qwen. Responde solo JSON.",
      },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ];
    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_OCR },
        { role: "user", content: parts },
      ],
      temperature: 0.1,
      timeoutMs: 90_000,
    });
    return parseJsonLoose<OcrRaw>(raw);
  } catch {
    return null;
  }
}

async function pasadaMatch(
  ocr: OcrConsenso,
  candidatos: MovimientoExtracto[],
): Promise<MatchRaw | null> {
  try {
    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_MATCH },
        {
          role: "user",
          content: JSON.stringify({
            ocr: {
              monto_cop: ocr.monto_cop,
              fecha: ocr.fecha,
              hora: ocr.hora,
              banco: ocr.banco,
              referencia: ocr.referencia,
              votos: ocr.votos,
              total_ocr: ocr.total_ocr,
            },
            candidatos: candidatos.map((c) => ({
              documento: c.documento,
              fecha: c.fecha,
              hora: c.hora,
              monto_cop: c.monto_cop,
              oficina: c.oficina,
              motivo: c.motivo,
            })),
          }),
        },
      ],
      temperature: 0.1,
      timeoutMs: 60_000,
    });
    return parseJsonLoose<MatchRaw>(raw);
  } catch {
    return null;
  }
}

async function pasadaEval(
  ocr: OcrConsenso,
  candidato: MovimientoExtracto,
  imageDataUrl: string | null,
): Promise<EvalRaw | null> {
  try {
    const payload = {
      ocr: {
        monto_cop: ocr.monto_cop,
        fecha: ocr.fecha,
        hora: ocr.hora,
      },
      movimiento: {
        documento: candidato.documento,
        fecha: candidato.fecha,
        hora: candidato.hora,
        monto_cop: candidato.monto_cop,
      },
      regla: "mismo monto, misma fecha, hora ±20 minutos",
    };
    const userContent: string | HermesContentPart[] = imageDataUrl
      ? [
          {
            type: "text",
            text: `Confirma el cruce. Datos:\n${JSON.stringify(payload)}\nRevisa también la imagen si hace falta.`,
          },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ]
      : JSON.stringify(payload);

    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_EVAL },
        { role: "user", content: userContent },
      ],
      temperature: 0.05,
      timeoutMs: 90_000,
    });
    return parseJsonLoose<EvalRaw>(raw);
  } catch {
    return null;
  }
}

export async function comprobarPagoHarness(opts: {
  imageDataUrl: string;
  movimientos: MovimientoExtracto[];
  usados?: string[];
}): Promise<PagosHarnessResult> {
  const usados = new Set(opts.usados ?? []);

  const ocrSlots = Array.from({ length: OCR_N }, (_, i) => i);
  const ocrRaws = await mapPool(ocrSlots, CONCURRENCY, () =>
    pasadaOcr(opts.imageDataUrl),
  );
  const ocrNorm = ocrRaws
    .map((r) => (r ? normalizeOcr(r) : null))
    .filter((x): x is OcrNorm => x != null);
  const ocr_ok = ocrNorm.length;

  const voteMap = new Map<string, number>();
  for (const s of ocrNorm) {
    const k = votoKey(s.monto_cop, s.fecha, s.hora);
    voteMap.set(k, (voteMap.get(k) ?? 0) + 1);
  }
  const ocr_votos = [...voteMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const ocr = consensoOcr(ocrNorm, OCR_N);
  if (!ocr || ocr.votos < 3) {
    return {
      veredicto: "revisar",
      resumen:
        ocr_ok === 0
          ? "No se pudo leer el comprobante. Prueba otra foto más nítida."
          : "OCR poco claro: no hay consenso de monto, fecha y hora.",
      ocr,
      candidato: null,
      candidatos: [],
      ocr_ok,
      match_ok: 0,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes: [], eval_si: 0 },
    };
  }

  const candidatos = filtrarCandidatos(opts.movimientos, ocr, usados);
  if (!candidatos.length) {
    return {
      veredicto: "no_entro",
      resumen: `No hay movimiento de $${ocr.monto_cop.toLocaleString("es-CO")} el ${ocr.fecha} cerca de ${ocr.hora.slice(0, 5)}.`,
      ocr,
      candidato: null,
      candidatos: [],
      ocr_ok,
      match_ok: 0,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes: [], eval_si: 0 },
    };
  }

  const matchSlots = Array.from({ length: MATCH_N }, (_, i) => i);
  const matchRaws = await mapPool(matchSlots, CONCURRENCY, () =>
    pasadaMatch(ocr, candidatos.slice(0, 8)),
  );
  const matchCounts = new Map<string | null, number>();
  let match_ok = 0;
  for (const r of matchRaws) {
    if (!r) continue;
    match_ok += 1;
    const doc =
      r.coincide === false
        ? null
        : r.documento != null
          ? String(r.documento).trim() || null
          : null;
    matchCounts.set(doc, (matchCounts.get(doc) ?? 0) + 1);
  }
  const match_votes = [...matchCounts.entries()]
    .map(([documento, count]) => ({ documento, count }))
    .sort((a, b) => b.count - a.count);

  let elegido: MovimientoExtracto | null = null;
  const topDoc = match_votes[0]?.documento;
  if (topDoc) {
    elegido =
      candidatos.find((c) => c.documento === topDoc) ??
      candidatos.find((c) => c.id.includes(topDoc)) ??
      null;
  }
  if (!elegido && candidatos.length === 1) {
    elegido = candidatos[0]!;
  }
  // Empate o varios sin acuerdo claro → Revisar si no hay ganador claro
  const topCount = match_votes[0]?.count ?? 0;
  const secondCount = match_votes[1]?.count ?? 0;
  if (
    !elegido ||
    (candidatos.length > 1 && topCount <= secondCount) ||
    (match_votes[0]?.documento == null && candidatos.length > 1)
  ) {
    if (candidatos.length > 1 && (!elegido || topCount <= secondCount)) {
      return {
        veredicto: "revisar",
        resumen: `Hay ${candidatos.length} movimientos similares. Revisa manualmente.`,
        ocr,
        candidato: null,
        candidatos,
        ocr_ok,
        match_ok,
        eval_ok: 0,
        detalle: { ocr_votos, match_votes, eval_si: 0 },
      };
    }
  }
  if (!elegido) {
    return {
      veredicto: "no_entro",
      resumen: "Los validadores no encontraron coincidencia en el extracto.",
      ocr,
      candidato: null,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes, eval_si: 0 },
    };
  }

  const needVision = ocr.votos < 7 || candidatos.length > 1;
  const evalSlots = Array.from({ length: EVAL_N }, (_, i) => i);
  const evalRaws = await mapPool(evalSlots, CONCURRENCY, (i) =>
    pasadaEval(
      ocr,
      elegido!,
      needVision || i === 0 ? opts.imageDataUrl : null,
    ),
  );
  let eval_si = 0;
  let eval_ok = 0;
  for (const r of evalRaws) {
    if (!r) continue;
    eval_ok += 1;
    if (r.confirma) eval_si += 1;
  }

  if (eval_si >= 2) {
    return {
      veredicto: "entro",
      resumen: `Entró: $${elegido.monto_cop.toLocaleString("es-CO")} el ${elegido.fecha} a las ${elegido.hora.slice(0, 5)} (doc ${elegido.documento}).`,
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok,
      detalle: { ocr_votos, match_votes, eval_si },
    };
  }
  if (eval_si === 0 && eval_ok >= 2) {
    return {
      veredicto: "no_entro",
      resumen: "Los jueces rechazaron el cruce con el extracto.",
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok,
      detalle: { ocr_votos, match_votes, eval_si },
    };
  }
  return {
    veredicto: "revisar",
    resumen: "Sin consenso claro entre los jueces. Revisa el movimiento sugerido.",
    ocr,
    candidato: elegido,
    candidatos,
    ocr_ok,
    match_ok,
    eval_ok,
    detalle: { ocr_votos, match_votes, eval_si },
  };
}
