import { formatearCOP } from "@/lib/formatoDinero";

function saludoSegunHora(fecha = new Date()): string {
  const h = fecha.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Texto de WhatsApp tipo call center: corto, en primera persona, sin tono de robot. */
export function mensajeCobranzaWhatsApp(
  nombre: string,
  placa: string,
  deuda: number,
): string {
  const primerNombre = nombre.trim().split(/\s+/)[0] || "cliente";
  const saldo = formatearCOP(deuda);
  return `${saludoSegunHora()} ${primerNombre}, le escribo del call center de Soluciones Pinila.

${placa.toUpperCase()}
Tiene un saldo de ${saldo}.

Le recuerdo que en el contrato solo puede estar atrasado 3 días, entonces necesito que se ponga al día. ¿Me confirma para cuándo puede pagar?`;
}

export function enlaceWhatsAppMoroso(
  telefono: string,
  placa: string,
  nombre: string,
  deuda: number,
): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  const texto = mensajeCobranzaWhatsApp(nombre, placa, deuda);
  return `https://wa.me/${conPais}?text=${encodeURIComponent(texto)}`;
}

export function enlaceTelMoroso(telefono: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${digits}`;
}

export function enlaceMapsMoroso(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
