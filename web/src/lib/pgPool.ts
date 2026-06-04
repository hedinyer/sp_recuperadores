import { Pool, type QueryResultRow } from "pg";

const globalPools = globalThis as typeof globalThis & {
  __spPgPools?: Map<string, Pool>;
};

function pools(): Map<string, Pool> {
  if (!globalPools.__spPgPools) {
    globalPools.__spPgPools = new Map();
  }
  return globalPools.__spPgPools;
}

/** Pool reutilizado por URL (evita conectar/cerrar en cada request). */
export function getPgPool(connectionString: string): Pool {
  const key = connectionString;
  let pool = pools().get(key);
  if (!pool) {
    pool = new Pool({
      connectionString: key,
      max: 4,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    });
    pools().set(key, pool);
  }
  return pool;
}

export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  connectionString: string,
  text: string,
  values?: unknown[],
): Promise<T[]> {
  const pool = getPgPool(connectionString);
  const { rows } = await pool.query<T>(text, values);
  return rows;
}
