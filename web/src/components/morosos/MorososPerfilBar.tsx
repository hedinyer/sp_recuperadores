"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CARTERA_PERFILES,
  nombrePerfilCartera,
  type CarteraPerfilId,
} from "@/lib/carteraPerfiles";

export function MorososPerfilBar({
  perfilId,
  onChange,
}: {
  perfilId: CarteraPerfilId | null;
  onChange: (id: CarteraPerfilId) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Quién eres</p>
      <ToggleGroup
        type="single"
        value={perfilId ?? ""}
        onValueChange={(v) => {
          if (v) onChange(v as CarteraPerfilId);
        }}
        className="flex flex-wrap justify-start gap-2"
        aria-label="Perfil de trabajo"
      >
        {CARTERA_PERFILES.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            className="h-11 min-w-[5.5rem] rounded-lg border border-border px-3 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {p.nombre}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!perfilId ? (
        <Alert className="border-amber-500/40 bg-amber-950/40 py-2">
          <AlertDescription className="text-amber-100">
            Elige quién eres para poder escribir y registrar.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-xs text-muted-foreground" role="status">
          Trabajando como {nombrePerfilCartera(perfilId)}
        </p>
      )}
    </div>
  );
}
