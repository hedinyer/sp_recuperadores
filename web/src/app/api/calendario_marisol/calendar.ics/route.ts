import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
  eventosToIcs,
  listEventos,
} from "@/lib/calendarioMarisol";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!calendarioTokenConfigured()) {
      return new NextResponse("CALENDARIO_MARISOL_TOKEN no configurado", {
        status: 503,
      });
    }
    if (!calendarioTokenOk(request)) {
      return new NextResponse("No autorizado", { status: 401 });
    }
    const ics = eventosToIcs(await listEventos());
    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="calendario-marisol.ics"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error ICS";
    return new NextResponse(msg, { status: 500 });
  }
}
