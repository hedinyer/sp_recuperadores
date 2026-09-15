/**
 * Harness pagos (ultra-rápido): 1 OCR → filtro → fast-accept o 1 eval texto.
 * Happy path: 1 visión. Duda: +1 OCR y/o +1 eval texto. Nunca visión en eval.
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
  deltaMinutosOcr,
  esFastAccept,
  filtrarCandidatos,
  type OcrConsenso,
} from "@/lib/pagosMatch";

const OCR_FIRST = 1;
const OCR_TIEBREAK = 1;
const FAST_DELTA_MIN = 5;
const OCR_CONF_MIN = 0.55;
const OCR_TIMEOUT_MS = 55_000;
const TEXT_TIMEOUT_MS = 35_000;
/** Vision models a veces razonan antes del JSON; 180 cortaba la respuesta. */
const OCR_MAX_TOKENS = 512;
const MATCH_MAX_TOKENS = 160;
const EVAL_MAX_TOKENS = 120;

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
    latencias_ms: {
      ocr: number;
      match: number;
      eval: number;
      total: number;
    };
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

const SYSTEM_OCR = `Eres un lector OCR de comprobantes de pago colombianos (Nequi, Bre-B, Bancolombia, Daviplata, PSE, corresponsal, transferencia, etc.).
Lee el texto visible en la imagen; no inventes.
Responde SOLO JSON:
{
  "monto_cop": number,
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM:SS",
  "banco": string|null,
  "referencia": string|null,
  "es_comprobante_pago": true|false,
  "confianza": number
}
Reglas:
- Monto: pesos enteros COP; quita puntos de miles y $; 40.000 → 40000.
- Fecha: dd/mm/yyyy → YYYY-MM-DD (Colombia).
- Hora: si solo HH:MM usa :00.
- Si no es comprobante de pago → es_comprobante_pago false y campos null.
Solo JSON.`;

const SYSTEM_MATCH = `Cruce extracto↔comprobante. Solo JSON:
{"documento":string|null,"coincide":bool,"razon":string}
Elige el más cercano en hora (±20 min). Sin hora: monto+fecha; si varios iguales → coincide false.`;

const SYSTEM_EVAL = `Confirma monto+fecha OCR vs extracto. Con hora en extracto: ±20 min. Solo JSON:
{"confirma":bool,"razon":string}`;

type OcrNorm = {
  monto_cop: number;
  fecha: string;
  hora: string;
  banco: string | null;
  referencia: string | null;
  es_comprobante_pago: true;
  confianza: number;
};

function normalizeOcr(raw: OcrRaw): OcrNorm | null {
  if (raw.es_comprobante_pago === false) return null;
  const monto_cop = parseMontoCop(raw.monto_cop);
  const fecha = parseFechaYmd(raw.fecha);
  const hora = parseHora(raw.hora);
  if (monto_cop == null || !fecha || !hora) return null;
  const confianza =
    typeof raw.confianza === "number" && Number.isFinite(raw.confianza)
      ? Math.min(1, Math.max(0, raw.confianza))
      : 0.7;
  return {
    monto_cop,
    fecha,
    hora,
    banco: raw.banco != null ? String(raw.banco) : null,
    referencia: raw.referencia != null ? String(raw.referencia) : null,
    es_comprobante_pago: true,
    confianza,
  };
}

function votoKey(monto: number, fecha: string, hora: string): string {
  const hm = hora.slice(0, 5);
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

function emptyLatencias() {
  return { ocr: 0, match: 0, eval: 0, total: 0 };
}

function describeOcrFail(raw: OcrRaw | null, err: string | null): string {
  if (err) return err;
  if (!raw) return "sin respuesta";
  if (raw.es_comprobante_pago === false) return "no parece comprobante";
  const faltan: string[] = [];
  if (parseMontoCop(raw.monto_cop) == null) faltan.push("monto");
  if (!parseFechaYmd(raw.fecha)) faltan.push("fecha");
  if (!parseHora(raw.hora)) faltan.push("hora");
  if (faltan.length) return `faltan ${faltan.join(", ")}`;
  return "no normalizable";
}

async function pasadaOcr(imageDataUrl: string): Promise<{
  raw: OcrRaw | null;
  err: string | null;
}> {
  try {
    const parts: HermesContentPart[] = [
      {
        type: "text",
        text: "Lee el comprobante de pago en la imagen. Responde solo JSON.",
      },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ];
    const text = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_OCR },
        { role: "user", content: parts },
      ],
      temperature: 0.1,
      timeoutMs: OCR_TIMEOUT_MS,
      max_tokens: OCR_MAX_TOKENS,
    });
    try {
      return { raw: parseJsonLoose<OcrRaw>(text), err: null };
    } catch {
      const tip = text.trim().slice(0, 80).replace(/\s+/g, " ");
      return {
        raw: null,
        err: tip ? `JSON inválido (${tip}…)` : "JSON inválido",
      };
    }
  } catch (e) {
    return {
      raw: null,
      err: e instanceof Error ? e.message.slice(0, 120) : "Hermes falló",
    };
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
      timeoutMs: TEXT_TIMEOUT_MS,
      max_tokens: MATCH_MAX_TOKENS,
    });
    return parseJsonLoose<MatchRaw>(raw);
  } catch {
    return null;
  }
}

