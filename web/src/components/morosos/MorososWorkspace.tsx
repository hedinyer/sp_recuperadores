"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatCarteraHermes } from "@/components/ChatCarteraHermes";
import { GestionSheet } from "@/components/morosos/GestionSheet";
import {
  HistorialSheet,
  type HistorialItem,
} from "@/components/morosos/HistorialSheet";
import { MapaMorosos, type PuntoMorosoMapa } from "@/components/morosos/MapaMorosos";
import { MorosoCard } from "@/components/morosos/MorosoCard";
import { MorosoFila } from "@/components/morosos/MorosoFila";
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
import {
  enlaceTelMoroso,
  enlaceWhatsAppMoroso,
} from "@/lib/morososAcciones";
import { cn } from "@/lib/utils";

const POLL_GPS_MS = 30_000;

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

function aplicarPosicionesGps(
  lista: MorosoBandeja[],
  posiciones: Array<{
    placa: string;
    lat: number | null;
    lng: number | null;
    online: boolean;
    gps: MorosoBandeja["gps"];
  }>,
): MorosoBandeja[] {
  const porPlaca = new Map(posiciones.map((p) => [p.placa, p]));
  return lista.map((m) => {
    const hit = porPlaca.get(m.placa);
    if (!hit) return m;
    return {
      ...m,
      lat: hit.lat,
      lng: hit.lng,
      gps: hit.gps,
    };
  });
}

