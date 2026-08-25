import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  accessCookieOptions,
  accessSessionValue,
  verifyAccessKey,
} from "@/lib/appAccess";
import { hasAdminSession } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function clientIp(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Listado solo para admin (quién abrió la app). */
export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("sesiones_app")
    .select(
      "id, abierto_at, lat, lng, accuracy_m, altitude_m, gps_coords, user_agent, viewport, ip",
    )
    .order("abierto_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sesiones: data ?? [] });
}

/** Abre sesión: clave + GPS preciso. Emite cookie de acceso. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const key = String(body.key ?? "");
    const recordar = Boolean(body.recordar);
    if (!verifyAccessKey(key)) {
      return NextResponse.json(
        { ok: false, error: "Clave incorrecta" },
        { status: 401 },
      );
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "GPS inválido" },
        { status: 400 },
      );
    }

    const gps_coords =
      String(body.gps_coords ?? "").trim() ||
      `${lat.toFixed(8)},${lng.toFixed(8)}`;

    const { data, error } = await supabase
      .from("sesiones_app")
      .insert({
        lat,
        lng,
        accuracy_m: numOrNull(body.accuracy_m),
        altitude_m: numOrNull(body.altitude_m),
        altitude_accuracy_m: numOrNull(body.altitude_accuracy_m),
        heading: numOrNull(body.heading),
        speed_mps: numOrNull(body.speed_mps),
        gps_coords,
        // Columnas foto aún NOT NULL en prod; fotos ya no se capturan.
        foto_frontal_url: "",
        foto_trasera_url: "",
        flash_frontal: false,
        flash_trasera: false,
        user_agent:
          String(body.user_agent ?? "").trim() ||
          request.headers.get("user-agent"),
        viewport: String(body.viewport ?? "").trim() || null,
        ip: clientIp(request),
      })
      .select("id, abierto_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const res = NextResponse.json({ ok: true, sesion: data });
    res.cookies.set(
      ACCESS_COOKIE,
      accessSessionValue(),
      accessCookieOptions(recordar),
    );
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar sesión";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
