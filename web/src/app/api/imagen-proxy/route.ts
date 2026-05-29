import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hostSupabase(): string {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://hvtbzxifzkbvmqpshmqw.supabase.co";
  return new URL(base).host;
}

export async function GET(request: Request) {
  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Falta url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  if (parsed.host !== hostSupabase()) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!parsed.pathname.includes("/storage/v1/object/public/fotos/")) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
  }

  try {
    const res = await fetch(parsed.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al obtener imagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
