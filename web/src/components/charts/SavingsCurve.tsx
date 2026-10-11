import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { area, curveMonotoneX, line, scaleLinear } from 'd3';
import type { CompareStats } from '@/api/types';
import { useElementSize } from '@/hooks/useElementSize';
import { FloatingTip } from '../ui/Tooltip';
import { MARGIN } from './useChartScales';
import s from './charts.module.css';

const SERIES = [{ key: 'surround', label: '5.1', color: 'var(--accent-dts)' }, { key: 'stereo', label: 'Stereo', color: 'var(--accent-primary)' }] as const;
const STOPS = [384, 768, 1152, 1509];

/** Savings % vs DTS Core bitrate. Drag the "Current preset" handle to change the selected track's bitrate. */
export function SavingsCurve({ data, hidden, height, preset, onPreset }: { data: CompareStats['savingsVsBitrate']; hidden: string[]; height: number; preset: number | null; onPreset?: (kbps: number) => void }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ key: string; i: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const iw = Math.max(10, width - MARGIN.l - MARGIN.r), ih = Math.max(10, height - MARGIN.t - MARGIN.b);
  const x = useMemo(() => scaleLinear().domain([300, 1600]).range([MARGIN.l, MARGIN.l + iw]), [iw]);
  const y = useMemo(() => scaleLinear().domain([0, 100]).range([MARGIN.t + ih, MARGIN.t]), [ih]);
  const mk = useMemo(() => line<[number, number]>().x(d => x(d[0])).y(d => y(d[1])).curve(curveMonotoneX), [x, y]);
  const mkArea = useMemo(() => area<[number, number]>().x(d => x(d[0])).y0(y(0)).y1(d => y(d[1])).curve(curveMonotoneX), [x, y]);
  const marker = drag ?? preset;

  const pointerKbps = (e: PointerEvent) => { const r = svg.current!.getBoundingClientRect(); const v = x.invert(e.clientX - r.left); return STOPS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)); };
  const hv = hover ? data[hover.key as 'stereo' | 'surround'].points[hover.i] : null;

  return (
    <div ref={ref} className={s.wrap}>
      <svg ref={svg} className={s.svg} width={width} height={height}>
        <g className={s.grid}>
          {[0, 25, 50, 75, 100].map(t => <g key={t}><line className={t === 0 ? s.base : undefined} x1={MARGIN.l} x2={MARGIN.l + iw} y1={y(t)} y2={y(t)} /><text className={s.tick} x={MARGIN.l - 10} y={y(t)} dy="0.32em" textAnchor="end">{t}%</text></g>)}
          {STOPS.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={MARGIN.t + ih} y2={MARGIN.t + ih + 5} /><text className={s.tick} x={x(t)} y={MARGIN.t + ih + 18} textAnchor="middle">{t}</text></g>)}
        </g>
        {SERIES.map(sr => {
          const pts = data[sr.key].points; const d = mk(pts) ?? '';
          return (
            <g key={sr.key} className={hidden.includes(sr.key) ? s.hidden : undefined}>
              <path className={s.area} d={mkArea(pts) ?? ''} fill={sr.color} />
              <path className={`${s.line} ${s.draw}`} d={d} stroke={sr.color} style={{ ['--len' as string]: 2000 }} />
              {pts.map((p, i) => (
                <g key={i} className={s.dot} style={{ transform: `translate(${x(p[0])}px, ${y(p[1])}px)` }} onMouseEnter={() => setHover({ key: sr.key, i })} onMouseLeave={() => setHover(null)}>
                  {hover?.key === sr.key && hover.i === i && <circle className={s.halo} r={14} fill={sr.color} />}
                  <circle r={hover?.key === sr.key && hover.i === i ? 7 : 5} fill={sr.color} />
                  <circle r={14} fill="transparent" style={{ stroke: 'none', animation: 'none' }} />
                </g>
              ))}
            </g>
          );
        })}
        {marker != null && (
          <g>
            <line className={s.marker} x1={x(marker)} x2={x(marker)} y1={MARGIN.t} y2={MARGIN.t + ih} />
            <g className={s.handle} transform={`translate(${x(marker)}, ${MARGIN.t + 2})`}
              onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(pointerKbps(e)); }}
              onPointerMove={e => drag != null && setDrag(pointerKbps(e))}
              onPointerUp={e => { if (drag == null) return; const v = pointerKbps(e); setDrag(null); onPreset?.(v); }}>
              <rect x={-48} y={0} width={96} height={20} rx={4} />
              <text className={s.handleText} x={0} y={14} textAnchor="middle">Preset · {marker}</text>
            </g>
          </g>
        )}
      </svg>
      <FloatingTip show={!!hv} x={hv ? x(hv[0]) : 0} y={hv ? y(hv[1]) : 0} bounds={{ w: width, h: height }}
        title={hv ? `${hv[0]} kbps · ${hover!.key === 'stereo' ? 'Stereo' : '5.1'}` : ''} detail={hv ? `${hv[1]}% smaller · ×${(100 / (100 - hv[1])).toFixed(2)}` : undefined} />
    </div>
  );
}
