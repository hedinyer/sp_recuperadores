import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SedeId } from "@/lib/ventasTipos";

export type SedeSpId = Exclude<SedeId, "railweb">;

export type SedeSpConfig = {
  id: SedeSpId;
  label: string;
  url: string;
  key: string;
};

/** Sedes SP (Supabase). Misma fuente que ventas. */
export const SEDES_SP: SedeSpConfig[] = [
  {
    id: "bga",
    label: "Bucaramanga (BGA)",
    url: "https://ngjpndqmkhhdqjjljfmp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY",
  },
  {
    id: "girardot",
    label: "Girardot",
    url: "https://iilgrapnrkwdcouielwz.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbGdyYXBucmt3ZGNvdWllbHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDEyODEsImV4cCI6MjA5NjUxNzI4MX0.82GJcFxinFQqxI8OSh40JdivYWK9hr1GRw6lyiqW_3E",
  },
  {
    id: "bogota",
    label: "Bogotá",
    url: "https://ziihqvtjacqzwmcmpiyp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppaWhxdnRqYWNxendtY21waXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODYyODEsImV4cCI6MjA5OTU2MjI4MX0.DpEws4CRAb3B6Y35TJ7o0afxpaFu56Jfsh-9IKeCQkc",
  },
];

export function getSedeSp(id: SedeSpId): SedeSpConfig {
  const sede = SEDES_SP.find((s) => s.id === id);
  if (!sede) throw new Error(`Sede SP desconocida: ${id}`);
  return sede;
}

export function clientSp(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function clientSedeSp(id: SedeSpId): SupabaseClient {
  const sede = getSedeSp(id);
  return clientSp(sede.url, sede.key);
}
