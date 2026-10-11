import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { getStft, type StftResult } from '@/audio/dsp';
import { api } from '@/api/client';
import { useData } from '@/store/data';
import { useElementSize } from '@/hooks/useElementSize';
import { usePlayhead, seekTo } from '@/hooks/usePlayhead';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { FloatingTip } from '../ui/Tooltip';
import { fmtFreq, fmtTime } from '@/lib/format';
import type { Which } from '@/audio/engine';
import s from './Spectrogram.module.css';

const hex = (v: string) => { const m = v.trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return [0, 0, 0]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** 256-entry color ramp built from the --spec-{palette}-0…6 tokens. */
function ramp(palette: 'src' | 'dts') {
  const cs = getComputedStyle(document.documentElement);
  const stops = Array.from({ length: 7 }, (_, i) => hex(cs.getPropertyValue(`--spec-${palette}-${i}`)));
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const t = (i / 255) * 6, k = Math.min(5, Math.floor(t)), f = t - k; for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f; }
  return lut;
}

const LABELS: [number, string][] = [[10000, '10k'], [5000, '5k'], [2000, '2k'], [1000, '1k'], [500, '500'], [200, '200'], [100, '100'], [50, '50 Hz']];

/** STFT spectrogram on canvas (computed in a worker). `compare` renders |source − compare| in dB. */
export function Spectrogram({ buffer, compare, channel, palette, trackId, which, label }: { buffer: AudioBuffer | null; compare?: AudioBuffer | null; channel: number | 'mix'; palette: 'src' | 'dts'; trackId: string; which: Which; label: string }) {
  const [ref, { width, height }] = useElementSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const stft = useUi(u => u.stft);
  const theme = useSettings(st => st.theme); const accent = useSettings(st => st.accent);
  const [data, setData] = useState<{ a: StftResult; b?: StftResult } | null>(null);
  const track = useData(d => d.tracks.find(t => t.id === trackId) ?? null);
  const serverKey = track ? `${track.status}:${track.output?.sizeBytes ?? ''}:${track.output?.encodeSeconds ?? ''}` : '';
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const cols = Math.min(1600, Math.max(64, Math.round(width))), rows = Math.max(32, Math.round(height));

  useEffect(() => {
    let live = true; if (!buffer || !width || !height) return;
    const p = { fftSize: stft.fftSize, hop: stft.hop, window: stft.window, scale: stft.scale, cols, rows };
    // computed on the server when it has the audio (source, encoded output); in the browser for the not-yet-encoded preview
    const get = (buf: AudioBuffer, src: 'source' | 'output') =>
      track && api.tracks.hasServerStft(track, src) ? api.tracks.stft(track, src, channel, p).catch(() => getStft(buf, channel, p)) : getStft(buf, channel, p);
    Promise.all([get(buffer, which === 'dts' ? 'output' : 'source'), compare ? get(compare, 'source') : Promise.resolve(undefined)]).then(([a, b]) => live && setData({ a, b }));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, compare, channel, cols, rows, stft.fftSize, stft.hop, stft.window, stft.scale, width, height, which, serverKey]);

  useEffect(() => {
    const c = canvas.current; if (!c || !data) return;
    c.width = data.a.cols; c.height = data.a.rows;
    const ctx = c.getContext('2d')!; const img = ctx.createImageData(c.width, c.height); const lut = ramp(palette);
    const { db, maxDb } = data.a; const floor = maxDb - stft.rangeDb; const diff = data.b?.db;
    for (let i = 0; i < db.length; i++) {
      const v = diff ? Math.min(1, Math.abs(db[i] - diff[i]) / 24) * (db[i] > floor ? 1 : 0.2) : (db[i] - floor) / stft.rangeDb;
      const k = Math.max(0, Math.min(255, Math.round(v * 255))) * 3; img.data[i * 4] = lut[k]; img.data[i * 4 + 1] = lut[k + 1]; img.data[i * 4 + 2] = lut[k + 2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [data, palette, stft.rangeDb, theme, accent]);

  const fMin = data?.a.fMin ?? 30, fMax = data?.a.fMax ?? 24000; const dur = buffer?.duration ?? 1;
  const yOf = useCallback((f: number) => stft.scale === 'log' ? (Math.log(fMax / f) / Math.log(fMax / fMin)) * height : (1 - (f - fMin) / (fMax - fMin)) * height, [fMax, fMin, height, stft.scale]);
  const fOf = (y: number) => (stft.scale === 'log' ? fMax * Math.pow(fMin / fMax, y / height) : fMax - (y / height) * (fMax - fMin));
  const paint = useCallback((sec: number, active: boolean) => { if (head.current) { head.current.style.left = `${(sec / dur) * 100}%`; head.current.style.opacity = active ? '1' : '0'; } }, [dur]);
  usePlayhead(trackId, paint, which);

  const pos = (e: MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: Math.max(0, Math.min(width, e.clientX - r.left)), y: Math.max(0, Math.min(height, e.clientY - r.top)) }; };
  const readout = useMemo(() => {
    if (!hover || !data) return null;
    const c = Math.min(data.a.cols - 1, Math.floor((hover.x / width) * data.a.cols)), r = Math.min(data.a.rows - 1, Math.floor((hover.y / height) * data.a.rows));
    const v = data.a.db[r * data.a.cols + c] - data.a.maxDb; const d = data.b ? data.b.db[r * data.a.cols + c] - data.a.db[r * data.a.cols + c] : null;
    return { title: `${fmtTime((hover.x / width) * dur, true)} · ${fmtFreq(fOf(hover.y))}`, detail: d != null ? `${v.toFixed(0)} dB · ${d >= 0 ? '+' : ''}${d.toFixed(1)} dB vs source` : `${v.toFixed(0)} dB` };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, data, width, height, dur]);

  return (
    <div ref={ref} className={s.spec} style={{ '--tone': palette === 'src' ? 'var(--accent-primary)' : 'var(--accent-dts)' } as CSSProperties} aria-label={`${label} spectrogram`}
      onMouseMove={e => setHover(pos(e))} onMouseLeave={() => setHover(null)} onClick={e => seekTo((pos(e).x / width) * dur)}>
      <canvas ref={canvas} className={s.canvas} style={{ opacity: data ? 1 : 0 }} />
      {!data && <div className={`${s.loading} skeleton`}>Computing STFT…</div>}
      {LABELS.filter(([f]) => f > fMin && f < fMax).map(([f, l]) => { const y = yOf(f); return y > 10 && y < height - 8 ? <span key={f}><span className={s.grid} style={{ top: y }} /><span className={s.freq} style={{ top: y }}>{l}</span></span> : null; })}
      <div ref={head} className={s.playhead} style={{ opacity: 0 }} />
      {hover && <><span className={s.cross} style={{ left: hover.x, top: 0, bottom: 0, width: 1 }} /><span className={s.cross} style={{ top: hover.y, left: 44, right: 0, height: 1 }} /><span className={s.probe} style={{ left: hover.x, top: hover.y }} /></>}
      <FloatingTip show={!!readout} x={hover?.x ?? 0} y={hover?.y ?? 0} title={readout?.title} detail={readout?.detail} bounds={{ w: width, h: height }} />
    </div>
  );
}
