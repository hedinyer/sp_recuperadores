import { FotoComprobante } from "@/components/FotoComprobante";
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
        <FotoComprobante placa={placa} fotoRemota={foto} />
      ) : null}
    </div>
  );
}
