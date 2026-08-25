import { NextResponse } from "next/server";

import {
  esCarteraStatus,
  esPerfilCarteraId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { notaConMontoPago } from "@/lib/carteraKpis";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function parseMonto(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Historial de gestiones de una placa. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placa = normalizarPlaca(searchParams.get("placa") ?? "");
    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }

    const withMonto = await supabase
      .from("cartera_gestiones")
      .select("id, placa, perfil_id, status, categoria, notas, monto, created_at")
      .eq("placa", placa)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!withMonto.error) {
      return NextResponse.json({ items: withMonto.data ?? [] });
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
      monto?: number | string | null;
    };

    const placa = normalizarPlaca(body.placa ?? "");
    const perfil_id = String(body.perfil_id ?? "").trim();
    const statusRaw = String(body.status ?? "").trim();
    let notas =
      body.notas != null && String(body.notas).trim()
        ? String(body.notas).trim().slice(0, 500)
        : null;
    const categoria =
      body.categoria != null && String(body.categoria).trim()
        ? String(body.categoria).trim()
        : null;
    const monto = parseMonto(body.monto);

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

    if (status === "abono") {
      if (!monto) {
        return NextResponse.json(
          { error: "Escribe el valor del pago" },
          { status: 400 },
        );
      }
      notas = notaConMontoPago(monto, notas);
    }

    const baseRow = {
      placa,
      perfil_id,
      status,
      categoria,
      notas,
    };

    let gestion: Record<string, unknown> | null = null;
    let errGestionMsg: string | null = null;

    if (status === "abono" && monto) {
      const withMonto = await supabase
        .from("cartera_gestiones")
        .insert({ ...baseRow, monto })
        .select("id, placa, perfil_id, status, categoria, notas, monto, created_at")
        .single();
      if (!withMonto.error) {
        gestion = withMonto.data;
      } else if (!/monto|schema cache|column/i.test(withMonto.error.message)) {
        errGestionMsg = withMonto.error.message;
      }
    }

    if (!gestion && !errGestionMsg) {
      const { data, error } = await supabase
        .from("cartera_gestiones")
        .insert(baseRow)
        .select("id, placa, perfil_id, status, categoria, notas, created_at")
        .single();
      if (error) {
        const hint = /schema cache|does not exist|PGRST/i.test(error.message)
          ? " Aplica web/sql/cartera_seguimiento.sql en el SQL Editor de Supabase."
          : "";
        return NextResponse.json(
          { error: error.message + hint },
          { status: 500 },
        );
      }
      gestion = data
        ? { ...data, monto: status === "abono" ? monto : null }
        : null;
    } else if (errGestionMsg) {
      const hint = /schema cache|does not exist|PGRST/i.test(errGestionMsg)
        ? " Aplica web/sql/cartera_seguimiento.sql en el SQL Editor de Supabase."
        : "";
      return NextResponse.json(
        { error: errGestionMsg + hint },
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
