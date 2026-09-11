"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PaperclipIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatFechaHora } from "@/lib/fechas";
import { nombrePerfilCartera, type CarteraPerfilId } from "@/lib/carteraPerfiles";
import { cn } from "@/lib/utils";

type TabIa = "alertas" | "analizar" | "chat";

type AlertaUi = {
  id: number;
  placa: string;
  titulo: string;
  cuerpo: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
};

/** Logo IA: “AI” en marco redondeado con destellos (como el icono de referencia). */
function IconoIA({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Marco redondeado con esquina superior derecha abierta */}
      <path
        d="M15.2 3.8H7.2C5.1 3.8 3.4 5.5 3.4 7.6v8.8c0 2.1 1.7 3.8 3.8 3.8h8.8c2.1 0 3.8-1.7 3.8-3.8V9.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Destellos */}
      <path
        d="M17.6 4.2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7Z"
        fill="currentColor"
      />
      <path
        d="M21.1 5.6l.35.85.85.35-.85.35-.35.85-.35-.85-.85-.35.85-.35.35-.85Z"
        fill="currentColor"
      />
      <path
        d="M19.6 2.5l.28.68.68.28-.68.28-.28.68-.28-.68-.68-.28.68-.28.28-.68Z"
        fill="currentColor"
      />
      <text
        x="11.2"
        y="15.2"
        textAnchor="middle"
        fill="currentColor"
        fontSize="8"
        fontWeight="700"
        fontFamily="system-ui, Segoe UI, sans-serif"
        letterSpacing="-0.04em"
      >
        AI
      </text>
    </svg>
  );
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type WireMsg = {
  role: "user" | "assistant";
  content: string | ContentPart[];
};

type PendingFile = {
  id: string;
  name: string;
  kind: "image" | "text";
  previewUrl?: string;
  dataUrl?: string;
  text?: string;
};

const MAX_FILES = 4;
const MAX_IMAGE_BYTES = 1_800_000;
const MAX_TEXT_CHARS = 12000;

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-snug">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-1 text-base font-bold first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-1 text-sm font-bold first:mt-0">{children}</h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-sky-300 underline"
    >
      {children}
    </a>
  ),
  code: ({
    className,
    children,
  }: {
    className?: string;
    children?: React.ReactNode;
  }) => {
    const block =
      Boolean(className?.includes("language-")) ||
      String(children).includes("\n");
    if (block) {
      return (
        <code className="my-2 block overflow-x-auto whitespace-pre rounded-lg bg-black/40 px-2.5 py-2 font-mono text-[11px]">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-black/35 px-1 py-0.5 font-mono text-xs">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-black/40 p-0 text-[11px]">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-border pl-2 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border bg-muted px-1.5 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-1.5 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="my-2 border-border" />,
};

function MarkdownMsg({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}

function displayText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function displayImages(content: string | ContentPart[]): string[] {
  if (typeof content === "string") return [];
  return content
    .filter(
      (p): p is { type: "image_url"; image_url: { url: string } } =>
        p.type === "image_url",
    )
    .map((p) => p.image_url.url);
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1600;
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo leer la imagen"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > MAX_IMAGE_BYTES && quality > 0.4) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        reject(new Error(`Imagen muy pesada: ${file.name}`));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo abrir ${file.name}`));
    };
    img.src = url;
  });
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? "").slice(0, MAX_TEXT_CHARS));
    };
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsText(file);
  });
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  );
}

function isTextFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    /\.(txt|csv|md|json|log)$/i.test(file.name)
  );
}

