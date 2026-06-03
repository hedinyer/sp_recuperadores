import { enlaceGoogleMaps } from "@/lib/geolocation";
import {
  enlaceMapaEmbebido,
  etiquetaEstadoGps,
  type UbicacionGpsMoto,
} from "@/lib/systemTrackGps";

export function UbicacionGpsMoto({ gps }: { gps: UbicacionGpsMoto }) {
  const mapsUrl = enlaceGoogleMaps(gps.coords);
  const embedUrl = enlaceMapaEmbebido(gps);

  return (
    <section className="px-4 py-3.5 border-b border-zinc-800 bg-emerald-950/20">
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/90 mb-2">
        Ubicación GPS — System Track
      </h2>

      <div className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900">
        <iframe
          title={`Mapa GPS ${gps.coords}`}
          src={embedUrl}
          className="w-full h-48 border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-3 mb-2">
        <span className="inline-flex items-center rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 text-xs font-medium text-emerald-200">
          {etiquetaEstadoGps(gps.online)}
        </span>
        <span className="inline-flex items-center rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 tabular-nums">
          {gps.speed} km/h
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Última actualización:{" "}
        <span className="text-zinc-300 tabular-nums">{gps.time}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-500 tabular-nums">
        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
      </p>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 min-h-[46px] w-full rounded-xl border border-emerald-700/60 bg-emerald-900/30 text-sm font-semibold text-emerald-100 active:scale-[0.98] transition-transform touch-manipulation"
      >
        <svg
          aria-hidden
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Abrir en Google Maps
      </a>
    </section>
  );
}

export function AvisoGpsPendiente({ mensaje }: { mensaje: string }) {
  return (
    <section className="px-4 py-3.5 border-b border-zinc-800 bg-amber-950/20">
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-amber-400/90 mb-1.5">
        GPS System Track
      </h2>
      <p className="text-sm text-amber-100/90 leading-snug">{mensaje}</p>
    </section>
  );
}
