import type { PagosHarnessResult } from "@/lib/pagosHarness";
import type { MovimientoExtracto } from "@/lib/pagosExtracto";
import {
  dataUrlToBase64,
  mapPagosOcrToHarness,
  thoughtsFromPagosOcr,
  validarPagoEnSpark,
} from "@/lib/pagosOcrClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY = 6_000_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

type StreamEvent =
  | { type: "thought"; text: string }
  | { type: "result"; ok: true; result: PagosHarnessResult }
  | { type: "error"; error: string };

function ndjsonLine(ev: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(ev)}\n`);
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "No se pudo leer el cuerpo" }, { status: 400 });
  }

  if (rawBody.length > MAX_BODY) {
    return Response.json(
      { error: "Adjunto demasiado grande (máx ~4 MB)" },
      { status: 413 },
    );
  }

  let body: {
    image_data_url?: string;
    movimientos?: MovimientoExtracto[];
    usados?: string[];
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const image = String(body.image_data_url ?? "").trim();
  if (!DATA_URL_RE.test(image) || image.length > 2_500_000) {
    return Response.json(
      { error: "Sube una imagen de comprobante (JPEG/PNG)" },
      { status: 400 },
    );
  }
  const movimientos = Array.isArray(body.movimientos) ? body.movimientos : [];
  if (!movimientos.length) {
    return Response.json(
      { error: "Carga el extracto del banco antes de comprobar" },
      { status: 400 },
    );
  }

  const clean: MovimientoExtracto[] = [];
  for (const m of movimientos.slice(0, 2000)) {
    if (!m || typeof m !== "object") continue;
    const monto = Number(m.monto_cop);
    const fecha = String(m.fecha ?? "");
    const hora = String(m.hora ?? "");
    // hora vacía permitida (extractos sin columna de hora)
    if (!Number.isFinite(monto) || monto <= 0 || !fecha) continue;
    clean.push({
      id: String(m.id ?? `${m.documento}|${fecha}|${hora || "sin-hora"}`),
      fecha,
      hora,
      monto_cop: Math.round(monto),
      documento: String(m.documento ?? ""),
      transaccion: String(m.transaccion ?? ""),
      oficina: String(m.oficina ?? ""),
      referencia2: String(m.referencia2 ?? ""),
      motivo: String(m.motivo ?? ""),
    });
  }
  if (!clean.length) {
    return Response.json(
      { error: "El extracto no tiene movimientos de ingreso válidos" },
      { status: 400 },
    );
  }

  const usados = Array.isArray(body.usados)
    ? body.usados.map(String).slice(0, 2000)
    : [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (ev: StreamEvent) => {
        controller.enqueue(ndjsonLine(ev));
      };
      try {
        push({
          type: "thought",
          text: `Enviando comprobante + ${clean.length} ingresos a pagos-ocr (Spark)…`,
        });
        const spark = await validarPagoEnSpark({
          imageBase64: dataUrlToBase64(image),
          movimientos: clean,
          usados,
          askCobradorSiAmbiguo: false,
        });
        for (const t of thoughtsFromPagosOcr(spark)) {
          push({ type: "thought", text: t });
        }
        const result = mapPagosOcrToHarness(spark);
        push({ type: "result", ok: true, result });
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Error al comprobar el pago";
        push({ type: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