export function MorososWorkspace() {
  const [perfilId, setPerfilId] = useState<CarteraPerfilId | null>(null);
  const [categoria, setCategoria] = useState<CategoriaMoroso>("bajo_pago");
  const [categorias, setCategorias] =
    useState<Record<CategoriaMoroso, MorosoBandeja[]>>(emptyCategorias);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [kpiTick, setKpiTick] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [mapaFullscreen, setMapaFullscreen] = useState(false);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [listaOverlay, setListaOverlay] = useState(true);

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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [esDesktop, setEsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setEsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
  const lista = useMemo(() => {
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
  }, [listaBase, busqueda, perfilId]);

  const puntosMapa: PuntoMorosoMapa[] = useMemo(
    () =>
      lista
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({
          placa: m.placa,
          lat: m.lat!,
          lng: m.lng!,
          deuda_total: m.deuda_total,
          dias_mora: m.dias_mora,
          online: m.gps.funcional,
        })),
    [lista],
  );

  const pollGps = useCallback(async () => {
    if (!lista.length) return;
    try {
      const res = await fetch("/api/cartera/morosos/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placas: lista.map((m) => m.placa) }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const posiciones = data.posiciones ?? [];
      setCategorias((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next) as CategoriaMoroso[]) {
          next[key] = aplicarPosicionesGps(next[key], posiciones);
        }
        return next;
      });
    } catch {
      // silencioso en poll
    }
  }, [lista]);

  const pollGpsActivo = Boolean(lista.length);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!pollGpsActivo || !lista.length) return;

    void pollGps();
    pollRef.current = setInterval(() => void pollGps(), POLL_GPS_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollGpsActivo, lista.length, pollGps, categoria, busqueda]);

  const totalMotos =
    categorias.bajo_pago.length +
    categorias.sin_gps.length +
    categorias.mora_15.length +
    categorias.mora_4_15.length;

  const deudaLista = lista.reduce((s, m) => s + m.deuda_total, 0);

  const metaCategoria = CATEGORIAS_MOROSO.find((c) => c.id === categoria);

  const counts: Record<CategoriaMoroso, number> = {
    bajo_pago: categorias.bajo_pago.length,
    sin_gps: categorias.sin_gps.length,
    mora_15: categorias.mora_15.length,
    mora_4_15: categorias.mora_4_15.length,
  };

  const motoSeleccionada = seleccionada
    ? lista.find((m) => m.placa === seleccionada) ?? null
    : null;

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

  const seleccionarPlaca = useCallback((placa: string) => {
    setSeleccionada((prev) => (prev === placa ? null : placa));
  }, []);

  const renderListaVacia = () => (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">No hay motos aquí</p>
      <p className="text-sm text-pretty text-muted-foreground">
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
  );

  const renderListaFilas = (compact = false) => (
    <ul className="flex flex-col gap-2" role="list">
      {lista.map((m) => (
        <li key={m.placa}>
          {compact ? (
            <MorosoFila
              moto={m}
              perfilId={perfilId}
              seleccionada={seleccionada === m.placa}
              onSeleccionar={(mot) => seleccionarPlaca(mot.placa)}
              onWhatsApp={contactarWhatsApp}
              onRegistrar={abrirGestion}
              compactActions
            />
          ) : (
            <MorosoCard
              moto={m}
              perfilId={perfilId}
              onWhatsApp={contactarWhatsApp}
              onRegistrar={abrirGestion}
              onHistorial={(moto) => void abrirHistorial(moto)}
            />
          )}
        </li>
      ))}
    </ul>
  );

  const renderContenidoLista = (compact = false) => {
    if (loading) {
      return (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      );
    }
    if (lista.length === 0) return renderListaVacia();
    return renderListaFilas(compact);
  };

  const panelLista = (
    <div
      id="morosos-panel-lista"
      role="tabpanel"
      aria-label={`Lista ${metaCategoria?.label ?? "morosos"}`}
      className="flex flex-col gap-2 p-2"
    >
      {renderContenidoLista(false)}
    </div>
  );

  const panelListaCompacta = (
    <div className="flex flex-col gap-2 p-2">
      {renderContenidoLista(true)}
    </div>
  );

  const mapaPanel = (
    <MapaMorosos
      motos={puntosMapa}
      seleccionada={seleccionada}
      onSeleccionar={seleccionarPlaca}
      embebido={esDesktop && !mapaFullscreen}
      fullscreen={mapaFullscreen}
      onToggleFullscreen={() => {
        setMapaFullscreen((v) => !v);
        if (!mapaFullscreen) setListaOverlay(true);
      }}
      className={cn(
        mapaFullscreen && listaOverlay && "lg:pr-[min(420px,38%)]",
      )}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-[414px] flex-col gap-3 lg:max-w-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-balance">
                Morosos
              </h1>
              <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                1. Elige tu nombre · 2. Bandeja · 3. Cobra
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-lg"
              disabled={loading}
              onClick={() => void cargar(true)}
            >
              {loading ? "Cargando…" : "Actualizar"}
            </Button>
          </div>

          <MorososPerfilBar perfilId={perfilId} onChange={elegirPerfil} />
          <MorososKpis tick={kpiTick} />
          {!loading && lista.length > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {lista.length} en esta bandeja · debe {formatearCOP(deudaLista)}
              {puntosMapa.length > 0 ? ` · ${puntosMapa.length} con GPS` : ""}
            </p>
          ) : !loading && totalMotos > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {totalMotos} motos en total · {puntosMapa.length} con GPS
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[414px] flex-1 flex-col overflow-hidden px-3 pt-3 lg:max-w-none lg:px-6">
        {error ? (
          <Alert variant="destructive" className="mb-3 shrink-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {mensaje ? (
          <Alert className="mb-3 shrink-0 border-success/40 bg-success/10">
            <AlertDescription className="text-success">
              {mensaje}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="shrink-0 space-y-3">
          <MorososBandejas
            categoria={categoria}
            onChange={setCategoria}
            counts={counts}
            panelId="morosos-panel-lista"
          />

          <p className="text-xs text-pretty text-muted-foreground">
            {metaCategoria?.descripcion}
          </p>

          <div>
            <label htmlFor="buscar-morosos" className="sr-only">
              Buscar por placa o nombre
            </label>
            <Input
              id="buscar-morosos"
              type="search"
              placeholder="Placa o nombre"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11 rounded-lg text-base"
            />
          </div>
        </div>

        {motoSeleccionada ? (
          <p className="sr-only" role="status" aria-live="polite">
            {motoSeleccionada.placa} seleccionada, debe{" "}
            {formatearCOP(motoSeleccionada.deuda_total)}
          </p>
        ) : null}

        {esDesktop ? (
          <div className="mt-3 flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
              <div className="relative min-h-0 min-w-0 flex-1">
                {mapaPanel}
              </div>
              {!mapaFullscreen ? (
              <aside
                className="flex w-[min(420px,38%)] shrink-0 flex-col overflow-hidden border-l border-border bg-card/50"
                aria-label="Lista de morosos"
              >
                <div className="shrink-0 border-b border-border px-3 py-2.5">
                  <p className="text-sm font-semibold">
                    {lista.length} cliente{lista.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-lg font-bold tabular-nums text-destructive">
                    {formatearCOP(deudaLista)}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {panelListaCompacta}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
        ) : null}

        {/* Fullscreen overlay list */}
        {mapaFullscreen && listaOverlay ? (
          <aside
            className="fixed right-0 top-14 z-[60] flex h-[calc(100dvh-3.5rem)] w-[min(420px,92vw)] flex-col overflow-hidden border-l border-border bg-card/95 shadow-xl backdrop-blur-md"
            aria-label="Lista de morosos en mapa"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">
                  {lista.length} cliente{lista.length === 1 ? "" : "s"}
                </p>
                <p className="text-lg font-bold tabular-nums text-destructive">
                  {formatearCOP(deudaLista)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => setListaOverlay(false)}
              >
                Ocultar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {panelListaCompacta}
            </div>
          </aside>
        ) : null}
        {mapaFullscreen && !listaOverlay ? (
          <Button
            type="button"
            className="fixed right-4 top-16 z-[60] h-11 shadow-lg"
            onClick={() => setListaOverlay(true)}
          >
            Ver lista ({lista.length})
          </Button>
        ) : null}

        {/* Mobile: mapa arriba + lista */}
        {!esDesktop ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            <MapaMorosos
              motos={puntosMapa}
              seleccionada={seleccionada}
              onSeleccionar={seleccionarPlaca}
              fullscreen={mapaFullscreen}
              onToggleFullscreen={() => {
                setMapaFullscreen((v) => {
                  if (!v) setListaOverlay(true);
                  return !v;
                });
              }}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
              {panelLista}
            </div>
          </div>
        ) : null}

        {/* Barra rápida móvil al seleccionar (lista o mapa) */}
        {motoSeleccionada && !esDesktop ? (
          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[414px] px-3 lg:hidden">
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
              <p className="text-center text-sm font-bold tabular-nums">
                {motoSeleccionada.placa} ·{" "}
                <span className="text-destructive">
                  {formatearCOP(motoSeleccionada.deuda_total)}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {enlaceWhatsAppMoroso(
                  motoSeleccionada.telefono,
                  motoSeleccionada.placa,
                  motoSeleccionada.nombre,
                  motoSeleccionada.deuda_total,
                ) ? (
                  <Button
                    type="button"
                    className="h-11 bg-[#25D366] text-white hover:bg-[#1ebe57]"
                    disabled={!perfilId}
                    onClick={() => {
                      const url = enlaceWhatsAppMoroso(
                        motoSeleccionada.telefono,
                        motoSeleccionada.placa,
                        motoSeleccionada.nombre,
                        motoSeleccionada.deuda_total,
                      );
                      if (url) void contactarWhatsApp(motoSeleccionada, url);
                    }}
                  >
                    WhatsApp
                  </Button>
                ) : null}
                {enlaceTelMoroso(motoSeleccionada.telefono) ? (
                  <Button variant="outline" className="h-11" asChild>
                    <a href={enlaceTelMoroso(motoSeleccionada.telefono)!}>
                      Llamar
                    </a>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11"
                  disabled={!perfilId}
                  onClick={() => abrirGestion(motoSeleccionada)}
                >
                  Registrar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

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
    </div>
  );
}
