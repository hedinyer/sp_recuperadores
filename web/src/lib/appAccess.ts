import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import {
  APP_ACCESS_KEY,
  APP_ACCESS_SESSION_SECRET,
} from "@/lib/appAccessSecrets";

export const ACCESS_COOKIE = "app_access";

const ACCESS_KEY = APP_ACCESS_KEY;
const SESSION_SECRET = APP_ACCESS_SESSION_SECRET;
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 días
const MAX_AGE_RECORDAR_SEC = 60 * 60 * 24 * 365 * 10; // 10 años

function sessionToken(): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(`access:${ACCESS_KEY}`)
    .digest("hex");
}

export function verifyAccessKey(key: string): boolean {
  if (!ACCESS_KEY) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(ACCESS_KEY);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAccessSession(value: string | undefined): boolean {
  if (!value || !ACCESS_KEY) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hasAccessSession(): Promise<boolean> {
  const jar = await cookies();
  return isAccessSession(jar.get(ACCESS_COOKIE)?.value);
}

export function accessCookieOptions(recordar = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: recordar ? MAX_AGE_RECORDAR_SEC : MAX_AGE_SEC,
  };
}

export function accessSessionValue(): string {
  return sessionToken();
}
