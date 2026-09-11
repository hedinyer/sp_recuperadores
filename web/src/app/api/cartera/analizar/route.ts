import { NextResponse } from "next/server";

import { analizarGestionesPerfil } from "@/lib/carteraIaHarness";
import { esPerfilCarteraId } from "@/lib/carteraPerfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      perfil_id?: string;
      force?: boolean;
    };
    const perfilId = String(body.perfil_id ?? "").trim();
    if (!esPerfilCarteraId(perfilId)) {
      return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
    }
    if (perfilId !== "jhon_saenz" && perfilId !== "james_blanco") {
      return NextResponse.json(
        { error: "El análisis IA v1 es solo para Jhon y James" },
        { status: 400 },
      );
    }

    const resumen = await analizarGestionesPerfil(perfilId, {
      force: Boolean(body.force),
    });

    return NextResponse.json({
      ok: true,
      ...resumen,
      generado_en: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al analizar";
    // Tablas aún no creadas
    if (/relation .* does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Faltan tablas IA. Aplica web/sql/cartera_ia_cobro.sql en Supabase.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
