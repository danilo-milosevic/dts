/**
 * API client. Every network call in the app goes through `api.*`.
 * By default it talks to the Flask backend in /api (proxied by Vite in dev, same origin in production).
 * Set VITE_USE_MOCKS=true to run fully in the browser against the mock server instead (see API.md).
 */
import type { AppSettingsDto, Capabilities, CompareStats, EncodeSettings, Job, Preset, QueueState, Track } from './types';
import { ApiError } from './errors';
import { audioCache } from '@/audio/cache';
import type { StftParams, StftResult } from '@/audio/dsp';
import { saveFromServer } from '@/lib/save';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '');

// the mock server (and its timers) is only loaded when mocks are on
const mock = () => import('./mock/server');
const synth = () => import('@/audio/synth');

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, body: body == null ? undefined : isForm ? body : JSON.stringify(body), headers: isForm || body == null ? undefined : { 'Content-Type': 'application/json' } });
  } catch {
    throw new ApiError(0, 'Cannot reach the encoder server — is it running? (python api/run.py, or npm run api)');
  }
  if (!res.ok) throw new ApiError(res.status, (await res.text()) || res.statusText);
  return res;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (USE_MOCKS) return (await mock()).mockRequest<T>(method, path, body);
  const res = await send(method, path, body);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

let ctx: AudioContext | null = null;
const decoder = () => (ctx ??= new AudioContext());

async function fetchAudio(path: string): Promise<AudioBuffer> {
  const res = await send('GET', path);
  return decoder().decodeAudioData(await res.arrayBuffer());
}

const stftCache = new Map<string, Promise<StftResult>>();
/** Keeps the last few spectrograms so resizing back or toggling views doesn't refetch. Failed requests are not kept. */
function memoStft(url: string, load: (url: string) => Promise<StftResult>) {
  let p = stftCache.get(url);
  if (!p) {
    p = load(url); stftCache.set(url, p); p.catch(() => stftCache.delete(url));
    if (stftCache.size > 48) stftCache.delete(stftCache.keys().next().value!);
  }
  return p;
}

/** Encoded output exists on the server (vs. a client-side preview of the current settings). */
const encodedKey = (t: Track) => (t.output ? `enc:${t.output.sizeBytes}:${t.output.encodeSeconds}` : 'pre');

