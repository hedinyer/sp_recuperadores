import { NextResponse } from "next/server";

import { hermesChatCompletion, type HermesMessage } from "@/lib/hermesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY = 6_000_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

type ChatRole = "user" | "assistant";

type InMsg = {
  role?: string;
  content?: string;
};

const SYSTEM_PAGOS = `Eres el asistente de validación de pagos de Soluciones Pinilla (Colombia).
Ayudas a cruzar comprobantes (Nequi, Bre-B, Bancolombia, etc.) con el extracto bancario.
Responde en español, breve y claro. Usa Markdown (negrita, listas, tablas, código) cuando ayude a leer.
No inventes movimientos: si no hay datos, dilo.
Si el usuario pregunta por un pago ambiguo, sugiere qué revisar (monto, fecha, hora ±20 min, documento).
No registres gestiones de cartera ni envíes WhatsApp.`;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY) {
      return NextResponse.json(
        { error: "Adjunto demasiado grande" },
        { status: 413 },
      );
    }

    const body = JSON.parse(rawBody) as {
      message?: string;
      messages?: InMsg[];
      contexto?: string | null;
      image_data_url?: string | null;
    };

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Escribe un mensaje" }, { status: 400 });
    }

    const historial: HermesMessage[] = [];
    const prev = Array.isArray(body.messages) ? body.messages : [];
    for (const m of prev.slice(-16)) {
      if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
      const c = String(m.content ?? "").trim();
      if (!c) continue;
      historial.push({
        role: m.role as ChatRole,
        content: c.slice(0, m.role === "assistant" ? 12000 : 6000),
      });
    }

    const contexto = String(body.contexto ?? "").trim().slice(0, 4000);
    const image = String(body.image_data_url ?? "").trim();
    const hasImage = DATA_URL_RE.test(image) && image.length < 2_500_000;

    const userParts: HermesMessage["content"] = hasImage
      ? [
          {
            type: "text",
            text:
              (contexto ? `Contexto del cruce:\n${contexto}\n\n` : "") +
              message,
          },
          { type: "image_url", image_url: { url: image } },
        ]
      : (contexto ? `Contexto del cruce:\n${contexto}\n\n${message}` : message);

    const content = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_PAGOS },
        ...historial,
        { role: "user", content: userParts },
      ],
      temperature: 0.3,
      max_tokens: 900,
      timeoutMs: 90_000,
    });

    return NextResponse.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al enviar el mensaje";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
