"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatCarteraHermes } from "@/components/ChatCarteraHermes";
import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import { GestionSheet } from "@/components/morosos/GestionSheet";
import {
  HistorialSheet,
  type HistorialItem,
} from "@/components/morosos/HistorialSheet";
import { MorosoCard } from "@/components/morosos/MorosoCard";
import { MorososBandejas } from "@/components/morosos/MorososBandejas";
import { MorososKpis } from "@/components/morosos/MorososKpis";
import { MorososPerfilBar } from "@/components/morosos/MorososPerfilBar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  compararMorososBandeja,
  inicioDiaBogotaMs,
  type GestionCartera,
  type MorosoBandeja,
} from "@/lib/carteraMorososTypes";
import {
  CATEGORIAS_MOROSO,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import {
  CARTERA_PERFIL_STORAGE_KEY,
  esPerfilCarteraId,
  etiquetaCarteraStatus,
  type CarteraPerfilId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { formatearCOP, limpiarNumero } from "@/lib/formatoDinero";

function emptyCategorias(): Record<CategoriaMoroso, MorosoBandeja[]> {
  return {
    bajo_pago: [],
    sin_gps: [],
    mora_15: [],
    mora_4_15: [],
  };
}

function congelarBandejas(
  prev: Record<CategoriaMoroso, MorosoBandeja[]>,
  incoming: Record<CategoriaMoroso, MorosoBandeja[]>,
): Record<CategoriaMoroso, MorosoBandeja[]> {
  const previa = new Map<string, CategoriaMoroso>();
  for (const id of Object.keys(prev) as CategoriaMoroso[]) {
    for (const m of prev[id]) previa.set(m.placa, m.categoria || id);
  }
  if (previa.size === 0) return incoming;

  const next = emptyCategorias();
  for (const id of Object.keys(incoming) as CategoriaMoroso[]) {
    for (const m of incoming[id]) {
      const bandeja = previa.get(m.placa) ?? id;
      next[bandeja].push({ ...m, categoria: bandeja });
    }
  }
  return next;
}

export default function PlacasMorososPage() {
  const [perfilId, setPerfilId] = useState<CarteraPerfilId | null>(null);
  const [categoria, setCategoria] = useState<CategoriaMoroso>("bajo_pago");
  const [categorias, setCategorias] =
    useState<Record<CategoriaMoroso, MorosoBandeja[]>>(emptyCategorias);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [kpiTick, setKpiTick] = useState(0);
  const [busqueda, setBusqueda] = useState("");

  const [motoActiva, setMotoActiva] = useState<MorosoBandeja | null>(null);
  const [statusDraft, setStatusDraft] = useState<CarteraStatus | "">("");
  const [notasDraft, setNotasDraft] = useState("");
  const [montoDraft, setMontoDraft] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [historialPlaca, setHistorialPlaca] = useState<string | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setBusqueda(q);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CARTERA_PERFIL_STORAGE_KEY);
      if (saved && esPerfilCarteraId(saved)) setPerfilId(saved);
    } catch {
      // ignore
    }
  }, []);

  const elegirPerfil = useCallback((id: CarteraPerfilId) => {
    setPerfilId(id);
    try {
      sessionStorage.setItem(CARTERA_PERFIL_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const cargar = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const q = refresh ? "?refresh=1" : "";
      const res = await fetch(`/api/cartera/morosos${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar morosos");
      const incoming = data.categorias ?? emptyCategorias();
      setCategorias((prev) => congelarBandejas(prev, incoming));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const listaBase = categorias[categoria] ?? [];
  const lista = (() => {
    const q = busqueda.trim().toUpperCase();
    const filtrada = !q
      ? listaBase
      : listaBase.filter(
          (m) =>
            m.placa.includes(q) ||
            m.nombre.toUpperCase().includes(q) ||
            m.cedula.includes(q),
        );
    return [...filtrada].sort((a, b) =>
      compararMorososBandeja(a, b, perfilId),
    );
  })();

  const totalMotos =
    categorias.bajo_pago.length +
    categorias.sin_gps.length +
    categorias.mora_15.length +
    categorias.mora_4_15.length;

  const metaCategoria = CATEGORIAS_MOROSO.find((c) => c.id === categoria);

  const counts: Record<CategoriaMoroso, number> = {
    bajo_pago: categorias.bajo_pago.length,
    sin_gps: categorias.sin_gps.length,
    mora_15: categorias.mora_15.length,
    mora_4_15: categorias.mora_4_15.length,
  };

  const aplicarGestionLocal = useCallback(
    (
      placa: string,
      perfil: CarteraPerfilId,
      status: CarteraStatus,
      cat: CategoriaMoroso,
      data: { gestion?: GestionCartera; caso?: MorosoBandeja["caso"] },
      notas: string | null = null,
    ) => {
      const ahora = new Date().toISOString();
      const nueva: GestionCartera = data.gestion ?? {
        placa,
        perfil_id: perfil,
        status,
        notas,
        created_at: ahora,
      };
      setCategorias((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next) as CategoriaMoroso[]) {
          next[key] = next[key].map((m) =>
            m.placa === placa
              ? {
                  ...m,
                  caso: data.caso ?? {
                    placa,
                    perfil_id: perfil,
                    categoria: cat,
                    status,
                    notas,
                    updated_at: ahora,
                  },
                  gestiones: [nueva, ...(m.gestiones ?? [])].slice(0, 8),
                  n_gestiones:
                    (m.n_gestiones ?? m.gestiones?.length ?? 0) + 1,
                }
              : m,
          );
        }
        return next;
      });
      setKpiTick((n) => n + 1);
    },
    [],
  );

  const contactarWhatsApp = useCallback(
    async (moto: MorosoBandeja, url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
      if (!perfilId) {
        setError("Elige quién eres para que WhatsApp cuente en el recaudo");
        return;
      }
      const desde = inicioDiaBogotaMs();
      const yaContactadoHoy = (moto.gestiones ?? []).some((g) => {
        if (g.perfil_id !== perfilId || g.status !== "contactado") return false;
        const t = new Date(g.created_at).getTime();
        return !Number.isNaN(t) && t >= desde;
      });
      if (yaContactadoHoy) return;

      try {
        const res = await fetch("/api/cartera/gestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placa: moto.placa,
            perfil_id: perfilId,
            status: "contactado",
            notas: "WhatsApp",
            categoria: moto.categoria,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo registrar");
        aplicarGestionLocal(
          moto.placa,
          perfilId,
          "contactado",
          moto.categoria,
          data,
          "WhatsApp",
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "WhatsApp abierto, pero no se guardó",
        );
      }
    },
    [perfilId, aplicarGestionLocal],
  );

  const abrirGestion = useCallback(
    (moto: MorosoBandeja) => {
      if (!perfilId) {
        setError("Elige quién eres para registrar");
        return;
      }
      setMotoActiva(moto);
      setStatusDraft("");
      setNotasDraft("");
      setMontoDraft("");
    },
    [perfilId],
  );

  const guardarGestion = useCallback(async () => {
    if (!motoActiva || !perfilId || !statusDraft) return;
    const montoNum =
      statusDraft === "abono" ? Number(limpiarNumero(montoDraft)) : null;
    if (statusDraft === "abono" && (!montoNum || montoNum <= 0)) {
      setError("Escribe el valor del pago");
      return;
    }
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/cartera/gestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: motoActiva.placa,
          perfil_id: perfilId,
          status: statusDraft,
          notas: notasDraft,
          categoria: motoActiva.categoria,
          ...(montoNum ? { monto: montoNum } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");

      aplicarGestionLocal(
        motoActiva.placa,
        perfilId,
        statusDraft,
        motoActiva.categoria,
        data,
        notasDraft.trim() || null,
      );
      setMensaje(
        `Guardado · ${motoActiva.placa} · ${etiquetaCarteraStatus(statusDraft)}${
          montoNum ? ` · ${formatearCOP(montoNum)}` : ""
        }`,
      );
      setMotoActiva(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }, [
    motoActiva,
    perfilId,
    statusDraft,
    notasDraft,
    montoDraft,
    aplicarGestionLocal,
  ]);

  const abrirHistorial = useCallback(async (moto: MorosoBandeja) => {
    setHistorialPlaca(moto.placa);
    setHistorial([]);
    setHistorialError(null);
    setHistorialLoading(true);
    setHistorialOpen(true);
    try {
      const res = await fetch(
        `/api/cartera/gestion?placa=${encodeURIComponent(moto.placa)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar historial");
      setHistorial(data.items ?? []);
    } catch (e) {
      setHistorialError(
        e instanceof Error ? e.message : "Error al cargar historial",
      );
    } finally {
      setHistorialLoading(false);
    }
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MasterGate title="Morosos" subtitle="Escribe la clave para continuar">
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex w-full max-w-[414px] flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-tight text-balance">
                  Morosos
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  Elige bandeja → escribe → registra el resultado
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 rounded-lg"
                disabled={loading}
                onClick={() => void cargar(true)}
              >
                {loading ? "Cargando…" : "Actualizar lista"}
              </Button>
            </div>

            <MorososPerfilBar perfilId={perfilId} onChange={elegirPerfil} />
            <MorososKpis tick={kpiTick} />
            {!loading && totalMotos > 0 ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                {totalMotos} motos en total
              </p>
            ) : null}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[414px] flex-1 flex-col gap-3 px-3 pt-3 pb-28 sm:px-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {mensaje ? (
            <Alert className="border-success/40 bg-success/10">
              <AlertDescription className="text-success">
                {mensaje}
              </AlertDescription>
            </Alert>
          ) : null}

          <MorososBandejas
            categoria={categoria}
            onChange={setCategoria}
            counts={counts}
          />

          <p className="text-xs text-muted-foreground text-pretty">
            {metaCategoria?.descripcion}
          </p>

          <div>
            <label htmlFor="buscar-morosos" className="sr-only">
              Buscar por placa, nombre o cédula
            </label>
            <Input
              id="buscar-morosos"
              type="search"
              placeholder="Buscar placa, nombre o cédula"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11 rounded-lg"
            />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2.5" aria-busy="true">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                No hay motos aquí
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                Prueba otra bandeja o actualiza la lista.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg"
                  onClick={() => {
                    const ids = CATEGORIAS_MOROSO.map((c) => c.id);
                    const i = ids.indexOf(categoria);
                    setCategoria(ids[(i + 1) % ids.length]!);
                  }}
                >
                  Cambiar bandeja
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-lg"
                  onClick={() => void cargar(true)}
                >
                  Actualizar lista
                </Button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {lista.map((m) => (
                <li key={m.placa}>
                  <MorosoCard
                    moto={m}
                    perfilId={perfilId}
                    onWhatsApp={contactarWhatsApp}
                    onRegistrar={abrirGestion}
                    onHistorial={(moto) => void abrirHistorial(moto)}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>

        <GestionSheet
          open={Boolean(motoActiva)}
          onOpenChange={(open) => {
            if (!open) setMotoActiva(null);
          }}
          moto={motoActiva}
          perfilId={perfilId}
          status={statusDraft}
          onStatusChange={setStatusDraft}
          notas={notasDraft}
          onNotasChange={setNotasDraft}
          monto={montoDraft}
          onMontoChange={setMontoDraft}
          guardando={guardando}
          onSave={() => void guardarGestion()}
        />

        <HistorialSheet
          open={historialOpen}
          onOpenChange={setHistorialOpen}
          placa={historialPlaca}
          items={historial}
          loading={historialLoading}
          error={historialError}
        />

        <ChatCarteraHermes
          perfilId={perfilId}
          onAfterReply={() => {
            setKpiTick((n) => n + 1);
            void cargar(false);
          }}
        />
      </MasterGate>
      <NavFooter />
    </div>
  );
}
