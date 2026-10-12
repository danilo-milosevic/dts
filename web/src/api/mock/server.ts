/**
 * In-browser mock backend. Implements every endpoint in API.md against an in-memory DB,
 * including a simulated encode queue that advances in real time.
 */
import type { AppSettingsDto, Capabilities, CompareStats, EncodeSettings, Job, Preset, QueueState, Track } from '../types';
import { defaultSettings, historicalEncodes, presets, seedJobs, seedTracks } from './seed';
import { MB, estimateOutput, layoutChannels, layoutGroupOf, matchPreset, outputName, presetLabel, uid } from '@/lib/format';
import { audioCache } from '@/audio/cache';
import { ApiError } from '../errors';


const db = {
  tracks: seedTracks(),
  jobs: [] as Job[],
  queue: { running: true, workers: 4, maxWorkers: 8, startedAt: new Date().toISOString() } as QueueState,
  settings: { outputDevice: 'default', bufferSize: 512, previewAfterEncode: true, defaults: { ...defaultSettings } } as AppSettingsDto,
};
db.jobs = seedJobs(db.tracks);

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** Settings name a preset only while they match it. */
const withPreset = (s: EncodeSettings): EncodeSettings => ({ ...s, presetId: matchPreset(s, presets) });
const now = () => new Date().toISOString();
const track = (id: string) => { const t = db.tracks.find(x => x.id === id); if (!t) throw new ApiError(404, 'Track not found'); return t; };
const job = (id: string) => { const j = db.jobs.find(x => x.id === id); if (!j) throw new ApiError(404, 'Job not found'); return j; };
/** Mock encodes run a little slower than the model so progress is visible. */
const mockSeconds = (t: Track, s: EncodeSettings) => Math.min(30, Math.max(4, estimateOutput(t, s).encodeSec * 1.5));

// ---------- queue simulation ----------
let last = performance.now();
setInterval(() => {
  const nowMs = performance.now(); const dt = (nowMs - last) / 1000; last = nowMs;
  if (!db.queue.running) return;
  const active = db.jobs.filter(j => j.status === 'encoding');
  const waiting = db.jobs.filter(j => j.status === 'queued').sort((a, b) => a.order - b.order);
  for (const j of waiting.slice(0, Math.max(0, db.queue.workers - active.length))) {
    j.status = 'encoding'; j.startedAt = now(); const t = track(j.trackId); t.status = 'encoding';
   
    active.push(j);
  }
  for (const j of active) {
    const t = db.tracks.find(x => x.id === j.trackId); if (!t) { j.status = 'cancelled'; continue; }
    const total = mockSeconds(t, j.settings);
    j.progress = Math.min(1, j.progress + dt / total);
    j.etaSec = total * (1 - j.progress);
    const willClip = t.floatingPoint && t.peakDbfs > 0 && !j.settings.limiter;
    if (willClip && j.progress >= 0.31) {
      j.status = 'failed'; j.progress = 0.31; j.etaSec = null; j.finishedAt = now(); j.error = `${t.bitDepth}-bit float input clips above 0 dBFS — normalize or enable the limiter`;
      t.status = 'error'; t.error = j.error;
      continue;
    }
    if (j.progress >= 1) {
      const est = estimateOutput(t, j.settings);
      j.status = 'done'; j.etaSec = null; j.finishedAt = now(); j.outputBytes = Math.round(est.bytes); j.ratio = est.ratio; j.encodeSeconds = est.encodeSec;
      // simulated decode back to WAV: ~1/6 of the encode time, PCM at the output layout
      j.decodeSeconds = +(est.encodeSec / 6).toFixed(2); j.decodedBytes = Math.round((Math.min(t.sampleRate, 48000) * t.bitDepth * layoutChannels(j.settings.layout, t) * t.durationSec) / 8);
      t.status = 'encoded'; t.error = undefined;
      t.output = { fileName: j.outputName, sizeBytes: j.outputBytes, codec: j.settings.codec, bitrateKbps: j.settings.bitrateKbps, encodeSeconds: est.encodeSec, decodeSeconds: j.decodeSeconds, decodedBytes: j.decodedBytes };
    }
  }
}, 200);

