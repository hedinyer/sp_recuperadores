import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "fotos";
const CARPETA = "placas_recuperadas";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const placaRaw = String(formData.get("placa") ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
    }
    if (!placaRaw) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }

    // El cliente envía JPEG comprimido; en servidor siempre guardamos .jpg
    const nombre = `${placaRaw}_${Date.now()}.jpg`;
    const ruta = `${CARPETA}/${nombre}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

    return NextResponse.json({
      foto: urlData.publicUrl,
      path: ruta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al subir foto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