export function ChatCarteraHermes({
  perfilId,
  onAfterReply,
  onVerPlaca,
}: {
  perfilId: CarteraPerfilId | null;
  onAfterReply?: () => void;
  onVerPlaca?: (placa: string) => void;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabIa>("alertas");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WireMsg[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [alertas, setAlertas] = useState<AlertaUi[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [analisisMsg, setAnalisisMsg] = useState<string | null>(null);

  const puedeAnalizar =
    perfilId === "jhon_saenz" || perfilId === "james_blanco";

  const cargarAlertas = useCallback(async () => {
    if (!perfilId || !puedeAnalizar) {
      setAlertas([]);
      setNoLeidas(0);
      return;
    }
    try {
      const res = await fetch(
        `/api/cartera/alertas?perfil_id=${encodeURIComponent(perfilId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setAlertas((data.items as AlertaUi[]) ?? []);
      setNoLeidas(Number(data.no_leidas) || 0);
    } catch {
      // silencioso en badge
    }
  }, [perfilId, puedeAnalizar]);

  useEffect(() => {
    void cargarAlertas();
    const id = window.setInterval(() => void cargarAlertas(), 20_000);
    return () => window.clearInterval(id);
  }, [cargarAlertas]);

  useEffect(() => {
    if (!open) return;
    void cargarAlertas();
  }, [open, cargarAlertas]);

  useEffect(() => {
    if (!open || tab !== "chat") return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open, busy, pending, tab]);

  async function marcarLeidas(ids?: number[]) {
    if (!perfilId) return;
    try {
      await fetch("/api/cartera/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: perfilId, ids }),
      });
      await cargarAlertas();
    } catch {
      // ignore
    }
  }

  async function correrAnalisis() {
    if (!perfilId || !puedeAnalizar || analizando) return;
    setAnalizando(true);
    setAnalisisMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/cartera/analizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: perfilId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo analizar");
      setAnalisisMsg(
        `Procesadas ${data.procesadas ?? 0} · compromisos ${data.compromisos ?? 0} · follow-ups ${data.followups ?? 0} · alertas ${data.alertas ?? 0}` +
          (Array.isArray(data.errores) && data.errores.length
            ? ` · ${data.errores.length} con error`
            : ""),
      );
      await cargarAlertas();
      onAfterReply?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalizando(false);
    }
  }
  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setError(null);
    const room = MAX_FILES - pending.length;
    if (room <= 0) {
      setError(`Máximo ${MAX_FILES} archivos`);
      return;
    }

    const next: PendingFile[] = [];
    for (const file of files.slice(0, room)) {
      try {
        if (isImageFile(file)) {
          const dataUrl = await compressImage(file);
          next.push({
            id: `${Date.now()}-${file.name}-${Math.random()}`,
            name: file.name,
            kind: "image",
            previewUrl: dataUrl,
            dataUrl,
          });
        } else if (isTextFile(file)) {
          const text = await readTextFile(file);
          next.push({
            id: `${Date.now()}-${file.name}-${Math.random()}`,
            name: file.name,
            kind: "text",
            text,
          });
        } else {
          setError(`No soportado: ${file.name} (usa imagen o .txt/.csv/.md)`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al adjuntar");
      }
    }
    if (next.length) setPending((p) => [...p, ...next].slice(0, MAX_FILES));
  }

  async function enviar() {
    const text = input.trim();
    if ((!text && !pending.length) || busy) return;
    if (!perfilId) {
      setError("Elige quién eres arriba para chatear");
      return;
    }

    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const f of pending) {
      if (f.kind === "image" && f.dataUrl) {
        parts.push({ type: "image_url", image_url: { url: f.dataUrl } });
      } else if (f.kind === "text" && f.text) {
        parts.push({
          type: "text",
          text: `--- Archivo: ${f.name} ---\n${f.text}`,
        });
      }
    }

    const userContent: string | ContentPart[] =
      parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;

    const next: WireMsg[] = [
      ...messages,
      { role: "user", content: userContent },
    ];
    setMessages(next);
    setInput("");
    setPending([]);
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/cartera/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          perfil_id: perfilId,
          perfil_nombre: nombrePerfilCartera(perfilId),
        }),
      });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !data.content) {
        throw new Error(data.error || "No se pudo hablar con el agente");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content! },
      ]);
      onAfterReply?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de chat");
    } finally {
      setBusy(false);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }

  return (
    <>
      <Button
        type="button"
        aria-label={
          noLeidas > 0
            ? `Ayuda con IA, ${noLeidas} alertas sin leer`
            : "Ayuda con IA"
        }
        title="Ayuda con IA"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen(true)}
        size="icon"
        className="relative fixed right-4 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-40 size-12 rounded-full shadow-lg active:scale-[0.96]"
      >
        <IconoIA className="size-6" />
        {noLeidas > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id={titleId}
          side="bottom"
          className="flex h-[min(85dvh,36rem)] max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
            <SheetTitle>Ayuda con IA</SheetTitle>
            <SheetDescription>
              {perfilId
                ? `Como ${nombrePerfilCartera(perfilId)} · alertas, análisis y chat`
                : "Elige quién eres arriba"}
            </SheetDescription>
          </SheetHeader>

          <div
            role="tablist"
            aria-label="Secciones IA"
            className="grid shrink-0 grid-cols-3 gap-1 border-b border-border px-2 py-2"
          >
            {(
              [
                { id: "alertas" as const, label: "Alertas" },
                { id: "analizar" as const, label: "Analizar" },
                { id: "chat" as const, label: "Chat" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  "relative min-h-10 rounded-lg text-sm font-semibold touch-manipulation",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "alertas" && noLeidas > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {noLeidas}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === "alertas" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {!puedeAnalizar ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Las alertas IA están para Jhon y James.
                </p>
              ) : alertas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin alertas. Analiza gestiones nuevas en la pestaña Analizar.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {alertas.map((a) => (
                    <li
                      key={a.id}
                      className={cn(
                        "rounded-xl border border-border px-3 py-2.5",
                        !a.read_at && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {a.titulo}
                      </p>
                      {a.cuerpo ? (
                        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                          {a.cuerpo}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {formatFechaHora(a.created_at)} · {a.kind}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {onVerPlaca ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 flex-1 rounded-lg text-xs"
                            onClick={() => {
                              onVerPlaca(a.placa);
                              setOpen(false);
                            }}
                          >
                            Ver {a.placa}
                          </Button>
                        ) : null}
                        {!a.read_at ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 flex-1 rounded-lg text-xs"
                            onClick={() => void marcarLeidas([a.id])}
                          >
                            Marcar leída
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {puedeAnalizar && alertas.some((a) => !a.read_at) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10 w-full rounded-xl"
                  onClick={() => void marcarLeidas()}
                >
                  Marcar todas leídas
                </Button>
              ) : null}
            </div>
          ) : null}

          {tab === "analizar" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
              {!puedeAnalizar ? (
                <p className="text-sm text-muted-foreground">
                  El harness de cobro analiza gestiones de Jhon y James en el
                  lote 17+.
                </p>
              ) : (
                <>
                  <p className="text-sm text-pretty text-muted-foreground">
                    Lee gestiones nuevas (botones + notas), cruza con pagos y
                    crea follow-ups / alertas (ej. «paga hoy en la tarde», «el
                    sábado»).
                  </p>
                  <Button
                    type="button"
                    className="h-12 rounded-xl text-base font-semibold"
                    disabled={analizando || !perfilId}
                    onClick={() => void correrAnalisis()}
                  >
                    {analizando
                      ? "Analizando con Hermes…"
                      : "Analizar gestiones nuevas"}
                  </Button>
                  {analisisMsg ? (
                    <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">
                      {analisisMsg}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === "chat" ? (
            <>
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
            role="log"
            aria-live="polite"
          >
            <div className="flex flex-col gap-2">
              {messages.length === 0 && (
                <p className="py-2 text-xs leading-relaxed text-muted-foreground">
                  Ej: «busca ABC12D» · adjunta captura del WhatsApp · «cómo vamos
                  hoy»
                </p>
              )}
              {messages.map((m, i) => {
                const imgs = displayImages(m.content);
                const text = displayText(m.content);
                return (
                  <div
                    key={`${m.role}-${i}`}
                    className={cn(
                      "break-words rounded-xl px-2.5 py-2 text-sm leading-relaxed",
                      m.role === "user"
                        ? "ml-6 bg-primary text-primary-foreground"
                        : "mr-4 bg-muted text-foreground",
                    )}
                  >
                    {imgs.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {imgs.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={j}
                            src={src}
                            alt="Adjunto"
                            className="max-h-28 max-w-full rounded-lg border border-border object-contain outline outline-1 outline-white/10"
                          />
                        ))}
                      </div>
                    )}
                    {m.role === "assistant" ? (
                      text ? <MarkdownMsg text={text} /> : null
                    ) : text ? (
                      <p className="whitespace-pre-wrap">{text}</p>
                    ) : null}
                  </div>
                );
              })}
              {busy && (
                <p className="px-1 text-xs text-muted-foreground">Pensando…</p>
              )}
            </div>
          </div>

          {pending.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border px-2 pt-2">
              {pending.map((f) => (
                <div
                  key={f.id}
                  className="relative flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted px-1.5 py-1"
                >
                  {f.kind === "image" && f.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.previewUrl}
                      alt=""
                      className="size-10 rounded object-cover"
                    />
                  ) : (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      TXT
                    </span>
                  )}
                  <span className="max-w-[7rem] truncate text-[10px] text-muted-foreground">
                    {f.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar ${f.name}`}
                    onClick={() =>
                      setPending((p) => p.filter((x) => x.id !== f.id))
                    }
                    className="px-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="flex shrink-0 items-end gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
          >
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept="image/*,.txt,.csv,.md,.json,.log,text/plain"
              multiple
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy || pending.length >= MAX_FILES}
              onClick={() => fileRef.current?.click()}
              title="Adjuntar"
              aria-label="Adjuntar archivo"
              className="size-11 shrink-0 rounded-lg"
            >
              <PaperclipIcon />
            </Button>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const items = e.clipboardData?.files;
                if (items?.length) {
                  e.preventDefault();
                  void addFiles(items);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={2}
              placeholder="Escribe, pega chat o captura…"
              disabled={busy}
              className="min-h-11 flex-1 resize-none"
            />
            <Button
              type="submit"
              disabled={busy || (!input.trim() && !pending.length)}
              className="h-11 shrink-0 rounded-lg active:scale-[0.96]"
            >
              Enviar
            </Button>
          </form>
            </>
          ) : null}

          {error && (
            <p
              className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
