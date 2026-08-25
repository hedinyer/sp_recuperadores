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
}) {
  const puedeGuardar =
    Boolean(status) &&
    (status !== "abono" || Boolean(limpiarNumero(monto))) &&
    !guardando;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Registrar resultado</SheetTitle>
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
            <p className="text-xs text-muted-foreground">
              Debe aprox. {formatearCOP(moto.deuda_total)}
            </p>

            <div className="flex flex-col gap-2">
              <Label>¿Qué pasó?</Label>
              <ToggleGroup
                type="single"
                value={status}
                onValueChange={(v) => {
                  const next = (v || "") as CarteraStatus | "";
                  onStatusChange(next);
                  if (next !== "abono") onMontoChange("");
                }}
                className="grid w-full grid-cols-2 gap-2"
              >
                {CARTERA_STATUSES.filter((s) => s.id !== "pendiente").map(
                  (s) => (
                    <ToggleGroupItem
                      key={s.id}
                      value={s.id}
                      className="h-11 min-w-0 rounded-lg border border-border px-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {s.id === "abono" ? "Pagó / abonó" : s.label}
                    </ToggleGroupItem>
                  ),
                )}
              </ToggleGroup>
            </div>

            {status === "abono" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="gestion-monto">Valor del pago</Label>
                <Input
                  id="gestion-monto"
                  inputMode="numeric"
                  placeholder="Ej. 150000"
                  value={monto}
                  onChange={(e) =>
                    onMontoChange(formatearConPuntos(e.target.value))
                  }
                  className="h-12 text-lg font-semibold tabular-nums"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="gestion-notas">Nota (opcional)</Label>
              <Textarea
                id="gestion-notas"
                rows={3}
                value={notas}
                onChange={(e) => onNotasChange(e.target.value)}
                placeholder="Qué quedó acordado…"
              />
            </div>
          </div>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-lg active:scale-[0.96]"
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
