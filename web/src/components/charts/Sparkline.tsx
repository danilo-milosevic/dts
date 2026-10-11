import { useMemo } from 'react';
import { area, curveMonotoneX, line, scaleLinear } from 'd3';
import s from './charts.module.css';

export function Sparkline({ values, color, width = 120, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  const { d, a } = useMemo(() => {
    const x = scaleLinear().domain([0, Math.max(1, values.length - 1)]).range([2, width - 2]);
    const y = scaleLinear().domain([Math.min(...values), Math.max(...values) || 1]).range([height - 4, 4]);
    return { d: line<number>().x((_, i) => x(i)).y(v => y(v)).curve(curveMonotoneX)(values) ?? '', a: area<number>().x((_, i) => x(i)).y0(height).y1(v => y(v)).curve(curveMonotoneX)(values) ?? '' };
  }, [values, width, height]);
  return (
    <svg width={width} height={height} className={s.svg} aria-hidden>
      <path d={a} fill={color} className={s.area} style={{ opacity: 0.16 }} />
      <path d={d} stroke={color} className={`${s.line} ${s.draw}`} style={{ strokeWidth: 2, ['--len' as string]: 400 }} />
    </svg>
  );
}
