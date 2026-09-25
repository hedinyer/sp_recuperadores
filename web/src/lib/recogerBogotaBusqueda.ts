import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** Placa/nombre si hay letras. Tel/cédula solo si el query es numérico. */
export function coincideBusquedaRecoger(
  m: { placa: string; nombre: string; cedula: string; telefono: string },
  raw: string,
): boolean {
  const q = raw.trim().toUpperCase();
  if (!q) return true;
  const placaQ = normalizarPlaca(q);
  if (placaQ && normalizarPlaca(m.placa).includes(placaQ)) return true;
  if (m.nombre.toUpperCase().includes(q)) return true;
  const digitos = q.replace(/\D/g, "");
  // ponytail: "jqx32i" no debe matchear teléfonos por el "32"
  if (digitos.length < 4 || digitos !== q.replace(/[\s-]/g, "")) return false;
  return (
    m.cedula.replace(/\D/g, "").includes(digitos) ||
    m.telefono.replace(/\D/g, "").includes(digitos)
  );
}
