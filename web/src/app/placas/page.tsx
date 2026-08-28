"use client";

import { ChatCarteraHermes } from "@/components/ChatCarteraHermes";
import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import { MorososWorkspace } from "@/components/morosos/MorososWorkspace";

export default function PlacasMorososPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MasterGate title="Morosos" subtitle="Escribe la clave para continuar">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <MorososWorkspace />
        </div>
      </MasterGate>
      <NavFooter />
    </div>
  );
}
