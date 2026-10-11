/** Promise wrapper around the DSP worker, with result caching per buffer + parameters. */
import type { DspRequest, DspResponse } from './dsp.worker';

const POOL = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
const workers = Array.from({ length: POOL }, () => new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' }));
let next = 0, seq = 0;
const waiting = new Map<number, (r: DspResponse) => void>();
workers.forEach(w => (w.onmessage = (e: MessageEvent<DspResponse>) => { const cb = waiting.get(e.data.id); waiting.delete(e.data.id); cb?.(e.data); }));

type Without<T> = T extends unknown ? Omit<T, 'id'> : never;
function run(q: Without<DspRequest>): Promise<DspResponse> {
  const id = ++seq; const w = workers[next++ % workers.length];
  return new Promise(res => { waiting.set(id, res); w.postMessage({ ...q, id }); });
}

const bufIds = new WeakMap<AudioBuffer, number>(); let bufSeq = 0;
const idOf = (b: AudioBuffer) => { let i = bufIds.get(b); if (!i) { i = ++bufSeq; bufIds.set(b, i); } return i; };
const cache = new Map<string, Promise<unknown>>();
const memo = <T,>(k: string, f: () => Promise<T>): Promise<T> => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) as Promise<T>; };

/** Copy of one channel (or a mono mix) so the original stays usable for playback. */
function channelData(b: AudioBuffer, ch: number | 'mix') {
  if (ch !== 'mix') return b.getChannelData(Math.min(ch, b.numberOfChannels - 1)).slice();
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels; }
  return out;
}

export function getPeaks(b: AudioBuffer, ch: number | 'mix', bars: number) {
  return memo(`p:${idOf(b)}:${ch}:${bars}`, async () => {
    const r = await run({ type: 'peaks', data: channelData(b, ch), bars });
    if (r.type !== 'peaks') throw new Error('peaks failed'); return { peaks: r.peaks, rms: r.rms };
  });
}

export interface StftParams { fftSize: number; hop: number; window: 'hann' | 'hamming' | 'blackman'; scale: 'log' | 'linear'; cols: number; rows: number; fMin?: number; fMax?: number; }
export interface StftResult { db: Float32Array; cols: number; rows: number; maxDb: number; fMin: number; fMax: number; duration: number; }

export function getStft(b: AudioBuffer, ch: number | 'mix', p: StftParams): Promise<StftResult> {
  const fMin = p.fMin ?? (p.scale === 'log' ? 30 : 0), fMax = Math.min(p.fMax ?? 24000, b.sampleRate / 2);
  return memo(`s:${idOf(b)}:${ch}:${JSON.stringify(p)}`, async () => {
    const r = await run({ type: 'stft', data: channelData(b, ch), sampleRate: b.sampleRate, fftSize: p.fftSize, hop: p.hop, cols: p.cols, rows: p.rows, fMin: Math.max(fMin, 1), fMax, scale: p.scale, window: p.window });
    if (r.type !== 'stft') throw new Error('stft failed');
    return { db: r.db, cols: r.cols, rows: r.rows, maxDb: r.maxDb, fMin: Math.max(fMin, 1), fMax, duration: b.duration };
  });
}
