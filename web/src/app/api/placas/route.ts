import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

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
    const placa = (body.placa ?? "").trim().toUpperCase();
    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("placas")
      .insert({ placa, status: "pendiente", fecha: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ placa: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear placa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
