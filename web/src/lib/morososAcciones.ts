import { formatearCOP } from "@/lib/formatoDinero";

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
  const primerNombre = nombre.trim().split(/\s+/)[0] || "cliente";
  const texto = `Estimado ${primerNombre},

Le escribimos del Área de Cartera respecto a su crédito de motocicleta placa ${placa}.

Actualmente registra un saldo pendiente de ${formatearCOP(deuda)}. Le invitamos a regularizar su obligación a la brevedad posible para evitar recargos por mora y mantener su crédito al día.

Puede realizar su pago por Nequi, Davivienda, Bancolombia o en efectivo, y enviarnos el comprobante por este medio.

Quedamos atentos para confirmar su pago y brindarle el soporte que necesite.

Cordialmente,
Área de Cartera`;
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
