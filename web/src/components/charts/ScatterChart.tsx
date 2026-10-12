import { useEffect, useMemo, useRef, useState } from 'react';
import { Delaunay, brushX, scaleLinear, select, type BrushBehavior } from 'd3';
import type { EncodeSample } from '@/api/types';
import { useElementSize } from '@/hooks/useElementSize';
import { FloatingTip } from '../ui/Tooltip';
import { layoutGroupLabel } from '@/lib/format';
import { LAYOUT_GROUPS, MARGIN, layoutToneVar, linearFit } from './useChartScales';
import s from './charts.module.css';

/** Encode time vs input size. Hover for details, legend hides layout groups, drag the overview to zoom. */
export function ScatterChart({ data, hidden, height, highlight }: { data: EncodeSample[]; hidden: string[]; height: number; highlight?: string }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<EncodeSample | null>(null);
  const brushRef = useRef<SVGGElement>(null);
  const brush = useRef<BrushBehavior<unknown> | null>(null);
  const visible = useMemo(() => data.filter(d => !hidden.includes(d.layout)), [data, hidden]);
  const maxX = Math.max(10, ...data.map(d => d.inputMB)) * 1.06, maxY = Math.max(5, ...data.map(d => d.seconds)) * 1.1;
  const iw = Math.max(10, width - MARGIN.l - MARGIN.r), ih = Math.max(10, height - MARGIN.t - MARGIN.b);

  const x = useMemo(() => {
    const dom: [number, number] = zoom ?? [0, maxX];
    return scaleLinear().domain(dom).range([MARGIN.l, MARGIN.l + iw]).clamp(false);
  }, [zoom, maxX, iw]);
  const yMax = useMemo(() => { const inView = visible.filter(d => d.inputMB >= x.domain()[0] && d.inputMB <= x.domain()[1]); return Math.max(5, ...inView.map(d => d.seconds)) * 1.12; }, [visible, x]);
  const y = useMemo(() => scaleLinear().domain([0, zoom ? yMax : maxY]).nice().range([MARGIN.t + ih, MARGIN.t]), [zoom, yMax, maxY, ih]);
  const delaunay = useMemo(() => Delaunay.from(visible, d => x(d.inputMB), d => y(d.seconds)), [visible, x, y]);

  // overview brush
  const ox = useMemo(() => scaleLinear().domain([0, maxX]).range([MARGIN.l, MARGIN.l + iw]), [maxX, iw]);
  useEffect(() => {
    if (!brushRef.current || !width) return;
    const b = brushX().extent([[MARGIN.l, 2], [MARGIN.l + iw, 42]]).on('end', e => {
      if (!e.sourceEvent) return; const sel = e.selection as [number, number] | null;
      setZoom(sel && sel[1] - sel[0] > 8 ? [Math.max(0, ox.invert(sel[0])), ox.invert(sel[1])] : null);
    });
    brush.current = b as unknown as BrushBehavior<unknown>;
    const g = select(brushRef.current); g.call(b);
    return () => { g.on('.brush', null); };
  }, [width, iw, ox]);
  useEffect(() => { if (!zoom && brushRef.current && brush.current) select(brushRef.current).call(brush.current.move as never, null); }, [zoom]);

  const fits = useMemo(() => LAYOUT_GROUPS.map(c => ({ c, f: linearFit(data.filter(d => d.layout === c).map(d => [d.inputMB, d.seconds])) })), [data]);
  const h = hover && visible.find(d => d.file === hover.file && d.layout === hover.layout && d.inputMB === hover.inputMB) || null;
  const ticksX = x.ticks(7);

  return (
    <div ref={ref} className={s.wrap}>
      <svg className={s.svg} width={width} height={height}
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = delaunay.find(e.clientX - r.left, e.clientY - r.top); const d = visible[i]; setHover(d && Math.hypot(x(d.inputMB) - (e.clientX - r.left), y(d.seconds) - (e.clientY - r.top)) < 40 ? d : null); }}
        onMouseLeave={() => setHover(null)}>
        <defs><clipPath id="scatter-clip"><rect x={MARGIN.l} y={0} width={iw + 8} height={MARGIN.t + ih + 2} /></clipPath></defs>
        <g className={s.grid}>
          {y.ticks(5).map(t => <g key={t}><line className={t === 0 ? s.base : undefined} x1={MARGIN.l} x2={MARGIN.l + iw} y1={y(t)} y2={y(t)} /><text className={s.tick} x={MARGIN.l - 10} y={y(t)} dy="0.32em" textAnchor="end">{t} s</text></g>)}
          {ticksX.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={MARGIN.t + ih} y2={MARGIN.t + ih + 5} /><text className={s.tick} x={x(t)} y={MARGIN.t + ih + 18} textAnchor="middle">{+t.toFixed(1)} MB</text></g>)}
        </g>
        <g clipPath="url(#scatter-clip)">
          {fits.map(({ c, f }) => f && <line key={c} className={[s.fit, hidden.includes(c) && s.hidden].filter(Boolean).join(' ')} stroke={layoutToneVar[c]} x1={x(x.domain()[0])} y1={y(f.a + f.b * x.domain()[0])} x2={x(x.domain()[1])} y2={y(f.a + f.b * x.domain()[1])} />)}
          {h && <><line className={s.cross} x1={x(h.inputMB)} x2={x(h.inputMB)} y1={y(h.seconds)} y2={MARGIN.t + ih} /><line className={s.cross} x1={MARGIN.l} x2={x(h.inputMB)} y1={y(h.seconds)} y2={y(h.seconds)} /></>}
          {data.map((d, i) => {
            const hid = hidden.includes(d.layout); const isHover = !!h && h.file === d.file && h.inputMB === d.inputMB; const hl = highlight === d.file;
            return (
              <g key={d.file + i} className={[s.dot, hid && s.hidden].filter(Boolean).join(' ')} style={{ transform: `translate(${x(d.inputMB)}px, ${y(d.seconds)}px)` }}>
                {(isHover || hl) && <circle className={s.halo} r={14} fill={layoutToneVar[d.layout]} />}
                <circle r={isHover ? 7 : 5} fill={layoutToneVar[d.layout]} style={{ animationDelay: `calc(var(--dur-chart) * ${(i / data.length) * 0.5})` }} />
              </g>
            );
          })}
        </g>
      </svg>
      <FloatingTip show={!!h} x={h ? x(h.inputMB) : 0} y={h ? y(h.seconds) : 0} bounds={{ w: width, h: height }} title={h?.file} detail={h ? `${h.inputMB} MB · ${h.seconds.toFixed(1)} s · ${layoutGroupLabel[h.layout]}` : undefined} />
      <div className={s.overview} onDoubleClick={() => setZoom(null)}>
        <svg width={width} height={44} style={{ position: 'absolute', inset: 0 }}>
          {data.map((d, i) => <circle key={i} cx={ox(d.inputMB)} cy={40 - (d.seconds / maxY) * 36} r={2} fill={layoutToneVar[d.layout]} opacity={hidden.includes(d.layout) ? 0.2 : 1} />)}
          <g ref={brushRef} />
        </svg>
        <span className={s.overviewLabel} style={{ left: 12 }}>OVERVIEW</span>
        <span className={s.overviewLabel} style={{ right: 12 }}>{zoom ? `${zoom[0].toFixed(0)}–${zoom[1].toFixed(0)} MB · double-click to reset` : 'Drag to zoom'}</span>
      </div>
    </div>
  );
}
