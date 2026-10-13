/** Per-track channel mixer state (gain / mute / solo) shown in the channel lanes. */
import { create } from 'zustand';
import { engine, usePlayer, type Which } from '@/audio/engine';

export interface LaneState { gainDb: number; mute: boolean; solo: boolean; }
interface MixerState {
  lanes: Record<string, LaneState[]>;
  get: (key: string, ch: number) => LaneState;
  /** key = mixKey(trackId, which) */
  update: (key: string, ch: number, channels: number, patch: Partial<LaneState>) => void;
}
const def: LaneState = { gainDb: 0, mute: false, solo: false };

export const useMixer = create<MixerState>((set, get) => ({
  lanes: {},
  get: (trackId, ch) => get().lanes[trackId]?.[ch] ?? def,
  update: (key, ch, channels, patch) => {
    set(s => { const cur = s.lanes[key] ?? Array.from({ length: channels }, () => ({ ...def })); const next = cur.map((l, i) => (i === ch ? { ...l, ...patch } : l)); return { lanes: { ...s.lanes, [key]: next } }; });
    push(key);
  },
}));

export function linearGains(trackId: string, channels: number) {
  const lanes = useMixer.getState().lanes[trackId] ?? [];
  const anySolo = lanes.some(l => l?.solo);
  return Array.from({ length: channels }, (_, i) => { const l = lanes[i] ?? def; if (l.mute || (anySolo && !l.solo)) return 0; return Math.pow(10, l.gainDb / 20); });
}
/** Mixer key: the source lanes and the DTS output lanes have separate mute / solo / gain (their channel layouts can differ). */
export const mixKey = (trackId: string, which: Which) => (which === 'dts' ? `${trackId}:dts` : trackId);
const MAX_CH = 8;
function push(key: string) { const p = usePlayer.getState(); if (p.trackId && mixKey(p.trackId, p.which) === key) engine.setChannelGains(linearGains(key, MAX_CH)); }
// apply the lanes of whatever is playing — on track change and when A/B switches between source and DTS
usePlayer.subscribe((p, prev) => { if (p.trackId && (p.trackId !== prev.trackId || p.which !== prev.which)) engine.setChannelGains(linearGains(mixKey(p.trackId, p.which), MAX_CH)); });
