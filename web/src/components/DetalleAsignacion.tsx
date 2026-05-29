import { formatFechaHora } from "@/lib/fechas";

type Props = {
  placa: string;
  tipoPago?: string | null;
  presencial?: boolean | null;
  fechaAsignada?: string | null;
  foto?: string | null;
};

export function DetalleAsignacion({
  placa,
  tipoPago,
  presencial,
  fechaAsignada,
  foto,
}: Props) {
  const tieneMeta = tipoPago || fechaAsignada;

  if (!tieneMeta && !foto) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {tieneMeta && (
        <div className="flex flex-col gap-0.5 text-xs text-zinc-400">
          {tipoPago ? (
            <span>
              Pago:{" "}
              <span className="text-zinc-200 font-medium">{tipoPago}</span>
              {presencial != null ? (
                <span className="text-zinc-500">
                  {" "}
                  · {presencial ? "Presencial" : "Remoto"}
                </span>
              ) : null}
            </span>
          ) : null}
          {fechaAsignada ? (
            <span>
              Asignada:{" "}
              <span className="text-zinc-200 tabular-nums">
                {formatFechaHora(fechaAsignada)}
              </span>
            </span>
          ) : null}
        </div>
      )}
      {foto ? (
        <a
          href={foto}
          target="_blank"
          rel="noopener noreferrer"
          className="block touch-manipulation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto}
            alt={`Comprobante de pago placa ${placa}`}
            className="w-full rounded-xl border border-zinc-700 object-cover max-h-44"
            loading="lazy"
          />
        </a>
      ) : null}
    </div>
  );
}
