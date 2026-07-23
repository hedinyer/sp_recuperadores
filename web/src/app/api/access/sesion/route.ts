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

const BUCKET = "fotos";
const CARPETA = "sesiones_acceso";

function clientIp(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

async function subirJpeg(
  file: File,
  lado: "frontal" | "trasera",
  stamp: number,
): Promise<string> {
  const ruta = `${CARPETA}/${stamp}_${lado}.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, buffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

/** Listado solo para admin (quién abrió la app). */
export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("sesiones_app")
    .select(
      "id, abierto_at, lat, lng, accuracy_m, altitude_m, gps_coords, foto_frontal_url, foto_trasera_url, flash_frontal, flash_trasera, user_agent, viewport, ip",
    )
    .order("abierto_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sesiones: data ?? [] });
}

/**
 * Abre sesión de app: clave + GPS preciso + foto frontal + trasera.
 * Solo entonces emite la cookie de acceso.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const key = String(form.get("key") ?? "");
    if (!verifyAccessKey(key)) {
      return NextResponse.json(
        { ok: false, error: "Clave incorrecta" },
        { status: 401 },
      );
    }

    const fotoFrontal = form.get("foto_frontal");
    const fotoTrasera = form.get("foto_trasera");
    if (!(fotoFrontal instanceof File) || fotoFrontal.size === 0) {
      return NextResponse.json(
        { ok: false, error: "Falta la foto frontal" },
        { status: 400 },
      );
    }
    if (!(fotoTrasera instanceof File) || fotoTrasera.size === 0) {
      return NextResponse.json(
        { ok: false, error: "Falta la foto trasera" },
        { status: 400 },
      );
    }

    const lat = Number(form.get("lat"));
    const lng = Number(form.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "GPS inválido" },
        { status: 400 },
      );
    }

    const numOrNull = (v: FormDataEntryValue | null) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const accuracy_m = numOrNull(form.get("accuracy_m"));
    const altitude_m = numOrNull(form.get("altitude_m"));
    const altitude_accuracy_m = numOrNull(form.get("altitude_accuracy_m"));
    const heading = numOrNull(form.get("heading"));
    const speed_mps = numOrNull(form.get("speed_mps"));
    const gps_coords =
      String(form.get("gps_coords") ?? "").trim() ||
      `${lat.toFixed(8)},${lng.toFixed(8)}`;
    const flash_frontal = String(form.get("flash_frontal")) === "1";
    const flash_trasera = String(form.get("flash_trasera")) === "1";
    const viewport = String(form.get("viewport") ?? "").trim() || null;
    const user_agent =
      String(form.get("user_agent") ?? "").trim() ||
      request.headers.get("user-agent");

    const stamp = Date.now();
    const [foto_frontal_url, foto_trasera_url] = await Promise.all([
      subirJpeg(fotoFrontal, "frontal", stamp),
      subirJpeg(fotoTrasera, "trasera", stamp),
    ]);

    const { data, error } = await supabase
      .from("sesiones_app")
      .insert({
        lat,
        lng,
        accuracy_m,
        altitude_m,
        altitude_accuracy_m,
        heading,
        speed_mps,
        gps_coords,
        foto_frontal_url,
        foto_trasera_url,
        flash_frontal,
        flash_trasera,
        user_agent,
        viewport,
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

    const res = NextResponse.json({
      ok: true,
      sesion: data,
    });
    res.cookies.set(ACCESS_COOKIE, accessSessionValue(), accessCookieOptions());
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar sesión";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