export const api = {
  tracks: {
    list: () => request<Track[]>('GET', '/api/tracks'),
    get: (id: string) => request<Track>('GET', `/api/tracks/${id}`),
    upload: (files: File[]) => { const fd = new FormData(); files.forEach(f => fd.append('files', f)); return request<Track[]>('POST', '/api/tracks', fd); },
    update: (id: string, patch: { name?: string; settings?: Partial<EncodeSettings> }) => request<Track>('PATCH', `/api/tracks/${id}`, patch),
    remove: (id: string) => request<{ ok: true }>('DELETE', `/api/tracks/${id}`),
    duplicate: (id: string) => request<Track>('POST', `/api/tracks/${id}/duplicate`),
    /** GET /api/tracks/:id/audio — decoded source audio (mock: synthesized). */
    audio: (t: Track) => audioCache.once(`src:${t.id}`, async () => {
      const cached = audioCache.getSource(t.id); if (cached) return cached;
      const buf = USE_MOCKS ? await (await synth()).synthesizeTrack(t) : await fetchAudio(`/api/tracks/${t.id}/audio`);
      audioCache.setSource(t.id, buf); return buf;
    }),
    /**
     * Audio for the DTS lane / A/B playback. Encoded tracks: GET /api/tracks/:id/output/audio (the real DTS output,
     * decoded back to WAV by the server). Not encoded yet: a band-limited preview of the current settings, made in the browser.
     */
    outputAudio: (t: Track) => {
      const kbps = t.output ? t.output.bitrateKbps : t.settings.bitrateKbps;
      const mono = t.settings.layout === '1.0' && t.channels > 1;
      return audioCache.once(`out:${t.id}:${kbps}:${mono ? 'mono' : 'ch'}:${encodedKey(t)}`, async () =>
        USE_MOCKS || !t.output ? (await synth()).simulateDtsOutput(await api.tracks.audio(t), kbps, mono) : fetchAudio(`/api/tracks/${t.id}/output/audio`));
    },
    /** True when the server can compute this lane's STFT (source always; output once encoded). */
    hasServerStft: (t: Track, which: 'source' | 'output') => !USE_MOCKS && (which === 'source' || (t.status === 'encoded' && !!t.output)),
    /** GET /api/tracks/:id/stft — spectrogram computed on the server, already binned to cols × rows. */
    stft: (t: Track, which: 'source' | 'output', channel: number | 'mix', p: StftParams): Promise<StftResult> => {
      const q = new URLSearchParams({ which, channel: String(channel), fftSize: String(p.fftSize), hop: String(p.hop), window: p.window, scale: p.scale, cols: String(p.cols), rows: String(p.rows) });
      if (p.fMin != null) q.set('fMin', String(p.fMin)); if (p.fMax != null) q.set('fMax', String(p.fMax));
      q.set('v', which === 'output' ? encodedKey(t) : 'src'); // new encode → new URL
      return memoStft(`/api/tracks/${t.id}/stft?${q}`, async url => {
        const res = await send('GET', url);
        const h = (k: string) => Number(res.headers.get(`X-Stft-${k}`));
        return { db: new Float32Array(await res.arrayBuffer()), cols: h('Cols'), rows: h('Rows'), maxDb: h('Max-Db'), fMin: h('F-Min'), fMax: h('F-Max'), duration: h('Duration') };
      });
    },
    /** GET /api/tracks/:id/output — save the encoded file (Save-as dialog where the browser supports it). */
    saveOutput: (t: Track) => {
      const name = t.output?.fileName ?? 'output.dts';
      const wav = name.toLowerCase().endsWith('.wav');
      return saveFromServer(`${BASE}/api/tracks/${t.id}/output`, name, wav ? { description: 'DTS in WAV', mime: 'audio/wav', ext: '.wav' } : { description: 'DTS audio', mime: 'audio/vnd.dts', ext: '.dts' });
    },
    /** GET /api/tracks/:id/output/audio?download=1 — save the DTS output decoded back to WAV. */
    saveDecoded: (t: Track) => saveFromServer(`${BASE}/api/tracks/${t.id}/output/audio?download=1`, (t.output?.fileName ?? t.name).replace(/(\.dts)?\.(wav|dts)$/i, '') + '.decoded.wav', { description: 'WAV audio', mime: 'audio/wav', ext: '.wav' }),
  },
  presets: {
    list: () => request<Preset[]>('GET', '/api/presets'),
    create: (p: Omit<Preset, 'id'>) => request<Preset>('POST', '/api/presets', p),
  },
  jobs: {
    list: () => request<{ jobs: Job[]; queue: QueueState }>('GET', '/api/jobs'),
    create: (trackIds: string[], settings?: Partial<EncodeSettings>) => request<Job[]>('POST', '/api/jobs', { trackIds, settings }),
    cancel: (id: string) => request<{ ok: true }>('POST', `/api/jobs/${id}/cancel`),
    retry: (id: string) => request<Job>('POST', `/api/jobs/${id}/retry`),
    reorder: (ids: string[]) => request<Job[]>('PUT', '/api/jobs/order', { ids }),
    clearFinished: () => request<{ ok: true }>('DELETE', '/api/jobs/finished'),
  },
  queue: {
    start: () => request<QueueState>('POST', '/api/queue/start'),
    pause: () => request<QueueState>('POST', '/api/queue/pause'),
  },
  stats: { compare: () => request<CompareStats>('GET', '/api/stats/compare') },
  settings: {
    get: () => request<AppSettingsDto>('GET', '/api/settings'),
    update: (patch: Partial<AppSettingsDto>) => request<AppSettingsDto>('PUT', '/api/settings', patch),
  },
  capabilities: () => request<Capabilities>('GET', '/api/capabilities'),
};

export { ApiError };
