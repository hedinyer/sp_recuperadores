import { NextResponse } from "next/server";

import { buscarPorPlaca } from "@/lib/csvPlaca";
import { getFilasReporte } from "@/lib/cargarReporte";
import { supabase } from "@/lib/supabase";
import {
  mensajePlacaPendiente,
  placaEstaPendiente,
} from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";

export async function GET() {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const fechaStr = `${y}-${m}-${d}`;

    const { data, error } = await supabase
      .from("placas")
      .select("*")
      .gte("fecha", fechaStr)
      .lt("fecha", `${fechaStr}T23:59:59`)
      .order("id", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ placas: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al consultar placas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const placa = (body.placa ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    const gpsMotoRaw = String(body.gps_moto ?? "").trim().toLowerCase();
    const gps_moto = gpsMotoRaw === "system track" ? "system track" : "iop gps";
    if (!/^[A-Z0-9]{6}$/.test(placa)) {
      return NextResponse.json(
        { error: "La placa debe tener 6 caracteres alfanuméricos" },
        { status: 400 },
      );
    }

    const filas = await getFilasReporte();
    const existeEnReporte = !!buscarPorPlaca(filas, placa);
    if (!existeEnReporte) {
      return NextResponse.json(
        { error: "La placa no existe en la base principal de consulta" },
        { status: 400 },
      );
    }

    const { pendiente, origen } = await placaEstaPendiente(placa);
    if (pendiente && origen) {
      return NextResponse.json(
        { error: mensajePlacaPendiente(origen) },
        { status: 409 },
      );
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const fechaStr = `${y}-${m}-${d}`;

    const { data: existenteHoy, error: existeError } = await supabase
      .from("placas")
      .select("id")
      .eq("placa", placa)
      .gte("fecha", fechaStr)
      .lt("fecha", `${fechaStr}T23:59:59`)
      .maybeSingle();
    if (existeError) throw existeError;
    if (existenteHoy) {
      return NextResponse.json(
        { error: "La placa ya fue publicada hoy" },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("placas")
      .insert({
        placa,
        status: "pendiente",
        fecha: new Date().toISOString(),
        gps_moto,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ placa: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear placa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
