import { NextResponse } from "next/server";

import { refrescarVentasCache } from "@/lib/ventasCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Carga 4 fuentes; puede tardar. */
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const expectedCron = process.env.CRON_SECRET?.trim();
  if (!expectedCron) return false;
  const cronHeader =
    request.headers.get("x-cron-secret")?.trim() ||
    new URL(request.url).searchParams.get("secret")?.trim() ||
    "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return cronHeader === expectedCron || bearer === expectedCron;
}

async function run() {
  const payload = await refrescarVentasCache();
  return NextResponse.json({
    ok: true,
    generado_en: payload.generado_en,
    total_n: payload.totales.total_n,
    historia_desde: payload.historia_desde,
    mensaje: "Cache de ventas refrescado (corte diario 6:00 America/Bogota)",
  });
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cron ventas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cron ventas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
