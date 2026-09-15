"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tone = "light" | "dark";

function mdComponents(tone: Tone) {
  const link =
    tone === "dark"
      ? "break-all text-sky-300 underline"
      : "break-all text-sky-700 underline";
  const codeInline =
    tone === "dark"
      ? "rounded bg-black/35 px-1 py-0.5 font-mono text-[0.85em]"
      : "rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]";
  const codeBlock =
    tone === "dark"
      ? "my-2 block overflow-x-auto whitespace-pre rounded-lg bg-black/40 px-2.5 py-2 font-mono text-[11px]"
      : "my-2 block overflow-x-auto whitespace-pre rounded-lg bg-black/5 px-2.5 py-2 font-mono text-[11px]";
  const quote =
    tone === "dark"
      ? "my-2 border-l-2 border-white/25 pl-2 text-white/70"
      : "my-2 border-l-2 border-zinc-300 pl-2 text-zinc-600";
  const th =
    tone === "dark"
      ? "border border-white/20 bg-white/10 px-1.5 py-1 font-semibold"
      : "border border-zinc-200 bg-zinc-100 px-1.5 py-1 font-semibold";
  const td =
    tone === "dark"
      ? "border border-white/15 px-1.5 py-1 align-top"
      : "border border-zinc-200 px-1.5 py-1 align-top";
  const hr = tone === "dark" ? "my-2 border-white/20" : "my-2 border-zinc-200";

  return {
    p: ({ children }: { children?: ReactNode }) => (
      <p className="mb-2 last:mb-0">{children}</p>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }: { children?: ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="leading-snug">{children}</li>
    ),
    h1: ({ children }: { children?: ReactNode }) => (
      <h3 className="mb-1.5 mt-1 text-base font-bold first:mt-0">{children}</h3>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h3 className="mb-1.5 mt-1 text-sm font-bold first:mt-0">{children}</h3>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h4 className="mb-1 mt-1 text-sm font-semibold first:mt-0">{children}</h4>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        {children}
      </a>
    ),
    code: ({
      className,
      children,
    }: {
      className?: string;
      children?: ReactNode;
    }) => {
      const block =
        Boolean(className?.includes("language-")) ||
        String(children).includes("\n");
      if (block) {
        return <code className={codeBlock}>{children}</code>;
      }
      return <code className={codeInline}>{children}</code>;
    },
    pre: ({ children }: { children?: ReactNode }) => (
      <pre
        className={
          tone === "dark"
            ? "my-2 overflow-x-auto rounded-lg bg-black/40 p-0 text-[11px]"
            : "my-2 overflow-x-auto rounded-lg bg-black/5 p-0 text-[11px]"
        }
      >
        {children}
      </pre>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className={quote}>{children}</blockquote>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[11px]">
          {children}
        </table>
      </div>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className={th}>{children}</th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className={td}>{children}</td>
    ),
    hr: () => <hr className={hr} />,
  };
}

export function ChatMarkdown({
  text,
  tone = "dark",
}: {
  text: string;
  tone?: Tone;
}) {
  return (
    <div className="chat-markdown break-words text-[13px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents(tone)}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
