import { useEffect, useRef } from 'react';
import { engine, usePlayer, type Which } from '@/audio/engine';
import s from './Meter.module.css';

const SEGMENTS = 18;
const FLOOR = -54; // dBFS at the bottom segment
const zone = (i: number) => (i >= 16 ? 'high' : i >= 12 ? 'mid' : 'low');
const litFor = (db: number) => Math.max(0, Math.min(SEGMENTS, Math.round(((db - FLOOR) / -FLOOR) * SEGMENTS)));

/**
 * Segmented peak meter. While the given track plays it follows the live analyser of `channel`;
 * otherwise it shows the static `idleDb` (the track's measured level).
 */
export function Meter({ trackId, channels, idleDb = -60, which }: { trackId: string; channels: number[]; idleDb?: number; which?: Which }) {
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  // live only while this lane's audio (source or DTS output) is the one playing
  const playing = usePlayer(p => p.playing && p.trackId === trackId && (!which || p.which === which));

  useEffect(() => {
    const paint = (col: HTMLDivElement | null, db: number, hold: number) => {
      if (!col) return; const lit = litFor(db), h = litFor(hold) - 1;
      for (let i = 0; i < SEGMENTS; i++) { const el = col.children[i] as HTMLElement; el.dataset.on = String(i < lit); el.dataset.hold = String(i === h && i >= lit); }
    };
    if (!playing) { cols.current.forEach(c => paint(c, idleDb, -100)); return; }
    let raf = 0; const holds = channels.map(() => ({ db: -100, t: 0 }));
    const loop = (now: number) => {
      const lv = engine.levels();
      channels.forEach((ch, i) => {
        const l = lv[Math.min(ch, lv.length - 1)]; const db = l ? l.peak : -100; const hd = holds[i];
        if (db > hd.db || now - hd.t > 900) { hd.db = db; hd.t = now; }
        paint(cols.current[i], db, hd.db);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, channels.join(','), idleDb]);

  return (
    <div className={s.meters} aria-hidden>
      {channels.map((ch, i) => (
        <div key={ch + ':' + i} className={s.col} ref={el => (cols.current[i] = el)}>
          {Array.from({ length: SEGMENTS }, (_, k) => <div key={k} className={s.seg} data-zone={zone(k)} data-on="false" />)}
        </div>
      ))}
    </div>
  );
}
