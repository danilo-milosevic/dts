import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks an element's content size with ResizeObserver.
 * The first measurement is immediate; later changes are applied once the size has been stable
 * for `settleMs`, so panel/drawer animations don't re-render heavy content (waveforms, charts) every frame.
 * Pass settleMs = 0 for immediate updates.
 */
export function useElementSize<T extends HTMLElement>(settleMs = 140) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined; let first = true;
    const apply = (width: number, height: number) => setSize(s => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (first || !settleMs) { first = false; apply(width, height); return; }
      clearTimeout(timer); timer = setTimeout(() => apply(width, height), settleMs);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [settleMs]);
  return [ref, size] as const;
}
