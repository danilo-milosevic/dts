/** Per-track channel mixer state (gain / mute / solo) shown in the channel lanes. */
import { create } from 'zustand';
import { engine, usePlayer } from '@/audio/engine';

export interface LaneState { gainDb: number; mute: boolean; solo: boolean; }
interface MixerState {
  lanes: Record<string, LaneState[]>;
  get: (trackId: string, ch: number) => LaneState;
  update: (trackId: string, ch: number, channels: number, patch: Partial<LaneState>) => void;
}
const def: LaneState = { gainDb: 0, mute: false, solo: false };

export const useMixer = create<MixerState>((set, get) => ({
  lanes: {},
  get: (trackId, ch) => get().lanes[trackId]?.[ch] ?? def,
  update: (trackId, ch, channels, patch) => {
    set(s => { const cur = s.lanes[trackId] ?? Array.from({ length: channels }, () => ({ ...def })); const next = cur.map((l, i) => (i === ch ? { ...l, ...patch } : l)); return { lanes: { ...s.lanes, [trackId]: next } }; });
    push(trackId);
  },
}));

export function linearGains(trackId: string, channels: number) {
  const lanes = useMixer.getState().lanes[trackId] ?? [];
  const anySolo = lanes.some(l => l?.solo);
  return Array.from({ length: channels }, (_, i) => { const l = lanes[i] ?? def; if (l.mute || (anySolo && !l.solo)) return 0; return Math.pow(10, l.gainDb / 20); });
}
function push(trackId: string) { const p = usePlayer.getState(); if (p.trackId === trackId) engine.setChannelGains(linearGains(trackId, p.channels)); }
usePlayer.subscribe((p, prev) => { if (p.trackId && p.trackId !== prev.trackId) engine.setChannelGains(linearGains(p.trackId, p.channels)); });
