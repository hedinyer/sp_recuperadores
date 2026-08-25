import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_BASE = "http://159.65.228.108/cobrador/v1";
const DEFAULT_MODEL = "hermes-cobrador";
const MAX_BODY_CHARS = 6_000_000; // ~6MB JSON soft cap

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMsg = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

function normalizeContent(
  content: unknown,
  role: string,
): string | ContentPart[] | null {
  if (typeof content === "string") {
    const t = content.trim();
    if (!t) return null;
    return t.slice(0, role === "assistant" ? 16000 : 8000);
  }
  if (!Array.isArray(content)) return null;

  const parts: ContentPart[] = [];
  for (const p of content) {
    if (!p || typeof p !== "object") continue;
    const part = p as Record<string, unknown>;
    if (part.type === "text" && typeof part.text === "string") {
      const t = part.text.trim();
      if (t) parts.push({ type: "text", text: t.slice(0, 8000) });
      continue;
    }
    if (part.type === "image_url") {
      const url =
        typeof part.image_url === "object" &&
        part.image_url &&
        typeof (part.image_url as { url?: unknown }).url === "string"
          ? String((part.image_url as { url: string }).url)
          : typeof part.url === "string"
            ? part.url
            : "";
      // solo data:image… (no URLs externas arbitrarias)
      if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url) && url.length < 2_500_000) {
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
  }
  return parts.length ? parts : null;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { error: "Adjunto demasiado grande (máx ~4 MB total)" },
        { status: 413 },
      );
    }

    const body = JSON.parse(rawBody) as {
      messages?: ChatMsg[];
      perfil_id?: string | null;
      perfil_nombre?: string | null;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return NextResponse.json({ error: "Faltan messages" }, { status: 400 });
    }

    const trimmed: ChatMsg[] = [];
    for (const m of messages.slice(-24)) {
      if (!m || (m.role !== "user" && m.role !== "assistant" && m.role !== "system")) {
        continue;
      }
      const content = normalizeContent(m.content, m.role);
      if (!content) continue;
      trimmed.push({ role: m.role, content });
    }

    if (!trimmed.length) {
      return NextResponse.json({ error: "Mensajes vacíos" }, { status: 400 });
    }

    const perfilNombre = String(body.perfil_nombre ?? "").trim();
    const perfilId = String(body.perfil_id ?? "").trim();
    const prefix: ChatMsg[] = [];
    if (perfilId || perfilNombre) {
      prefix.push({
        role: "system",
        content:
          `El cobrador en la app es ${perfilNombre || perfilId}` +
          (perfilId ? ` (perfil_id=${perfilId}).` : ".") +
          " Usa ese perfil_id al registrar gestiones. No envíes WhatsApp al cliente." +
          " Si hay capturas adjuntas, léelas y registra lo que diga el cliente.",
      });
    }

    const base = (
      process.env.HERMES_COBRADOR_BASE_URL?.trim() || DEFAULT_BASE
    ).replace(/\/$/, "");
    const model =
      process.env.HERMES_COBRADOR_MODEL?.trim() || DEFAULT_MODEL;

    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model,
        messages: [...prefix, ...trimmed],
      }),
      signal: AbortSignal.timeout(110_000),
    });

    const raw = await upstream.text();
    let data: Record<string, unknown> = {};
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json(
        { error: raw.slice(0, 300) || "Respuesta inválida de Hermes" },
        { status: 502 },
      );
    }

    if (!upstream.ok) {
      const err =
        (data.error as { message?: string } | undefined)?.message ||
        (typeof data.error === "string" ? data.error : null) ||
        `Hermes HTTP ${upstream.status}`;
      return NextResponse.json({ error: err }, { status: 502 });
    }

    const choice = (data.choices as Array<{ message?: { content?: string } }>)?.[0];
    const content = String(choice?.message?.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Hermes no devolvió texto" },
        { status: 502 },
      );
    }

    return NextResponse.json({ content, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al hablar con Hermes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
