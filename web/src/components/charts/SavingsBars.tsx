import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CompareStats } from '@/api/types';
import { Tag } from '../ui/Tag';
import { useMotion } from '@/hooks/useMotion';
import { layoutGroupLabel } from '@/lib/format';
import { layoutToneVar } from './useChartScales';
import { FloatingTip } from '../ui/Tooltip';
import s from './SavingsBars.module.css';

type Row = CompareStats['sessionFiles'][number];

/** Horizontal bars: % smaller (or MB before/after) per encoded file. */
export function SavingsBars({ rows, mode, onOpen }: { rows: Row[]; mode: 'percent' | 'mb'; onOpen: (trackId: string) => void }) {
  const m = useMotion();
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(null);
  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, []);
  const maxMB = Math.max(1, ...rows.map(r => r.inputMB));
  const pct = (r: Row) => (r.outputMB == null ? 0 : (1 - r.outputMB / r.inputMB) * 100);
  const ticks = mode === 'percent' ? ['0%', '25%', '50%', '75%', '100%'] : [0, 0.25, 0.5, 0.75, 1].map(f => `${Math.round(maxMB * f)} MB`);
  const vars = { '--name-w': '180px', '--val-w': '170px' } as CSSProperties;
  return (
    <div style={{ ...vars, position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <div className={s.axis}><span /><div className={s.ticks}>{ticks.map(t => <span key={t}>{t}</span>)}</div><span /></div>
      <AnimatePresence initial={false}>
        {rows.map((r, i) => {
          const width = mode === 'percent' ? pct(r) : ((r.outputMB ?? 0) / maxMB) * 100;
          const ghost = mode === 'mb' ? (r.inputMB / maxMB) * 100 : 0;
          return (
            <motion.div layout key={r.trackId} className={s.row} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: m.base, layout: m.spring }}
              onClick={() => onOpen(r.trackId)}
              onMouseMove={e => { const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); setHover({ row: r, x: e.clientX - host.left, y: e.clientY - host.top }); }}>
              <span className={s.name}><span className={s.dot} style={{ background: layoutToneVar[r.layout] }} /><span className="truncate">{r.file}</span></span>
              <span className={s.track}>
                {[25, 50, 75].map(g => <span key={g} className={s.gridline} style={{ left: `${g}%` }} />)}
                {r.status === 'failed' ? <span className={s.failed}>Encode failed — {r.reason ?? 'error'}</span> : <>
                  {mode === 'mb' && <span className={s.bar} style={{ width: mounted ? `${ghost}%` : 0, background: 'var(--border-default)', opacity: 0.6, transitionDelay: `calc(var(--dur-fast) * ${i * 0.3})` }} />}
                  <span className={s.bar} style={{ width: mounted ? `${width}%` : 0, background: layoutToneVar[r.layout], transitionDelay: `calc(var(--dur-fast) * ${i * 0.3})` }} />
                </>}
              </span>
              <span className={s.value}>
                {r.status === 'failed' ? <Tag tone="danger">Failed</Tag> : mode === 'percent'
                  ? <><span className={s.pct}>{pct(r).toFixed(1)}%</span><span className={s.mb}>{r.inputMB} → {r.outputMB} MB</span></>
                  : <><span className={s.pct}>{r.outputMB} MB</span><span className={s.mb}>of {r.inputMB} MB</span></>}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <FloatingTip show={!!hover && hover.row.status === 'done'} x={hover?.x ?? 0} y={hover?.y ?? 0} title={hover ? `${pct(hover.row).toFixed(1)}% smaller · ×${(hover.row.inputMB / (hover.row.outputMB || 1)).toFixed(2)}` : ''} detail={hover ? `${hover.row.inputMB} MB → ${hover.row.outputMB} MB · ${layoutGroupLabel[hover.row.layout]}` : undefined} />
    </div>
  );
}
