import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import s from './Slider.module.css';

export interface SliderProps { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void; label: string; width?: number | string; className?: string; }

export function Slider({ value, min = 0, max = 100, step = 1, onChange, onCommit, label, width, className }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  const fromX = (x: number) => { const r = ref.current!.getBoundingClientRect(); const v = min + ((x - r.left) / r.width) * (max - min); return Math.min(max, Math.max(min, Math.round(v / step) * step)); };
  const down = (e: PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(true); onChange(fromX(e.clientX)); };
  const move = (e: PointerEvent) => { if (drag) onChange(fromX(e.clientX)); };
  const up = (e: PointerEvent) => { if (!drag) return; setDrag(false); onCommit?.(fromX(e.clientX)); };
  const key = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (d) { e.preventDefault(); const v = Math.min(max, Math.max(min, value + d * (e.shiftKey ? 10 : 1))); onChange(v); onCommit?.(v); }
  };
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      className={[s.root, drag ? s.dragging : s.animate, className].filter(Boolean).join(' ')} style={{ width, flex: width ? 'none' : undefined }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onKeyDown={key}>
      <div className={s.track} />
      <div className={s.fill} style={{ width: `${pct}%` }} />
      <div className={s.knob} style={{ left: `${pct}%` }} />
    </div>
  );
}
