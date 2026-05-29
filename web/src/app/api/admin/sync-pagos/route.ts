import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import { sincronizarPagosHistoricos } from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";

/** Migración única: alinea status de placas con pagos/recuperaciones en recuperadores. */
export async function POST() {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const resultado = await sincronizarPagosHistoricos();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al sincronizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
