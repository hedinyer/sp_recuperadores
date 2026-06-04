import { DATABASE_URL_DEFAULT } from "@/lib/dbDefaults";

/** URLs PostgreSQL configuradas (solo lectura desde la web). */
export function getDatabaseUrls(): string[] {
  return [
    process.env.DATABASE_URL?.trim() || DATABASE_URL_DEFAULT,
    process.env.DATABASE_URL_2?.trim(),
  ].filter(Boolean) as string[];
}
