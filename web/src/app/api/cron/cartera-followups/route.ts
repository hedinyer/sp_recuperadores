import { NextResponse } from "next/server";

import { dispararFollowupsVencidos } from "@/lib/carteraIaHarness";
import {
  carteraHermesTokenConfigured,
  carteraHermesTokenOk,
} from "@/lib/carteraHermesAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: Request): boolean {
  const expectedCron = process.env.CRON_SECRET?.trim();
  const cronHeader =
    request.headers.get("x-cron-secret")?.trim() ||
    new URL(request.url).searchParams.get("secret")?.trim() ||
    "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();

  if (
    expectedCron &&
    (cronHeader === expectedCron || bearer === expectedCron)
  ) {
    return true;
  }
  if (carteraHermesTokenConfigured() && carteraHermesTokenOk(request)) {
    return true;
  }
  return false;
}

async function run() {
  const result = await dispararFollowupsVencidos();
  return NextResponse.json({
    ok: true,
    ...result,
    generado_en: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cron followups";
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
    const msg = e instanceof Error ? e.message : "Error cron followups";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
