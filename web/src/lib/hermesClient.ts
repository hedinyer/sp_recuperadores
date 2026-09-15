/**
 * Cliente mínimo OpenAI-compatible → Hermes Cobrador.
 */

const DEFAULT_BASE = "http://159.65.228.108/cobrador/v1";
const DEFAULT_MODEL = "hermes-cobrador";

/** Cupo del servidor Hermes; reintentamos si está lleno. */
const CONCURRENCY_RE = /too many concurrent runs/i;
const CONCURRENCY_RETRIES = 4;
const CONCURRENCY_BACKOFF_MS = [1_500, 3_000, 6_000, 10_000];

export type HermesContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type HermesMessage = {
  role: "system" | "user" | "assistant";
  content: string | HermesContentPart[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorMessageFromBody(
  data: Record<string, unknown>,
  status: number,
  raw: string,
): string {
  return (
    (data.error as { message?: string } | undefined)?.message ||
    (typeof data.error === "string" ? data.error : null) ||
    raw.slice(0, 300) ||
    `Hermes HTTP ${status}`
  );
}

async function hermesChatCompletionOnce(opts: {
  messages: HermesMessage[];
  temperature?: number;
  timeoutMs?: number;
  max_tokens?: number;
}): Promise<string> {
  const base = (
    process.env.HERMES_COBRADOR_BASE_URL?.trim() || DEFAULT_BASE
  ).replace(/\/$/, "");
  const model = process.env.HERMES_COBRADOR_MODEL?.trim() || DEFAULT_MODEL;

  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.max_tokens != null ? { max_tokens: opts.max_tokens } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });

  const raw = await upstream.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new Error(raw.slice(0, 300) || "Respuesta inválida de Hermes");
  }

  if (!upstream.ok) {
    throw new Error(errorMessageFromBody(data, upstream.status, raw));
  }

  const choice = (
    data.choices as Array<{ message?: { content?: string } }>
  )?.[0];
  const content = String(choice?.message?.content ?? "").trim();
  if (!content) throw new Error("Hermes no devolvió texto");
  return content;
}

export async function hermesChatCompletion(opts: {
  messages: HermesMessage[];
  temperature?: number;
  timeoutMs?: number;
  max_tokens?: number;
}): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= CONCURRENCY_RETRIES; attempt++) {
    try {
      return await hermesChatCompletionOnce(opts);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastErr = err;
      const retryable = CONCURRENCY_RE.test(err.message);
      if (!retryable || attempt >= CONCURRENCY_RETRIES) throw err;
      const wait =
        CONCURRENCY_BACKOFF_MS[attempt] ??
        CONCURRENCY_BACKOFF_MS[CONCURRENCY_BACKOFF_MS.length - 1]!;
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error("Hermes falló");
}

/** Extrae el primer objeto JSON del texto (tolerante a markdown). */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No hay JSON en la respuesta");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
