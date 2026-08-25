"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { nombrePerfilCartera, type CarteraPerfilId } from "@/lib/carteraPerfiles";

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
    <strong className="font-semibold text-inherit">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 last:mb-0 list-disc pl-4 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 last:mb-0 list-decimal pl-4 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-snug">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-bold mb-1.5 mt-1 first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mb-1.5 mt-1 first:mt-0">{children}</h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold mb-1 mt-1 first:mt-0">{children}</h4>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline text-sky-300 break-all"
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
        <code className="block my-2 overflow-x-auto rounded-lg bg-black/40 px-2.5 py-2 text-[11px] font-mono text-zinc-200 whitespace-pre">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-black/35 px-1 py-0.5 text-[12px] font-mono">
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
    <blockquote className="my-2 border-l-2 border-zinc-600 pl-2 text-zinc-400">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left text-[11px] border-collapse">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-zinc-700 bg-zinc-800/80 px-1.5 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-zinc-700 px-1.5 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="my-2 border-zinc-700" />,
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

/** Reduce JPEG/WebP para no reventar el body del proxy. */
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
      const t = String(reader.result ?? "");
      resolve(t.slice(0, MAX_TEXT_CHARS));
    };
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsText(file);
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
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
}: {
  perfilId: CarteraPerfilId | null;
  onAfterReply?: () => void;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WireMsg[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open, busy, pending]);

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
      setError("Elige tu perfil arriba para chatear");
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="fixed z-40 bottom-20 right-3 sm:right-4 min-h-[48px] px-4 rounded-full border border-amber-700/70 bg-amber-950 text-amber-100 text-sm font-semibold shadow-lg touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
      >
        {open ? "Cerrar chat" : "Agente cobro"}
      </button>

      {open && (
        <section
          id={titleId}
          aria-label="Chat con agente de cobro"
          className="fixed z-40 bottom-36 right-3 sm:right-4 w-[min(100vw-1.5rem,22rem)] max-h-[min(70dvh,32rem)] flex flex-col rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden"
        >
          <header className="shrink-0 px-3 py-2.5 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Agente cobro</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {perfilId
                ? `Como ${nombrePerfilCartera(perfilId)} · pega chat o captura`
                : "Elige tu perfil arriba"}
            </p>
          </header>

          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2"
            role="log"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <p className="text-xs text-zinc-500 leading-relaxed py-2">
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
                  className={`text-sm leading-relaxed break-words rounded-xl px-2.5 py-2 ${
                    m.role === "user"
                      ? "bg-amber-950/60 text-amber-50 ml-6"
                      : "bg-zinc-900 text-zinc-200 mr-4"
                  }`}
                >
                  {imgs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {imgs.map((src, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={j}
                          src={src}
                          alt="Adjunto"
                          className="max-h-28 max-w-full rounded-lg border border-zinc-700 object-contain"
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
              <p className="text-xs text-zinc-500 px-1">Pensando…</p>
            )}
          </div>

          {error && (
            <p
              className="shrink-0 px-3 py-1.5 text-xs text-red-300 border-t border-zinc-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {pending.length > 0 && (
            <div className="shrink-0 px-2 pt-2 flex flex-wrap gap-1.5 border-t border-zinc-800">
              {pending.map((f) => (
                <div
                  key={f.id}
                  className="relative flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 py-1 max-w-full"
                >
                  {f.kind === "image" && f.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.previewUrl}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-zinc-400 px-1">TXT</span>
                  )}
                  <span className="text-[10px] text-zinc-400 truncate max-w-[7rem]">
                    {f.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar ${f.name}`}
                    onClick={() =>
                      setPending((p) => p.filter((x) => x.id !== f.id))
                    }
                    className="text-zinc-500 hover:text-zinc-200 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="shrink-0 border-t border-zinc-800 p-2 flex gap-2 items-end"
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
            <button
              type="button"
              disabled={busy || pending.length >= MAX_FILES}
              onClick={() => fileRef.current?.click()}
              title="Adjuntar"
              aria-label="Adjuntar archivo"
              className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 disabled:opacity-40 touch-manipulation inline-flex items-center justify-center"
            >
              <svg
                aria-hidden
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
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
              className="flex-1 min-h-[44px] resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500"
            />
            <button
              type="submit"
              disabled={busy || (!input.trim() && !pending.length)}
              className="self-end min-h-[44px] px-3 rounded-xl bg-amber-700 text-amber-50 text-sm font-semibold disabled:opacity-40 touch-manipulation"
            >
              Enviar
            </button>
          </form>
        </section>
      )}
    </>
  );
}
