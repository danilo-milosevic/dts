import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { scaleLinear } from 'd3';
import { getPeaks } from '@/audio/dsp';
import { usePlayhead, seekTo } from '@/hooks/usePlayhead';
import { useElementSize } from '@/hooks/useElementSize';
import { FloatingTip } from '../ui/Tooltip';
import { fmtTime } from '@/lib/format';
import type { Which } from '@/audio/engine';
import s from './Waveform.module.css';

const BAR = 3, GAP = 2.5, PAD = 16;

/**
 * Bar waveform (D3 scales, SVG). Click to seek; the played part is drawn at full strength.
 * The SVG uses a viewBox stretched to the box, so it scales smoothly while panels resize and
 * is only rebuilt once the size settles.
 */
export function Waveform({ buffer, channel, tone, trackId, which, label }: { buffer: AudioBuffer | null; channel: number | 'mix'; tone: 'source' | 'dts'; trackId: string; which: Which; label: string }) {
  const [ref, { width, height }] = useElementSize<HTMLDivElement>();
  const bars = Math.max(20, Math.floor((width - PAD * 2) / (BAR + GAP)));
  const [peaks, setPeaks] = useState<{ data: Float32Array; buffer: AudioBuffer; channel: number | 'mix' } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const shown = useRef<AudioBuffer | null>(null); // buffer whose bars already animated in
  const played = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (!buffer) { setPeaks(null); return; }
    if (width) getPeaks(buffer, channel, bars).then(r => live && setPeaks({ data: r.peaks, buffer, channel }));
    return () => { live = false; };
  }, [buffer, channel, bars, width]);
  const current = peaks && peaks.buffer === buffer && peaks.channel === channel ? peaks.data : null;
  const animateIn = !!current && shown.current !== buffer;
  useEffect(() => { if (current) shown.current = buffer; }, [current, buffer]);

  const duration = buffer?.duration ?? 1;
  const x = useMemo(() => scaleLinear().domain([0, duration]).range([PAD, Math.max(PAD + 1, width - PAD)]), [duration, width]);
  const h = useMemo(() => scaleLinear().domain([0, 1]).range([2, Math.max(4, height - 24)]).clamp(true), [height]);

  // playhead + played region as percentages, so they stay right while the box stretches
  const paint = useCallback((sec: number, active: boolean) => {
    const pct = width ? (x(sec) / width) * 100 : 0;
    if (played.current) played.current.style.clipPath = `inset(0 ${active ? 100 - pct : 100}% 0 0)`;
    if (head.current) { head.current.style.left = `${pct}%`; head.current.style.opacity = active ? '1' : '0'; }
  }, [x, width]);
  usePlayhead(trackId, paint, which);

  const toTime = (e: MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return Math.max(0, Math.min(duration, x.invert(((e.clientX - r.left) / r.width) * width))); };
  const svg = current && width > 0 && (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {Array.from(current, (p, i) => { const bh = h(p); const cx = PAD + i * (BAR + GAP); return <rect key={i} className={animateIn ? `${s.bar} ${s.enter}` : s.bar} x={cx} y={(height - bh) / 2} width={BAR} height={bh} rx={1.5} style={animateIn ? { animationDelay: `calc(var(--dur-chart) * ${(i / current.length) * 0.6})` } : undefined} />; })}
    </svg>
  );
  const vars = { '--tone': tone === 'source' ? 'var(--accent-primary)' : 'var(--accent-dts)', '--soft': tone === 'source' ? 'var(--bg-accent-soft)' : 'var(--bg-dts-soft)' } as CSSProperties;

  return (
    <div ref={ref} className={s.wave} style={vars} role="slider" aria-label={`${label} — click to seek`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={0} tabIndex={-1}
      onMouseMove={e => setHover(toTime(e))} onMouseLeave={() => setHover(null)} onClick={e => seekTo(toTime(e))}>
      {!current && <div className={`${s.loading} skeleton`} />}
      <div className={`${s.layer} ${s.base}`}>{svg}</div>
      <div ref={played} className={s.layer} style={{ clipPath: 'inset(0 100% 0 0)' }}>{svg}</div>
      <div ref={head} className={s.playhead} style={{ opacity: 0 }} />
      {hover != null && <div className={s.hover} style={{ left: `${(x(hover) / Math.max(1, width)) * 100}%` }} />}
      <FloatingTip show={hover != null} x={hover != null ? x(hover) : 0} y={20} title={fmtTime(hover ?? 0, true)} bounds={{ w: width, h: height }} />
    </div>
  );
}
