import { useRef, useState, type PointerEvent } from 'react';
import s from './ResizeHandle.module.css';

interface Props {
  /** Which edge of the panel the handle sits on. Dragging away from the panel makes it wider. */
  edge: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onDragChange?: (dragging: boolean) => void;
  /** Double-click: back to the default width. */
  onReset?: () => void;
  label: string;
}

/** Drag handle for resizable panels. Shows an accent border along the edge while resizing; ←/→ keys resize too. */
export function ResizeHandle({ edge, width, min, max, onResize, onDragChange, onReset, label }: Props) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));
  const dir = edge === 'right' ? 1 : -1;

  const setDrag = (on: boolean) => {
    setDragging(on); onDragChange?.(on);
    document.documentElement.classList.toggle('is-resizing', on);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: width }; setDrag(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => { if (start.current) onResize(clamp(start.current.w + dir * (e.clientX - start.current.x))); };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null; setDrag(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      className={[s.handle, s[edge], dragging && s.dragging].filter(Boolean).join(' ')}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onDoubleClick={onReset}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onResize(clamp(width + (e.key === 'ArrowRight' ? dir : -dir) * (e.shiftKey ? 48 : 16))); } }}
    />
  );
}
