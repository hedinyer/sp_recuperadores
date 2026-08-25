"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  etiquetaBucket,
  etiquetaSugerencia,
  type ClienteEfect,
  type MetodoStats,
  type ResumenEfect,
} from "@/lib/carteraEfectividadLabels";
import { formatearCOP } from "@/lib/formatoDinero";

type Payload = {
  clientes: ClienteEfect[];
  metodos: MetodoStats[];
  resumen: ResumenEfect;
  generado_en: string;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function EfectividadInner() {
  const searchParams = useSearchParams();
  const placaFiltro = (searchParams.get("placa") ?? "").trim().toUpperCase();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = placaFiltro
        ? `?placa=${encodeURIComponent(placaFiltro)}`
        : "";
      const res = await fetch(`/api/cartera/efectividad${qs}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar");
      setData(json as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [placaFiltro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MasterGate title="Efectividad" subtitle="Escribe la clave para continuar">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="mx-auto flex w-full max-w-[414px] items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">Efectividad</h1>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                {placaFiltro
                  ? `Filtrado: ${placaFiltro}`
                  : "Días y gestiones hasta el pago · qué método rinde más"}
              </p>
              {placaFiltro ? (
                <Link
                  href="/efectividad"
                  className="mt-1 inline-block text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                >
                  Ver todas
                </Link>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-lg"
              disabled={loading}
              onClick={() => void cargar()}
            >
              {loading ? "Cargando…" : "Actualizar"}
            </Button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[414px] flex-1 flex-col gap-3 px-3 pt-3 pb-28 sm:px-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading && !data ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : null}

          {data ? (
            <>
              <Card className="gap-2 py-4">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-base">Resumen (60 días)</CardTitle>
                  <CardDescription>
                    Maximizar dinero · minimizar gestiones por cliente
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 px-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Recuperado</p>
                    <p className="text-lg font-semibold tabular-nums text-success">
                      {formatearCOP(data.resumen.recaudado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">COP / esfuerzo</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatearCOP(Math.round(data.resumen.recompensa_media))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mediana días</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {data.resumen.dias_mediana != null
                        ? `${data.resumen.dias_mediana.toFixed(1)} d`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mediana gestiones</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {data.resumen.gestiones_mediana != null
                        ? data.resumen.gestiones_mediana.toFixed(1)
                        : "—"}
                    </p>
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground tabular-nums">
                    {data.resumen.episodios_cerrados} cerrados ·{" "}
                    {data.resumen.episodios_abiertos} abiertos
                  </p>
                </CardContent>
              </Card>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">Métodos que convierten</h2>
                {data.metodos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no hay episodios cerrados para rankear.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.metodos.map((m, i) => (
                      <li key={m.status}>
                        <Card className="gap-0 py-3">
                          <CardContent className="flex flex-col gap-1.5 px-3.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                {i + 1}. {m.label}
                              </p>
                              <Badge variant="secondary">
                                {pct(m.tasa)} conv.
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {m.conversiones}/{m.usos_last_touch} · medio{" "}
                              {formatearCOP(Math.round(m.monto_medio))}
                              {m.dias_medio != null
                                ? ` · ${m.dias_medio.toFixed(1)} d`
                                : ""}
                            </p>
                            <p className="text-xs font-medium tabular-nums text-success">
                              {formatearCOP(Math.round(m.recompensa_media))} / esfuerzo
                            </p>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">Por cliente</h2>
                {data.clientes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay gestiones en los últimos 60 días.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.clientes.map((c) => {
                      const ep = c.episodio;
                      return (
                        <li key={c.placa}>
                          <Card className="gap-0 py-3">
                            <CardContent className="flex flex-col gap-2 px-3.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-base font-bold tracking-widest">
                                    {c.placa}
                                  </p>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {c.nombre || "—"}
                                  </p>
                                </div>
                                <Badge
                                  variant={ep.cerrado ? "secondary" : "outline"}
                                >
                                  {etiquetaBucket(ep.bucket)}
                                </Badge>
                              </div>
                              <p className="text-sm tabular-nums">
                                {ep.n_gestiones} gestiones
                                {ep.dias_hasta_pago != null
                                  ? ` · ${ep.dias_hasta_pago} d`
                                  : ""}
                                {ep.monto_recuperado > 0
                                  ? ` · ${formatearCOP(ep.monto_recuperado)}`
                                  : ""}
                              </p>
                              {ep.last_touch ? (
                                <p className="text-xs text-muted-foreground">
                                  Último método: {etiquetaSugerencia(ep.last_touch)}
                                </p>
                              ) : null}
                              {!ep.cerrado && ep.sugerencia ? (
                                <p className="text-sm font-medium text-foreground">
                                  Siguiente: {etiquetaSugerencia(ep.sugerencia)}
                                </p>
                              ) : null}
                              <Button
                                asChild
                                variant="link"
                                className="h-auto justify-start px-0 text-sm"
                              >
                                <Link href={`/placas?q=${encodeURIComponent(c.placa)}`}>
                                  Ver en Morosos
                                </Link>
                              </Button>
                            </CardContent>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </main>
      </MasterGate>
      <NavFooter />
    </div>
  );
}

export default function EfectividadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-col bg-background p-4">
          <Skeleton className="mx-auto h-24 w-full max-w-[414px] rounded-xl" />
        </div>
      }
    >
      <EfectividadInner />
    </Suspense>
  );
}
