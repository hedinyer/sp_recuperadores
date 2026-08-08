const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

function loadUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  for (const p of [path.join("..", ".env"), ".env.local"]) {
    try {
      const t = fs.readFileSync(p, "utf8");
      const m = t.match(/^DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim();
    } catch {
      /* skip */
    }
  }
  const t = fs.readFileSync(path.join("src", "lib", "dbDefaults.ts"), "utf8");
  const m = t.match(/postgresql:\/\/[^"']+/);
  if (!m) throw new Error("No DATABASE_URL");
  return m[0];
}

async function main() {
  const pool = new Pool({
    connectionString: loadUrl(),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await pool.query("create extension if not exists pgcrypto");
    await pool.query(`
      create table if not exists public.calendario_marisol_eventos (
        id uuid primary key default gen_random_uuid(),
        uid text not null unique,
        summary text not null,
        description text not null default '',
        dtstart timestamptz not null,
        dtend timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        skylight_event_id text
      )
    `);
    await pool.query(`
      alter table public.calendario_marisol_eventos
        add column if not exists skylight_event_id text
    `);
    const r = await pool.query(
      "select count(*)::int as n from public.calendario_marisol_eventos",
    );
    console.log("ok rows=" + r.rows[0].n);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
