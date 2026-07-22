/**
 * Smoke CRUD — node scripts/smoke-calendario.js
 * Usa DATABASE_URL (o default Railway).
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

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
  return t.match(/postgresql:\/\/[^"']+/)[0];
}

async function main() {
  const pool = new Pool({ connectionString: loadUrl() });
  const uid = `${randomUUID()}@smoke`;
  try {
    const ins = await pool.query(
      `insert into public.calendario_marisol_eventos
         (uid, summary, description, dtstart, dtend)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz)
       returning id`,
      [uid, "Smoke", "", new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()],
    );
    const id = ins.rows[0].id;
    const list = await pool.query(
      `select id from public.calendario_marisol_eventos where id = $1`,
      [id],
    );
    if (list.rows.length !== 1) throw new Error("list miss");
    await pool.query(`delete from public.calendario_marisol_eventos where id = $1`, [id]);
    console.log("smoke ok");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
