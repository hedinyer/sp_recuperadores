import { NextResponse } from "next/server";

import { listDestinatariosNequi } from "@/lib/railwebTarifa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const destinatarios = await listDestinatariosNequi();
    return NextResponse.json({ ok: true, destinatarios });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "No se pudieron listar destinatarios";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
