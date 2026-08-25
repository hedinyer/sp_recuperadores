"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { etiquetaCarteraStatus, nombrePerfilCartera } from "@/lib/carteraPerfiles";
import { formatFechaHora } from "@/lib/fechas";
import { formatearCOP } from "@/lib/formatoDinero";
import { montoDesdeGestion } from "@/lib/carteraKpis";

export type HistorialItem = {
  id: number;
  placa: string;
  perfil_id: string;
  status: string;
  categoria: string | null;
  notas: string | null;
  created_at: string;
  monto?: number | null;
};

function etiquetaEstadoConMonto(g: HistorialItem): string {
  const base = etiquetaCarteraStatus(g.status);
  const monto = montoDesdeGestion(g);
  return monto > 0 ? `${base} · ${formatearCOP(monto)}` : base;
}

export function HistorialSheet({
  open,
  onOpenChange,
  placa,
  items,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placa: string | null;
  items: HistorialItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Historial</SheetTitle>
          <SheetDescription className="tracking-widest">
            {placa ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : error ? (
            <p role="alert" className="py-4 text-sm text-destructive">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay gestiones registradas.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((g, i) => (
                <li key={g.id}>
                  {i > 0 ? <Separator /> : null}
                  <div className="py-3">
                    <p className="text-sm font-medium text-foreground">
                      {etiquetaEstadoConMonto(g)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {nombrePerfilCartera(g.perfil_id)} ·{" "}
                      {formatFechaHora(g.created_at)}
                    </p>
                    {g.notas && !/^pago:\d+/i.test(g.notas.trim()) ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.notas}
                      </p>
                    ) : g.notas && /pago:\d+\s+(.+)/i.test(g.notas) ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.notas.replace(/^pago:\d+\s*/i, "")}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