/** Eval solo texto — nunca reenvía la imagen. */
async function pasadaEval(
  ocr: OcrConsenso,
  candidato: MovimientoExtracto,
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
      regla: "mismo monto, misma fecha; hora ±20 min si el extracto la trae",
    };
    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_EVAL },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.05,
      timeoutMs: TEXT_TIMEOUT_MS,
      max_tokens: EVAL_MAX_TOKENS,
    });
    return parseJsonLoose<EvalRaw>(raw);
  } catch {
    return null;
  }
}

/** 1 OCR; 2.ª solo si falla normalize o confianza baja. */
async function correrOcrRapido(
  imageDataUrl: string,
  think: (t: string) => void,
): Promise<{
  ocrNorm: OcrNorm[];
  total_intentos: number;
  ms: number;
}> {
  const t0 = Date.now();
  think("Leyendo el comprobante con OCR…");
  const first = await pasadaOcr(imageDataUrl);
  const firstNorm = first.raw ? normalizeOcr(first.raw) : null;
  const needsTiebreak = !firstNorm || firstNorm.confianza < OCR_CONF_MIN;

  if (!needsTiebreak && firstNorm) {
    think(
      `OCR ok: $${firstNorm.monto_cop.toLocaleString("es-CO")} el ${firstNorm.fecha} a las ${firstNorm.hora.slice(0, 5)} (confianza ${(firstNorm.confianza * 100).toFixed(0)}%).`,
    );
    return {
      ocrNorm: [firstNorm],
      total_intentos: OCR_FIRST,
      ms: Date.now() - t0,
    };
  }

  think(
    firstNorm
      ? `Confianza baja (${(firstNorm.confianza * 100).toFixed(0)}%). Segunda lectura…`
      : `No pude leer bien (${describeOcrFail(first.raw, first.err)}). Segunda lectura…`,
  );
  const extra = await pasadaOcr(imageDataUrl);
  const extraNorm = extra.raw ? normalizeOcr(extra.raw) : null;
  const ocrNorm = [firstNorm, extraNorm].filter((x): x is OcrNorm => x != null);
  if (extraNorm) {
    think(
      `Segunda lectura: $${extraNorm.monto_cop.toLocaleString("es-CO")} el ${extraNorm.fecha} a las ${extraNorm.hora.slice(0, 5)}.`,
    );
  } else if (!firstNorm) {
    think(
      `Segunda lectura también falló (${describeOcrFail(extra.raw, extra.err)}).`,
    );
  }

  return {
    ocrNorm,
    total_intentos: OCR_FIRST + OCR_TIEBREAK,
    ms: Date.now() - t0,
  };
}

function empateDuro(
  candidatos: MovimientoExtracto[],
  ocr: Pick<OcrConsenso, "hora">,
): boolean {
  if (candidatos.length < 2) return false;
  const sinHora = candidatos.every((c) => !c.hora.trim());
  if (sinHora) return true;
  const d0 = deltaMinutosOcr(candidatos[0]!, ocr);
  const d1 = deltaMinutosOcr(candidatos[1]!, ocr);
  if (d0 == null || d1 == null) return true;
  return d0 === d1;
}

