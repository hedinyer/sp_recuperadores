/**
 * Calibración one-shot: muestra notas/compromisos de Jhon/James.
 * Ejecutar: npx tsx scripts/calibrar-gestiones-ia.ts (con .env.local cargado)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb
    .from("cartera_gestiones")
    .select("perfil_id, status, notas, created_at, placa")
    .in("perfil_id", ["jhon_saenz", "james_blanco"])
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;

  const conNota = (data ?? []).filter(
    (g) => g.notas && String(g.notas).trim().length > 2,
  );
  const compromisos = (data ?? []).filter((g) => g.status === "compromiso");

  console.log(
    JSON.stringify(
      {
        total: data?.length ?? 0,
        conNota: conNota.length,
        compromisos: compromisos.length,
        muestraNotas: conNota.slice(0, 25).map((g) => ({
          status: g.status,
          notas: String(g.notas).slice(0, 120),
          perfil: g.perfil_id,
        })),
        muestraCompromisos: compromisos.slice(0, 20).map((g) => ({
          notas: String(g.notas ?? "").slice(0, 120),
          perfil: g.perfil_id,
          created_at: g.created_at,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
