/**
 * Forecast diario de unidades (MSTL-lite + ETS amortiguado).
 * ponytail: sin festivos CO ni Stan/Prophet; upgrade a StatsForecast/Prophet
 * en worker Python si hace falta precisión de calendario colombiano.
 */

export type SerieDiariaPunto = {
  fecha: string;
  unidades: number;
  estimado_cop: number;
  contado_n: number;
  credito_n: number;
};

export type ForecastPunto = {
  fecha: string;
  yhat: number;
  lo: number;
  hi: number;
};

export type HorizonOutlook = {
  dias: 7 | 15 | 30;
  unidades: number;
  lo: number;
  hi: number;
};

export type ForecastResult = {
  metodo: string;
  entrenado_hasta: string;
  n_obs: number;
  /** residuales usados para banda ~80% */
  sigma: number;
  estacional_semanal: number[]; // index 0 = domingo JS getDay()
  desestacionalizado: Array<{ fecha: string; y: number; deseas: number }>;
  forecast_diario: ForecastPunto[];
  horizontes: HorizonOutlook[];
};

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00-05:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function weekdayBogota(ymd: string): number {
  // 0=dom … 6=sáb (mismo que Date.getUTCDay en mediodía -05)
  return new Date(`${ymd}T12:00:00-05:00`).getUTCDay();
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Rellena huecos diarios con 0 entre min y max fecha. */
export function completarSerieDiaria(
  puntos: SerieDiariaPunto[],
): SerieDiariaPunto[] {
  if (puntos.length === 0) return [];
  const sorted = [...puntos].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
  );
  const map = new Map(sorted.map((p) => [p.fecha, p]));
  const out: SerieDiariaPunto[] = [];
  let cur = sorted[0].fecha;
  const end = sorted[sorted.length - 1].fecha;
  for (let i = 0; i < 4000 && cur <= end; i++) {
    out.push(
      map.get(cur) ?? {
        fecha: cur,
        unidades: 0,
        estimado_cop: 0,
        contado_n: 0,
        credito_n: 0,
      },
    );
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function seasonalMeans(y: number[], fechas: string[], period: number): number[] {
  const buckets: number[][] = Array.from({ length: period }, () => []);
  for (let i = 0; i < y.length; i++) {
    const idx = period === 7 ? weekdayBogota(fechas[i]) : i % period;
    buckets[idx].push(y[i]);
  }
  const overall = mean(y);
  return buckets.map((b) => (b.length ? mean(b) : overall) - overall);
}

function dampenedLevelTrend(
  deseas: number[],
  horizon: number,
): { level: number; trend: number; forecast: number[] } {
  // ETS amortiguado simple sobre la serie desestacionalizada
  const alpha = 0.35;
  const beta = 0.15;
  const phi = 0.9;
  let level = deseas[0] ?? 0;
  let trend = deseas.length > 1 ? deseas[1] - deseas[0] : 0;
  for (let i = 1; i < deseas.length; i++) {
    const prev = level;
    level = alpha * deseas[i] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prev) + (1 - beta) * phi * trend;
  }
  const forecast: number[] = [];
  let cum = 0;
  for (let h = 1; h <= horizon; h++) {
    cum += Math.pow(phi, h) * trend;
    forecast.push(Math.max(0, level + cum));
  }
  return { level, trend, forecast };
}

/**
 * Pronostica unidades diarias.
 * Serie corta (<28 obs): media de últimas 4 semanas + patrón semanal.
 * Serie larga: MSTL-lite (7 y opcional 365) + ETS amortiguado.
 */
export function forecastUnidades(
  serie: SerieDiariaPunto[],
  horizon = 30,
): ForecastResult {
  const full = completarSerieDiaria(serie);
  const fechas = full.map((p) => p.fecha);
  const y = full.map((p) => p.unidades);
  const n = y.length;
  const entrenado_hasta = fechas[n - 1] ?? "";

  if (n < 7) {
    const m = mean(y.length ? y : [0]);
    const forecast_diario: ForecastPunto[] = [];
    for (let h = 1; h <= horizon; h++) {
      const fecha = addDaysYmd(entrenado_hasta || "2020-01-01", h);
      forecast_diario.push({
        fecha,
        yhat: Math.max(0, m),
        lo: 0,
        hi: Math.max(0, m * 2),
      });
    }
    return {
      metodo: "media (pocos datos)",
      entrenado_hasta,
      n_obs: n,
      sigma: std(y),
      estacional_semanal: Array(7).fill(0),
      desestacionalizado: fechas.map((f, i) => ({
        fecha: f,
        y: y[i],
        deseas: y[i],
      })),
      forecast_diario,
      horizontes: buildHorizontes(forecast_diario),
    };
  }

  const sea7 = seasonalMeans(y, fechas, 7);
  let deseas = y.map((v, i) => v - sea7[weekdayBogota(fechas[i])]);

  let metodo = "MSTL semanal + ETS amortiguado";
  if (n >= 730) {
    const sea365 = seasonalMeans(deseas, fechas, 365);
    deseas = deseas.map((v, i) => {
      const idx =
        Math.floor(
          (new Date(`${fechas[i]}T12:00:00-05:00`).getTime() -
            new Date(`${fechas[0]}T12:00:00-05:00`).getTime()) /
            86_400_000,
        ) % 365;
      return v - sea365[((idx % 365) + 365) % 365];
    });
    metodo = "MSTL semanal+anual + ETS amortiguado";
  } else if (n < 28) {
    metodo = "estacionalidad semanal + media 4 semanas";
  }

  const { forecast: deseasF } = dampenedLevelTrend(deseas, horizon);

  // residuales in-sample para banda ~80% (≈1.28σ)
  const fitted = deseas.map((_, i) => {
    // nivel local naïve: media móvil 7
    const a = Math.max(0, i - 6);
    return mean(deseas.slice(a, i + 1));
  });
  const resid = deseas.map((v, i) => v - fitted[i]);
  const sigma = Math.max(std(resid), 0.3);

  const desestacionalizado = fechas.map((f, i) => ({
    fecha: f,
    y: y[i],
    deseas: Math.max(0, deseas[i]),
  }));

  const forecast_diario: ForecastPunto[] = [];
  for (let h = 1; h <= horizon; h++) {
    const fecha = addDaysYmd(entrenado_hasta, h);
    const seas = sea7[weekdayBogota(fecha)];
    const yhat = Math.max(0, deseasF[h - 1] + seas);
    const band = 1.28 * sigma * Math.sqrt(h);
    forecast_diario.push({
      fecha,
      yhat,
      lo: Math.max(0, yhat - band),
      hi: yhat + band,
    });
  }

  // serie corta: suaviza hacia media de últimas 28 obs
  if (n < 28) {
    const recent = mean(y.slice(-Math.min(28, n)));
    for (const p of forecast_diario) {
      const seas = sea7[weekdayBogota(p.fecha)];
      p.yhat = Math.max(0, recent + seas);
      p.lo = Math.max(0, p.yhat - 1.28 * sigma);
      p.hi = p.yhat + 1.28 * sigma;
    }
  }

  return {
    metodo,
    entrenado_hasta,
    n_obs: n,
    sigma,
    estacional_semanal: sea7,
    desestacionalizado,
    forecast_diario,
    horizontes: buildHorizontes(forecast_diario),
  };
}

function buildHorizontes(daily: ForecastPunto[]): HorizonOutlook[] {
  const sum = (n: number) => {
    const slice = daily.slice(0, n);
    return {
      dias: n as 7 | 15 | 30,
      unidades: Math.round(slice.reduce((s, p) => s + p.yhat, 0)),
      lo: Math.round(slice.reduce((s, p) => s + p.lo, 0)),
      hi: Math.round(slice.reduce((s, p) => s + p.hi, 0)),
    };
  };
  return [sum(7), sum(15), sum(30)];
}

/** Suma forecasts por sede (mismo calendario). */
export function sumarForecasts(
  porSede: Record<string, ForecastResult>,
): ForecastResult {
  const ids = Object.keys(porSede);
  if (ids.length === 0) {
    return forecastUnidades([]);
  }
  const base = porSede[ids[0]];
  const forecast_diario = base.forecast_diario.map((p, i) => {
    let yhat = 0;
    let lo = 0;
    let hi = 0;
    for (const id of ids) {
      const q = porSede[id].forecast_diario[i];
      if (!q) continue;
      yhat += q.yhat;
      lo += q.lo;
      hi += q.hi;
    }
    return { fecha: p.fecha, yhat, lo, hi };
  });

  // desestacionalizado consolidado: suma y
  const fechaSet = new Map<string, { y: number; deseas: number }>();
  for (const id of ids) {
    for (const d of porSede[id].desestacionalizado) {
      const cur = fechaSet.get(d.fecha) ?? { y: 0, deseas: 0 };
      cur.y += d.y;
      cur.deseas += d.deseas;
      fechaSet.set(d.fecha, cur);
    }
  }
  const desestacionalizado = [...fechaSet.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([fecha, v]) => ({ fecha, y: v.y, deseas: v.deseas }));

  const metodos = [...new Set(ids.map((id) => porSede[id].metodo))];
  return {
    metodo: `Suma por sede (${metodos.length === 1 ? metodos[0] : "MSTL/ETS mixto"})`,
    entrenado_hasta: base.entrenado_hasta,
    n_obs: Math.max(...ids.map((id) => porSede[id].n_obs)),
    sigma: Math.sqrt(
      ids.reduce((s, id) => s + porSede[id].sigma ** 2, 0),
    ),
    estacional_semanal: base.estacional_semanal.map((_, i) =>
      ids.reduce((s, id) => s + porSede[id].estacional_semanal[i], 0),
    ),
    desestacionalizado,
    forecast_diario,
    horizontes: buildHorizontes(forecast_diario),
  };
}
