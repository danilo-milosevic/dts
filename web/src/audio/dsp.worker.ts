/// <reference lib="webworker" />
/** DSP worker: waveform peaks and STFT spectrograms, off the main thread. */

export type DspRequest =
  | { id: number; type: 'peaks'; data: Float32Array; bars: number }
  | { id: number; type: 'stft'; data: Float32Array; sampleRate: number; fftSize: number; hop: number; cols: number; rows: number; fMin: number; fMax: number; scale: 'log' | 'linear'; window: 'hann' | 'hamming' | 'blackman' };

export type DspResponse =
  | { id: number; type: 'peaks'; peaks: Float32Array; rms: Float32Array }
  | { id: number; type: 'stft'; db: Float32Array; cols: number; rows: number; maxDb: number }
  | { id: number; type: 'error'; message: string };

const tw = new Map<number, { cos: Float32Array; sin: Float32Array; rev: Uint32Array }>();
function tables(n: number) {
  let t = tw.get(n); if (t) return t;
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2), rev = new Uint32Array(n);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  const bits = Math.log2(n); for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1); rev[i] = r; }
  t = { cos, sin, rev }; tw.set(n, t); return t;
}
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length; const { cos, sin, rev } = tables(n);
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
      const a = i + j, b = a + half; const tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
function windowFn(kind: string, n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (2 * Math.PI * i) / (n - 1); w[i] = kind === 'hamming' ? 0.54 - 0.46 * Math.cos(x) : kind === 'blackman' ? 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x) : 0.5 - 0.5 * Math.cos(x); }
  return w;
}

function peaks(data: Float32Array, bars: number) {
  const p = new Float32Array(bars), r = new Float32Array(bars); const step = data.length / bars;
  for (let b = 0; b < bars; b++) {
    const s = Math.floor(b * step), e = Math.min(data.length, Math.floor((b + 1) * step)); let m = 0, sum = 0; const stride = Math.max(1, Math.floor((e - s) / 2048));
    let n = 0; for (let i = s; i < e; i += stride) { const a = Math.abs(data[i]); if (a > m) m = a; sum += data[i] * data[i]; n++; }
    p[b] = m; r[b] = Math.sqrt(sum / Math.max(1, n));
  }
  return { peaks: p, rms: r };
}

function stft(q: Extract<DspRequest, { type: 'stft' }>) {
  const { data, sampleRate, fftSize: n, cols, rows, fMin, fMax, scale } = q;
  const maxFrames = cols * 3;
  const hop = Math.max(q.hop, Math.ceil((data.length - n) / maxFrames));
  const frames = Math.max(1, Math.floor((data.length - n) / hop) + 1);
  const win = windowFn(q.window, n); const re = new Float32Array(n), im = new Float32Array(n);
  const binHz = sampleRate / n; const nyq = sampleRate / 2; const top = Math.min(fMax, nyq);
  // row → bin range
  const lo = new Uint32Array(rows), hi = new Uint32Array(rows);
  for (let r = 0; r < rows; r++) {
    const f0 = scale === 'log' ? fMin * Math.pow(top / fMin, (rows - 1 - r - 0.5) / rows) : fMin + (top - fMin) * ((rows - 1 - r - 0.5) / rows);
    const f1 = scale === 'log' ? fMin * Math.pow(top / fMin, (rows - r - 0.5) / rows) : fMin + (top - fMin) * ((rows - r - 0.5) / rows);
    lo[r] = Math.max(1, Math.floor(Math.max(0, f0) / binHz)); hi[r] = Math.max(lo[r], Math.min(n / 2 - 1, Math.ceil(f1 / binHz)));
  }
  const out = new Float32Array(rows * cols).fill(-200); const mag = new Float32Array(n / 2);
  let maxDb = -200;
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < n; i++) { re[i] = (data[off + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] = re[k] * re[k] + im[k] * im[k];
    const c = Math.min(cols - 1, Math.floor((f / frames) * cols));
    for (let r = 0; r < rows; r++) {
      let m = 0; for (let k = lo[r]; k <= hi[r]; k++) if (mag[k] > m) m = mag[k];
      const db = 10 * Math.log10(m / (n * n / 4) + 1e-14);
      const idx = r * cols + c; if (db > out[idx]) out[idx] = db; if (db > maxDb) maxDb = db;
    }
  }
  // fill empty columns (when frames < cols)
  for (let c = 1; c < cols; c++) if (out[c] === -200) for (let r = 0; r < rows; r++) out[r * cols + c] = out[r * cols + c - 1];
  return { db: out, maxDb };
}

self.onmessage = (e: MessageEvent<DspRequest>) => {
  const q = e.data;
  try {
    if (q.type === 'peaks') { const r = peaks(q.data, q.bars); (self as unknown as Worker).postMessage({ id: q.id, type: 'peaks', ...r } satisfies DspResponse, [r.peaks.buffer, r.rms.buffer]); }
    else { const r = stft(q); (self as unknown as Worker).postMessage({ id: q.id, type: 'stft', db: r.db, cols: q.cols, rows: q.rows, maxDb: r.maxDb } satisfies DspResponse, [r.db.buffer]); }
  } catch (err) { (self as unknown as Worker).postMessage({ id: q.id, type: 'error', message: String(err) } satisfies DspResponse); }
};
