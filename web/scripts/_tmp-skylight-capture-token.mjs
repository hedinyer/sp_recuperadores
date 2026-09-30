import { chromium } from "playwright";
import { createHash, randomBytes, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const EMAIL = "marisolpinilla@hotmail.com";
const PASSWORD = "Bera8484!!";
const BASE = "https://app.ourskylight.com";
const FINGERPRINT = "907d5fac-3451-4333-9ae4-307337debcb9";
const OAUTH_URL = "https://ngjpndqmkhhdqjjljfmp.supabase.co";
const OAUTH_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/auth/session/new`, { waitUntil: "domcontentloaded" });
  // Already logged in? success page has no email field
  if (await page.locator('input[type="email"], input[name="email"]').count()) {
    await page.fill('input[type="email"], input[name="email"]', EMAIL);
    await page.fill(
      'input[type="password"], input[name="password"]',
      PASSWORD,
    );
    await Promise.all([
      page
        .waitForURL(/session\/success|ourskylight|frames|oauth/i, {
          timeout: 45000,
        })
        .catch(() => null),
      page.click('button:has-text("Log In"), input[type="submit"]'),
    ]);
  }
  console.log("after login url", page.url());

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(18));
  const fingerprint = FINGERPRINT || randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "skylight-mobile",
    redirect_uri: "skylight-family://welcome",
    scope: "everything",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    skylight_api_client_device_fingerprint: fingerprint,
  });

  let redirectUrl = null;
  page.on("request", (req) => {
    const u = req.url();
    if (u.startsWith("skylight-family:")) redirectUrl = u;
  });
  page.on("response", (resp) => {
    if (resp.url().includes("/oauth/authorize")) {
      const loc = resp.headers()["location"];
      if (loc?.startsWith("skylight-family:")) redirectUrl = loc;
    }
  });

  try {
    await page.goto(`${BASE}/oauth/authorize?${params}`, {
      waitUntil: "commit",
      timeout: 20000,
    });
  } catch (e) {
    console.log("goto error (expected):", String(e.message || e).slice(0, 200));
  }

  if (!redirectUrl) {
    const resp = await context.request.get(`${BASE}/oauth/authorize?${params}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    console.log("api authorize", resp.status(), resp.headers()["location"]);
    redirectUrl = resp.headers()["location"] || redirectUrl;
  }

  console.log("redirectUrl", redirectUrl);
  if (!redirectUrl?.startsWith("skylight-family:")) {
    throw new Error("No OAuth redirect captured");
  }
  const u = new URL(redirectUrl);
  if (u.searchParams.get("state") !== state) throw new Error("state mismatch");
  const code = u.searchParams.get("code");
  if (!code) throw new Error("code missing");

  const tokenResp = await context.request.post(`${BASE}/oauth/token`, {
    form: {
      grant_type: "authorization_code",
      client_id: "skylight-mobile",
      code,
      redirect_uri: "skylight-family://welcome",
      code_verifier: verifier,
      skylight_api_client_device_fingerprint: fingerprint,
    },
  });
  const payload = await tokenResp.json();
  if (!payload.refresh_token) {
    throw new Error(`token exchange failed: ${JSON.stringify(payload)}`);
  }

  const sb = createClient(OAUTH_URL, OAUTH_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.from("skylight_oauth").upsert(
    {
      id: "default",
      refresh_token: payload.refresh_token,
      device_fingerprint: fingerprint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`supabase upsert: ${error.message}`);

  writeFileSync(
    "scripts/_tmp-skylight-tokens.json",
    JSON.stringify(
      {
        refresh_token: payload.refresh_token,
        fingerprint,
        hasAccess: Boolean(payload.access_token),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      refreshPrefix: payload.refresh_token.slice(0, 8),
      expires_in: payload.expires_in,
    }),
  );

  await browser.close();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
