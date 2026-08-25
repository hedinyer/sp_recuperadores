import { timingSafeEqual } from "crypto";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
} from "@/lib/calendarioMarisol";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Bearer: CARTERA_HERMES_TOKEN o el mismo token del calendario Marisol. */
export function carteraHermesTokenOk(request: Request): boolean {
  const expected = process.env.CARTERA_HERMES_TOKEN?.trim() ?? "";
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    if (bearer && safeEqual(bearer, expected)) return true;
  }
  return calendarioTokenOk(request);
}

export function carteraHermesTokenConfigured(): boolean {
  if (process.env.CARTERA_HERMES_TOKEN?.trim()) return true;
  return calendarioTokenConfigured();
}