export async function comprobarPagoHarness(opts: {
  imageDataUrl: string;
  movimientos: MovimientoExtracto[];
  usados?: string[];
  onThought?: (text: string) => void;
}): Promise<PagosHarnessResult> {
  const think = (t: string) => {
    try {
      opts.onThought?.(t);
    } catch {
      /* ignore UI callback errors */
    }
  };

  const tTotal = Date.now();
  const usados = new Set(opts.usados ?? []);
  const latencias = emptyLatencias();

  think(`Tengo ${opts.movimientos.length} ingresos del extracto. Empiezo.`);

  const { ocrNorm, total_intentos, ms: ocrMs } = await correrOcrRapido(
    opts.imageDataUrl,
    think,
  );
  latencias.ocr = ocrMs;
  const ocr_ok = ocrNorm.length;

  const voteMap = new Map<string, number>();
  for (const s of ocrNorm) {
    const k = votoKey(s.monto_cop, s.fecha, s.hora);
    voteMap.set(k, (voteMap.get(k) ?? 0) + 1);
  }
  const ocr_votos = [...voteMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const ocr = consensoOcr(ocrNorm, total_intentos);
  if (!ocr || ocr.votos < 1) {
    think("No hay consenso claro de monto, fecha y hora. Mejor revisar a mano.");
    latencias.total = Date.now() - tTotal;
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
      detalle: { ocr_votos, match_votes: [], eval_si: 0, latencias_ms: latencias },
    };
  }

  think(
    `Cruce: busco $${ocr.monto_cop.toLocaleString("es-CO")} el ${ocr.fecha} cerca de ${ocr.hora.slice(0, 5)} (±20 min)…`,
  );
  const candidatos = filtrarCandidatos(opts.movimientos, ocr, usados);
  if (!candidatos.length) {
    think("Ningún movimiento encaja. Parece que no entró.");
    latencias.total = Date.now() - tTotal;
    return {
      veredicto: "no_entro",
      resumen: `No hay movimiento de $${ocr.monto_cop.toLocaleString("es-CO")} el ${ocr.fecha} cerca de ${ocr.hora.slice(0, 5)}.`,
      ocr,
      candidato: null,
      candidatos: [],
      ocr_ok,
      match_ok: 0,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes: [], eval_si: 0, latencias_ms: latencias },
    };
  }

  think(
    candidatos.length === 1
      ? `Un candidato: doc ${candidatos[0]!.documento}${
          candidatos[0]!.hora.trim()
            ? ` (${candidatos[0]!.hora.slice(0, 5)})`
            : " (sin hora)"
        }.`
      : `${candidatos.length} candidatos cercanos. Ordenados por hora.`,
  );

  // Fast-accept: 1 candidato + Δ ≤ 5 min → entro sin LLM extra
  if (esFastAccept(candidatos, ocr, FAST_DELTA_MIN)) {
    const elegido = candidatos[0]!;
    const delta = deltaMinutosOcr(elegido, ocr);
    think(
      `Match claro (Δ ${delta} min ≤ ${FAST_DELTA_MIN}). Fast-accept — sin eval extra.`,
    );
    latencias.total = Date.now() - tTotal;
    return {
      veredicto: "entro",
      resumen: `Entró: $${elegido.monto_cop.toLocaleString("es-CO")} el ${elegido.fecha} a las ${elegido.hora.slice(0, 5)} (doc ${elegido.documento}).`,
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok: 0,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes: [], eval_si: 0, latencias_ms: latencias },
    };
  }

  let elegido: MovimientoExtracto | null = null;
  let match_ok = 0;
  let match_votes: Array<{ documento: string | null; count: number }> = [];
  const hayEmpate = empateDuro(candidatos, ocr);

  if (candidatos.length === 1) {
    elegido = candidatos[0]!;
    match_votes = [{ documento: elegido.documento, count: 1 }];
    const d = deltaMinutosOcr(elegido, ocr);
    think(
      d == null
        ? "Extracto sin hora: necesito confirmar con el juez de texto."
        : `Δ ${d} min > ${FAST_DELTA_MIN}: paso al juez de texto.`,
    );
  } else if (hayEmpate) {
    think(
      `Empate entre ${candidatos.length} movimientos. Pido a Hermes que elija…`,
    );
    const tMatch = Date.now();
    const matchRaw = await pasadaMatch(ocr, candidatos.slice(0, 8));
    latencias.match = Date.now() - tMatch;
    if (matchRaw) {
      match_ok = 1;
      const doc =
        matchRaw.coincide === false
          ? null
          : matchRaw.documento != null
            ? String(matchRaw.documento).trim() || null
            : null;
      match_votes = [{ documento: doc, count: 1 }];
      if (doc) {
        elegido =
          candidatos.find((c) => c.documento === doc) ??
          candidatos.find((c) => c.id.includes(doc)) ??
          null;
      }
      think(
        elegido
          ? `Hermes eligió doc ${elegido.documento}${matchRaw.razon ? `: ${matchRaw.razon}` : "."}`
          : `Hermes no pudo decidir${matchRaw.razon ? `: ${matchRaw.razon}` : "."}`,
      );
    }
    if (!elegido) {
      think("Empate sin resolución. Mejor revisar manualmente.");
      latencias.total = Date.now() - tTotal;
      return {
        veredicto: "revisar",
        resumen: `Hay ${candidatos.length} movimientos similares. Revisa manualmente.`,
        ocr,
        candidato: null,
        candidatos,
        ocr_ok,
        match_ok,
        eval_ok: 0,
        detalle: { ocr_votos, match_votes, eval_si: 0, latencias_ms: latencias },
      };
    }
  } else {
    elegido = candidatos[0]!;
    match_votes = [{ documento: elegido.documento, count: 1 }];
    const d = deltaMinutosOcr(elegido, ocr);
    think(
      `El más cercano es doc ${elegido.documento}${d != null ? ` (Δ ${d} min)` : ""}.`,
    );
  }

  if (!elegido) {
    think("Sin candidato usable.");
    latencias.total = Date.now() - tTotal;
    return {
      veredicto: "no_entro",
      resumen: "No se encontró coincidencia clara en el extracto.",
      ocr,
      candidato: null,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes, eval_si: 0, latencias_ms: latencias },
    };
  }

  // Tras selección clara por hora, fast-accept si Δ ≤ 5
  const deltaElegido = deltaMinutosOcr(elegido, ocr);
  if (deltaElegido != null && deltaElegido <= FAST_DELTA_MIN && !hayEmpate) {
    think(`Δ ${deltaElegido} min — fast-accept.`);
    latencias.total = Date.now() - tTotal;
    return {
      veredicto: "entro",
      resumen: `Entró: $${elegido.monto_cop.toLocaleString("es-CO")} el ${elegido.fecha} a las ${elegido.hora.slice(0, 5)} (doc ${elegido.documento}).`,
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok: 0,
      detalle: { ocr_votos, match_votes, eval_si: 0, latencias_ms: latencias },
    };
  }

  // Eval texto: Δ > 5, sin hora, o vino de empate
  think("Confirmando cruce con juez de texto…");
  const tEval = Date.now();
  const evalRaw = await pasadaEval(ocr, elegido);
  latencias.eval = Date.now() - tEval;
  let eval_si = 0;
  let eval_ok = 0;
  if (evalRaw) {
    eval_ok = 1;
    if (evalRaw.confirma) eval_si = 1;
    think(
      evalRaw.confirma
        ? `Juez confirma${evalRaw.razon ? `: ${evalRaw.razon}` : "."}`
        : `Juez rechaza${evalRaw.razon ? `: ${evalRaw.razon}` : "."}`,
    );
  } else {
    think("El juez no respondió.");
  }

  latencias.total = Date.now() - tTotal;

  if (eval_ok === 0) {
    return {
      veredicto: "revisar",
      resumen: "No se pudo confirmar el cruce. Revisa el movimiento sugerido.",
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok,
      detalle: { ocr_votos, match_votes, eval_si, latencias_ms: latencias },
    };
  }

  if (eval_si >= 1) {
    think("Listo: el pago entró.");
    return {
      veredicto: "entro",
      resumen: `Entró: $${elegido.monto_cop.toLocaleString("es-CO")} el ${elegido.fecha} a las ${elegido.hora.slice(0, 5) || "—"} (doc ${elegido.documento}).`,
      ocr,
      candidato: elegido,
      candidatos,
      ocr_ok,
      match_ok,
      eval_ok,
      detalle: { ocr_votos, match_votes, eval_si, latencias_ms: latencias },
    };
  }

  think("Listo: no entró según el cruce.");
  return {
    veredicto: "no_entro",
    resumen: "El juez rechazó el cruce con el extracto.",
    ocr,
    candidato: elegido,
    candidatos,
    ocr_ok,
    match_ok,
    eval_ok,
    detalle: { ocr_votos, match_votes, eval_si, latencias_ms: latencias },
  };
}