// ---------- WAV upload analysis ----------
function wavHeader(buf: ArrayBuffer) {
  const v = new DataView(buf);
  if (buf.byteLength < 44 || v.getUint32(0, false) !== 0x52494646) return null; // 'RIFF'
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = v.getUint32(off, false); const size = v.getUint32(off + 4, true);
    if (id === 0x666d7420) return { format: v.getUint16(off + 8, true), channels: v.getUint16(off + 10, true), sampleRate: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) }; // 'fmt '
    off += 8 + size + (size % 2);
  }
  return null;
}
async function analyzeUpload(file: File): Promise<Track> {
  const bytes = await file.arrayBuffer();
  const hdr = wavHeader(bytes);
  const ctx = new AudioContext();
  let audio: AudioBuffer;
  try { audio = await ctx.decodeAudioData(bytes.slice(0)); } catch { throw new ApiError(415, `${file.name}: unsupported or corrupt audio file`); } finally { ctx.close(); }
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i += 8) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; } }
  const ch = hdr?.channels ?? audio.numberOfChannels;
  const bits = (hdr?.bits ?? 16) as Track['bitDepth'];
  const sr = hdr?.sampleRate ?? audio.sampleRate;
  const t: Track = {
    id: uid('trk'), name: file.name, format: /\.bwf$/i.test(file.name) ? 'BWF' : 'WAV', sizeBytes: file.size, durationSec: audio.duration, sampleRate: sr,
    bitDepth: bits, floatingPoint: hdr?.format === 3, channels: ch, layout: ch === 1 ? 'Mono' : ch === 2 ? 'Stereo' : ch === 6 ? '5.1' : '7.1',
    bitrateKbps: Math.round((sr * bits * ch) / 1000), peakDbfs: +(20 * Math.log10(peak || 1e-6)).toFixed(1), loudnessLufs: +(20 * Math.log10(Math.sqrt(sum / Math.max(n, 1)) || 1e-6) - 0.7).toFixed(1),
    status: 'raw', createdAt: now(), settings: withPreset({ ...db.settings.defaults, layout: ch === 1 ? 'auto' : ch >= 6 ? '5.1' : '2.0' }),
  };
  audioCache.setSource(t.id, audio);
  return t;
}

// ---------- router ----------
type Handler = (params: Record<string, string>, body: unknown, query: URLSearchParams) => unknown | Promise<unknown>;
const routes: [string, RegExp, string[], Handler][] = [];
const route = (method: string, pattern: string, h: Handler) => {
  const keys: string[] = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push([method, re, keys, h]);
};

route('GET', '/api/tracks', () => db.tracks);
route('GET', '/api/tracks/:id', p => track(p.id));
route('POST', '/api/tracks', async (_p, body) => {
  const files = (body as FormData).getAll('files') as File[];
  if (!files.length) throw new ApiError(400, 'No files');
  const created: Track[] = [];
  for (const f of files) { const t = await analyzeUpload(f); db.tracks.unshift(t); created.push(t); }
  return created;
});
route('PATCH', '/api/tracks/:id', (p, body) => { const t = track(p.id); const b = body as Partial<Track>; if (b.settings) t.settings = { ...t.settings, ...b.settings }; if (b.name) t.name = b.name; return t; });
route('DELETE', '/api/tracks/:id', p => { track(p.id); db.tracks = db.tracks.filter(t => t.id !== p.id); db.jobs = db.jobs.filter(j => !(j.trackId === p.id && j.status !== 'done')); audioCache.drop(p.id); return { ok: true }; });
route('POST', '/api/tracks/:id/duplicate', p => {
  const t = track(p.id); const copy: Track = { ...clone(t), id: uid('trk'), name: t.name.replace(/(\.\w+)$/, ' copy$1'), status: 'raw', output: undefined, error: undefined, createdAt: now() };
  db.tracks.splice(db.tracks.indexOf(t) + 1, 0, copy); audioCache.alias(copy.id, t.id); return copy;
});
route('GET', '/api/presets', () => presets);
route('POST', '/api/presets', (_p, body) => { const p = { ...(body as Omit<Preset, 'id'>), id: uid('preset') }; presets.push(p); return p; });

