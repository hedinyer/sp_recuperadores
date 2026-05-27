import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_session";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "8484";
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ?? "sp-recuperadores-admin-v1";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 días

function sessionToken(): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(ADMIN_PASSWORD)
    .digest("hex");
}

export function verifyAdminPassword(password: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAdminSession(value: string | undefined): boolean {
  if (!value) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hasAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return isAdminSession(jar.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function adminSessionValue(): string {
  return sessionToken();
}
