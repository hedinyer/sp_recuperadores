import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  accessCookieOptions,
  accessSessionValue,
  hasAccessSession,
  verifyAccessKey,
} from "@/lib/appAccess";

export const runtime = "nodejs";

export async function GET() {
  const ok = await hasAccessSession();
  return NextResponse.json({ ok });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const key = String(body.key ?? body.password ?? "");

    if (!verifyAccessKey(key)) {
      return NextResponse.json(
        { ok: false, error: "Clave incorrecta" },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACCESS_COOKIE, accessSessionValue(), accessCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  return res;
}
