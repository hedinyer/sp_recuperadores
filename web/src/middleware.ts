import { NextResponse, type NextRequest } from "next/server";

import {
  APP_ACCESS_KEY,
  APP_ACCESS_SESSION_SECRET,
} from "@/lib/appAccessSecrets";

const ACCESS_COOKIE = "app_access";

const PUBLIC_PATHS = [
  "/acceso",
  "/api/access/auth",
  "/api/access/sesion",
  "/api/calendario_marisol/calendar.ics",
  "/recoger-bogota",
  "/api/placas/recoger-bogota",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/icon.jpeg" ||
    pathname === "/robots.txt"
  ) {
    return true;
  }
  return false;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionOk(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await hmacSha256Hex(
    APP_ACCESS_SESSION_SECRET,
    `access:${APP_ACCESS_KEY}`,
  );
  return timingSafeEqualStr(cookieValue, expected);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (await sessionOk(cookie)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Acceso no autorizado. Ingresa la clave de la aplicación." },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/acceso";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
