import { NextResponse } from "next/server";

import {
  esCarteraStatus,
  esPerfilCarteraId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

/** Historial de gestiones de una placa. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placa = normalizarPlaca(searchParams.get("placa") ?? "");
    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("cartera_gestiones")
      .select("id, placa, perfil_id, status, categoria, notas, created_at")
      .eq("placa", placa)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar gestiones";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Registra una gestión y actualiza el caso actual. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      placa?: string;
      perfil_id?: string;
      status?: string;
      notas?: string | null;
      categoria?: string | null;
    };

    const placa = normalizarPlaca(body.placa ?? "");
    const perfil_id = String(body.perfil_id ?? "").trim();
    const statusRaw = String(body.status ?? "").trim();
    const notas =
      body.notas != null && String(body.notas).trim()
        ? String(body.notas).trim().slice(0, 500)
        : null;
    const categoria =
      body.categoria != null && String(body.categoria).trim()
        ? String(body.categoria).trim()
        : null;

    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }
    if (!esPerfilCarteraId(perfil_id)) {
      return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
    }
    if (!esCarteraStatus(statusRaw)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    const status: CarteraStatus = statusRaw;

    const { data: gestion, error: errGestion } = await supabase
      .from("cartera_gestiones")
      .insert({
        placa,
        perfil_id,
        status,
        categoria,
        notas,
      })
      .select("id, placa, perfil_id, status, categoria, notas, created_at")
      .single();

    if (errGestion) {
      const hint = /schema cache|does not exist|PGRST/i.test(errGestion.message)
        ? " Aplica web/sql/cartera_seguimiento.sql en el SQL Editor de Supabase."
        : "";
      return NextResponse.json(
        { error: errGestion.message + hint },
        { status: 500 },
      );
    }

    const { data: caso, error: errCaso } = await supabase
      .from("cartera_casos")
      .upsert(
        {
          placa,
          perfil_id,
          status,
          categoria,
          notas,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "placa" },
      )
      .select("placa, perfil_id, categoria, status, notas, updated_at")
      .single();

    if (errCaso) {
      return NextResponse.json({ error: errCaso.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, gestion, caso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar gestión";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
