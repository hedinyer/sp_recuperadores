"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MorosoBandeja } from "@/lib/carteraMorososTypes";
import {
  CARTERA_STATUSES,
  nombrePerfilCartera,
  type CarteraPerfilId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { formatearCOP } from "@/lib/formatoDinero";
import { formatearConPuntos, limpiarNumero } from "@/lib/formatoDinero";
import { cn } from "@/lib/utils";

const ORDEN_RESULTADOS: CarteraStatus[] = [
  "abono",
  "contactado",
  "no_contesta",
  "compromiso",
  "visita",
  "en_ruta",
  "recuperada",
  "cerrado",
];

const ORDEN_SIMPLE: CarteraStatus[] = [
  "abono",
  "no_contesta",
  "compromiso",
  "contactado",
];

const ETIQUETAS_CORTAS: Partial<Record<CarteraStatus, string>> = {
  abono: "Pagó",
  contactado: "Contactado",
  no_contesta: "No contesta",
  compromiso: "Compromiso",
};

export function GestionSheet({
  open,
  onOpenChange,
  moto,
  perfilId,
  status,
  onStatusChange,
  notas,
  onNotasChange,
  monto,
  onMontoChange,
  guardando,
  onSave,
  modoSimple = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moto: MorosoBandeja | null;
  perfilId: CarteraPerfilId | null;
  status: CarteraStatus | "";
  onStatusChange: (s: CarteraStatus | "") => void;
  notas: string;
  onNotasChange: (v: string) => void;
  monto: string;
  onMontoChange: (v: string) => void;
  guardando: boolean;
  onSave: () => void;
  /** Solo 4 botones grandes: Pagó, No contesta, Compromiso, Contactado */
  modoSimple?: boolean;
}) {
  const montoInvalido =
    status === "abono" && open && !limpiarNumero(monto);
  const puedeGuardar =
    Boolean(status) &&
    (status !== "abono" || Boolean(limpiarNumero(monto))) &&
    !guardando;

  const orden = modoSimple ? ORDEN_SIMPLE : ORDEN_RESULTADOS;
  const statuses = orden
    .map((id) => CARTERA_STATUSES.find((s) => s.id === id))
    .filter(Boolean) as Array<{ id: CarteraStatus; label: string }>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{modoSimple ? "Anotar resultado" : "Registrar resultado"}</SheetTitle>
          <SheetDescription>
            {moto
              ? `${moto.placa} · ${moto.nombre}${
                  perfilId ? ` · ${nombrePerfilCartera(perfilId)}` : ""
                }`
              : "Elige qué pasó con esta moto"}
          </SheetDescription>
        </SheetHeader>

        {moto ? (
          <div className="flex flex-col gap-4 px-4 py-2">
            <p className="text-lg font-bold tabular-nums text-destructive">
              Debe {formatearCOP(moto.deuda_total)}
            </p>

            <div className="flex flex-col gap-2">
              <Label id="gestion-resultado-label">¿Qué pasó?</Label>
              <ToggleGroup
                type="single"
                value={status}
                onValueChange={(v) => {
                  const next = (v || "") as CarteraStatus | "";
                  onStatusChange(next);
                  if (next !== "abono") onMontoChange("");
                }}
                className={cn(
                  "grid w-full gap-2",
                  modoSimple ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2",
                )}
                aria-labelledby="gestion-resultado-label"
              >
                {statuses.map((s) => (
                  <ToggleGroupItem
                    key={s.id}
                    value={s.id}
                    className={cn(
                      "min-w-0 rounded-lg border border-border px-2 text-sm font-medium data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                      modoSimple ? "h-14 text-base" : "h-12",
                    )}
                  >
                    {ETIQUETAS_CORTAS[s.id] ?? s.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {status === "abono" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="gestion-monto">Valor del pago</Label>
                <Input
                  id="gestion-monto"
                  inputMode="numeric"
                  placeholder="150.000"
                  value={monto}
                  aria-invalid={montoInvalido || undefined}
                  aria-describedby={
                    montoInvalido ? "gestion-monto-error" : undefined
                  }
                  onChange={(e) =>
                    onMontoChange(formatearConPuntos(e.target.value))
                  }
                  className="h-12 text-lg font-semibold tabular-nums"
                />
                {montoInvalido ? (
                  <p
                    id="gestion-monto-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    Escribe cuánto pagó
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="gestion-notas">
                {modoSimple ? "Nota" : "Nota (opcional)"}
              </Label>
              <Textarea
                id="gestion-notas"
                rows={2}
                value={notas}
                onChange={(e) => onNotasChange(e.target.value)}
                placeholder="Qué quedó acordado…"
                className="text-base"
              />
              {modoSimple ? (
                <p className="text-xs text-muted-foreground">
                  La fecha se guarda sola al pulsar Guardar.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 rounded-lg text-base"
            disabled={!puedeGuardar}
            onClick={onSave}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