route('GET', '/api/jobs', () => ({ jobs: db.jobs, queue: db.queue }));
route('POST', '/api/jobs', (_p, body) => {
  const b = body as { trackIds: string[]; settings?: Partial<EncodeSettings> };
  const created: Job[] = [];
  for (const id of b.trackIds) {
    const t = track(id); if (b.settings) t.settings = { ...t.settings, ...b.settings };
    db.jobs = db.jobs.filter(j => !(j.trackId === id && (j.status === 'queued' || j.status === 'failed')));
    const s = t.settings; const order = Math.max(0, ...db.jobs.map(j => j.order)) + 1;
    const j: Job = { id: uid('job'), trackId: id, trackName: t.name, outputName: outputName(t, s), presetLabel: presetLabel(s), settings: clone(s), status: 'queued', progress: 0, etaSec: null, inputBytes: t.sizeBytes, outputBytes: null, ratio: null, encodeSeconds: null, createdAt: now(), startedAt: null, finishedAt: null, error: null, order };
    db.jobs.push(j); t.status = 'queued'; t.error = undefined; created.push(j);
  }
 
  return created;
});
route('POST', '/api/jobs/:id/cancel', p => { const j = job(p.id); if (j.status === 'queued' || j.status === 'encoding') { j.status = 'cancelled'; j.etaSec = null; const t = db.tracks.find(x => x.id === j.trackId); if (t) t.status = 'raw'; } db.jobs = db.jobs.filter(x => x.id !== j.id); return { ok: true }; });
route('POST', '/api/jobs/:id/retry', p => { const j = job(p.id); const t = track(j.trackId); j.settings = clone(t.settings); j.presetLabel = presetLabel(t.settings); j.status = 'queued'; j.progress = 0; j.error = null; j.finishedAt = null; t.status = 'queued'; t.error = undefined; return j; });
route('PUT', '/api/jobs/order', (_p, body) => { (body as { ids: string[] }).ids.forEach((id, i) => { const j = db.jobs.find(x => x.id === id); if (j) j.order = i + 1; }); return db.jobs; });
route('DELETE', '/api/jobs/finished', () => { db.jobs = db.jobs.filter(j => j.status !== 'done' && j.status !== 'cancelled'); return { ok: true }; });
route('POST', '/api/queue/start', () => { db.queue.running = true; db.queue.startedAt = db.queue.startedAt ?? now(); return db.queue; });
route('POST', '/api/queue/pause', () => { db.queue.running = false; return db.queue; });


/** Output channel group of a job (what the Compare page groups by). */
const groupOf = (j: Job) => { const t = db.tracks.find(x => x.id === j.trackId); return layoutGroupOf(t ? layoutChannels(j.settings.layout, t) : 2); };
route('GET', '/api/stats/compare', () => {
  const done = db.jobs.filter(j => j.status === 'done' || j.status === 'failed');
  const sessionFiles: CompareStats['sessionFiles'] = done.map(j => { const t = db.tracks.find(x => x.id === j.trackId); return { trackId: j.trackId, file: j.trackName, layout: groupOf(j), inputMB: +(j.inputBytes / MB).toFixed(1), outputMB: j.outputBytes ? +(j.outputBytes / MB).toFixed(2) : null, status: j.status === 'done' ? 'done' : 'failed', reason: j.error ?? undefined, durationSec: t?.durationSec ?? 0, encodeSeconds: j.encodeSeconds, decodeSeconds: j.decodeSeconds ?? null, decodedMB: j.decodedBytes ? +(j.decodedBytes / MB).toFixed(2) : null }; });
  const encodes = [...historicalEncodes, ...done.filter(j => j.status === 'done').map(j => ({ file: j.trackName, layout: groupOf(j), inputMB: +(j.inputBytes / MB).toFixed(1), seconds: +(j.encodeSeconds ?? 0).toFixed(1), decodeSeconds: j.decodeSeconds ?? null }))];
  return { encodes, sessionFiles } satisfies CompareStats;
});

route('GET', '/api/capabilities', () => ({ encoder: 'mock', containers: ['dts', 'wav'], layouts: ['1.0', '2.0', '5.1', '7.1', 'auto'], maxChannels: 6, maxSampleRate: 48000, bitrateKbps: { min: { 1: 192, 2: 320, 3: 384, 4: 512, 5: 640, 6: 768 }, max: 3840 }, layoutNotes: { '7.1': 'DTS Core carries at most 5.1 — 7.1 sources are downmixed to 5.1.' } } satisfies Capabilities));
route('GET', '/api/settings', () => db.settings);
route('PUT', '/api/settings', (_p, body) => { db.settings = { ...db.settings, ...(body as Partial<AppSettingsDto>) }; db.settings.defaults = withPreset(db.settings.defaults); return db.settings; });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function mockRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const u = new URL(url, 'http://mock');
  await sleep(method === 'GET' ? 80 + Math.random() * 120 : 150 + Math.random() * 200);
  for (const [m, re, keys, h] of routes) {
    if (m !== method) continue; const match = u.pathname.match(re); if (!match) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    const res = await h(params, body, u.searchParams);
    return clone(res) as T;
  }
  throw new ApiError(404, `No mock route for ${method} ${u.pathname}`);
}
