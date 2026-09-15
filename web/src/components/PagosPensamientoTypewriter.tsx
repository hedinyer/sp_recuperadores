"use client";

import { useEffect, useRef, useState } from "react";

type LineState = {
  full: string;
  shown: string;
  done: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function charDelayMs(len: number): number {
  if (len < 40) return 22;
  if (len < 90) return 16;
  return 12;
}

/**
 * Revela cada pensamiento letra a letra, en cola, con pausa suave entre líneas.
 */
export function PagosPensamientoTypewriter({
  lines,
  active,
  onReveal,
}: {
  lines: string[];
  active: boolean;
  onReveal?: () => void;
}) {
  const [rendered, setRendered] = useState<LineState[]>([]);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);

  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const seenRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const onRevealRef = useRef(onReveal);
  const pumpRef = useRef<() => void>(() => {});
  onRevealRef.current = onReveal;

  const clearTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  const syncQueueCount = () => setQueued(queueRef.current.length);

  useEffect(() => {
    const pump = () => {
      if (busyRef.current) return;
      const next = queueRef.current.shift();
      syncQueueCount();
      if (next == null) return;

      busyRef.current = true;
      setBusy(true);

      if (prefersReducedMotion()) {
        setRendered((r) => [...r, { full: next, shown: next, done: true }]);
        busyRef.current = false;
        setBusy(false);
        onRevealRef.current?.();
        schedule(pump, 40);
        return;
      }

      setRendered((r) => [...r, { full: next, shown: "", done: false }]);
      onRevealRef.current?.();

      let i = 0;
      const delay = charDelayMs(next.length);

      const tick = () => {
        const remaining = next.length - i;
        const step = remaining > 70 ? 2 : 1;
        i = Math.min(next.length, i + step);
        const shown = next.slice(0, i);
        const done = i >= next.length;
        setRendered((r) => {
          if (!r.length) return r;
          const copy = r.slice();
          const last = copy[copy.length - 1]!;
          copy[copy.length - 1] = { ...last, shown, done };
          return copy;
        });
        onRevealRef.current?.();
        if (!done) {
          schedule(tick, delay);
        } else {
          busyRef.current = false;
          setBusy(false);
          schedule(pump, 140);
        }
      };

      schedule(tick, 50);
    };

    pumpRef.current = pump;
  });

  useEffect(() => {
    if (lines.length === 0) {
      clearTimers();
      queueRef.current = [];
      busyRef.current = false;
      seenRef.current = 0;
      setRendered([]);
      setBusy(false);
      setQueued(0);
      return;
    }

    if (lines.length < seenRef.current) {
      clearTimers();
      queueRef.current = [];
      busyRef.current = false;
      seenRef.current = 0;
      setRendered([]);
      setBusy(false);
      setQueued(0);
    }

    for (let i = seenRef.current; i < lines.length; i++) {
      queueRef.current.push(lines[i]!);
    }
    seenRef.current = lines.length;
    syncQueueCount();
    pumpRef.current();
  }, [lines]);

  useEffect(() => () => clearTimers(), []);

  const waitingMore = active && rendered.every((l) => l.done) && !busy && queued === 0;
  const showCaretLine = waitingMore || (rendered.length === 0 && active);

  return (
    <ul className="pagos-think-font flex flex-col gap-2 text-[15px] leading-relaxed tracking-[-0.01em] text-zinc-400 text-pretty">
      {rendered.map((line, i) => {
        const isLast = i === rendered.length - 1;
        const emphasize = isLast && (!line.done || active);
        return (
          <li
            key={`${i}-${line.full.slice(0, 20)}`}
            className={emphasize ? "text-zinc-200" : undefined}
          >
            <span>{line.shown}</span>
            {isLast && !line.done ? (
              <span
                className="pagos-think-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] rounded-sm bg-zinc-300/90 align-baseline"
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
      {showCaretLine ? (
        <li className="text-zinc-500" aria-hidden>
          <span className="pagos-think-caret inline-block h-3 w-1.5 rounded-sm bg-zinc-400/80 align-middle" />
        </li>
      ) : null}
    </ul>
  );
}
