/** Server state (tracks, presets, jobs, queue) with polling while the queue is busy. */
import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type { Capabilities, EncodeSettings, Job, Preset, QueueState, Track } from '@/api/types';
import { useUi } from './ui';
import { fmtMB } from '@/lib/format';

interface DataState {
  ready: boolean;
  tracks: Track[];
  presets: Preset[];
  jobs: Job[];
  queue: QueueState;
  /** What the server's encoder supports (null until loaded / when unknown → nothing is disabled). */
  capabilities: Capabilities | null;
  selectedId: string | null;
  uploading: number;
  /** ids added in this session, used to animate new rows in */
  freshIds: string[];
  init: () => Promise<void>;
  select: (id: string | null) => void;
  upload: (files: File[]) => Promise<Track[]>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  updateSettings: (id: string, patch: Partial<EncodeSettings>) => void;
  applyPreset: (id: string, presetId: string) => void;
  encode: (ids: string[]) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  reorderJobs: (ids: string[]) => Promise<void>;
  clearFinished: () => Promise<void>;
  startQueue: () => Promise<void>;
  pauseQueue: () => Promise<void>;
  refresh: () => Promise<void>;
}

const fail = (e: unknown, title: string) => useUi.getState().toast({ tone: 'error', title, message: e instanceof ApiError ? e.message : String(e) }, 7000);
const patchTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useData = create<DataState>((set, get) => ({
  ready: false,
  tracks: [],
  presets: [],
  jobs: [],
  queue: { running: false, workers: 4, maxWorkers: 8, startedAt: null },
  capabilities: null,
  selectedId: null,
  uploading: 0,
  freshIds: [],

  init: async () => {
    try {
      const [tracks, presets, { jobs, queue }, capabilities] = await Promise.all([api.tracks.list(), api.presets.list(), api.jobs.list(), api.capabilities().catch(() => null)]);
      set({ tracks, presets, jobs, queue, capabilities, ready: true, selectedId: tracks[0]?.id ?? null });
      startPolling();
    } catch (e) { fail(e, 'Could not load the library'); set({ ready: true }); }
  },
  select: id => set({ selectedId: id }),

  upload: async files => {
    set(s => ({ uploading: s.uploading + files.length }));
    try {
      const created = await api.tracks.upload(files);
      set(s => ({ tracks: [...created, ...s.tracks], freshIds: [...s.freshIds, ...created.map(t => t.id)], selectedId: created[0]?.id ?? s.selectedId }));
      useUi.getState().toast({ tone: 'success', title: `Added ${created.length} track${created.length === 1 ? '' : 's'}`, message: created.map(t => t.name).join(', ') });
      return created;
    } catch (e) { fail(e, 'Import failed'); return []; } finally { set(s => ({ uploading: s.uploading - files.length })); }
  },
  remove: async id => {
    const prev = get().tracks; const idx = prev.findIndex(t => t.id === id);
    set(s => ({ tracks: s.tracks.filter(t => t.id !== id), selectedId: s.selectedId === id ? (s.tracks[idx + 1] ?? s.tracks[idx - 1])?.id ?? null : s.selectedId }));
    try { await api.tracks.remove(id); } catch (e) { set({ tracks: prev }); fail(e, 'Could not remove track'); }
  },
  duplicate: async id => {
    try { const t = await api.tracks.duplicate(id); set(s => { const i = s.tracks.findIndex(x => x.id === id); const tracks = [...s.tracks]; tracks.splice(i + 1, 0, t); return { tracks, freshIds: [...s.freshIds, t.id] }; }); }
    catch (e) { fail(e, 'Could not duplicate track'); }
  },
  updateSettings: (id, patch) => {
    set(s => ({ tracks: s.tracks.map(t => (t.id === id ? { ...t, settings: { ...t.settings, ...patch, presetId: 'presetId' in patch ? patch.presetId ?? null : null } } : t)) }));
    clearTimeout(patchTimers.get(id));
    patchTimers.set(id, setTimeout(() => { const t = get().tracks.find(x => x.id === id); if (t) api.tracks.update(id, { settings: t.settings }).catch(e => fail(e, 'Could not save settings')); }, 400));
  },
  applyPreset: (id, presetId) => { const p = get().presets.find(x => x.id === presetId); if (p) get().updateSettings(id, { ...p.settings, presetId }); },

  encode: async ids => {
    try {
      const created = await api.jobs.create(ids);
      set(s => ({ jobs: [...s.jobs.filter(j => !created.some(c => c.trackId === j.trackId && j.status !== 'done')), ...created], tracks: s.tracks.map(t => (ids.includes(t.id) ? { ...t, status: 'queued' } : t)) }));
      if (!get().queue.running) await get().startQueue();
      startPolling();
      useUi.getState().toast({ tone: 'info', title: `Queued ${created.length} encode${created.length === 1 ? '' : 's'}`, message: created.map(j => j.outputName).join(', ') });
    } catch (e) { fail(e, 'Could not start encoding'); }
  },
  cancelJob: async id => { try { await api.jobs.cancel(id); await get().refresh(); } catch (e) { fail(e, 'Could not cancel'); } },
  retryJob: async id => { try { await api.jobs.retry(id); await get().refresh(); startPolling(); } catch (e) { fail(e, 'Could not retry'); } },
  reorderJobs: async ids => {
    set(s => ({ jobs: s.jobs.map(j => { const i = ids.indexOf(j.id); return i < 0 ? j : { ...j, order: i + 1 }; }) }));
    try { await api.jobs.reorder(ids); } catch (e) { fail(e, 'Could not reorder'); }
  },
  clearFinished: async () => { try { await api.jobs.clearFinished(); await get().refresh(); } catch (e) { fail(e, 'Could not clear'); } },
  startQueue: async () => { try { const queue = await api.queue.start(); set({ queue }); startPolling(); } catch (e) { fail(e, 'Could not start queue'); } },
  pauseQueue: async () => { try { const queue = await api.queue.pause(); set({ queue }); } catch (e) { fail(e, 'Could not pause queue'); } },

  refresh: async () => {
    const [{ jobs, queue }, tracks] = await Promise.all([api.jobs.list(), api.tracks.list()]);
    const before = get().jobs;
    set(s => ({ jobs, queue, tracks: mergeTracks(s.tracks, tracks) }));
    // notify on transitions
    for (const j of jobs) {
      const prev = before.find(b => b.id === j.id); if (!prev || prev.status === j.status) continue;
      if (j.status === 'done') useUi.getState().toast({ tone: 'success', title: 'Encoding complete', message: `${j.outputName} · ${fmtMB(j.inputBytes)} → ${fmtMB(j.outputBytes ?? 0)} · ×${j.ratio?.toFixed(2)}` });
      if (j.status === 'failed') useUi.getState().toast({ tone: 'error', title: `${j.trackName} failed`, message: j.error ?? undefined, action: { label: 'Retry', run: () => get().retryJob(j.id) } }, 9000);
    }
  },
}));

/** Keep local order (and fresh ids) while taking server fields. */
function mergeTracks(local: Track[], server: Track[]) {
  const byId = new Map(server.map(t => [t.id, t]));
  const kept = local.filter(t => byId.has(t.id)).map(t => ({ ...byId.get(t.id)!, settings: t.settings }));
  const added = server.filter(t => !local.some(l => l.id === t.id));
  return [...added, ...kept];
}

let timer: ReturnType<typeof setTimeout> | null = null;
function startPolling() {
  if (timer) return;
  const tick = async () => {
    try { await useData.getState().refresh(); } catch { /* keep polling */ }
    // keep polling while encodes run and while their format benchmarks are still being measured
    const busy = useData.getState().jobs.some(j => j.status === 'queued' || j.status === 'encoding' || j.benchmarkStatus === 'running');
    timer = busy ? setTimeout(tick, 500) : null;
  };
  timer = setTimeout(tick, 500);
}

export const selectedTrack = (s: DataState) => s.tracks.find(t => t.id === s.selectedId) ?? null;
