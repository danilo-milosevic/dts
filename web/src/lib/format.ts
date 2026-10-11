import type { EncodeSettings, LayoutGroup, Track } from '@/api/types';

export const MB = 1_000_000; // decimal megabytes, as shown in the design
export const fmtMB = (bytes: number, digits = 1) => `${(bytes / MB).toFixed(digits)} MB`;
export const fmtTime = (sec: number, ms = false) => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return ms ? `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}` : `${String(m).padStart(2, '0')}:${String(Math.floor(r)).padStart(2, '0')}`;
};
export const fmtShortTime = (sec: number) => { const m = Math.floor(sec / 60); return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; };
export const fmtDuration = (sec: number) => (sec < 60 ? `${sec.toFixed(1)} s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`);
export const fmtKHz = (hz: number) => `${(hz / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kHz`;
export const fmtFreq = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`);
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const CODEC_LABEL = 'DTS Core';
export const layoutGroupLabel: Record<LayoutGroup, string> = { mono: 'Mono', stereo: 'Stereo', surround: 'Surround' };

export const trackMeta = (t: Track) => `${fmtTime(t.durationSec)} · ${fmtKHz(t.sampleRate)} · ${t.bitDepth}-bit${t.floatingPoint ? ' float' : ''} · ${t.layout}`;

export const layoutGroupOf = (channels: number): LayoutGroup => (channels <= 1 ? 'mono' : channels === 2 ? 'stereo' : 'surround');

export const layoutChannels = (l: EncodeSettings['layout'], track: Track) => (l === 'auto' ? track.channels : l === '1.0' ? 1 : l === '2.0' ? 2 : l === '5.1' ? 6 : 8);

/** Rough output estimate used by the inspector and the mock server alike. */
export function estimateOutput(track: Track, s: EncodeSettings) {
  const ch = layoutChannels(s.layout, track);
  const srcKbps = (track.sampleRate * track.bitDepth * track.channels) / 1000;
  const kbps = Math.min(s.bitrateKbps, srcKbps * (ch / track.channels));
  const bytes = (kbps * 1000 * track.durationSec) / 8;
  const ratio = track.sizeBytes / Math.max(bytes, 1);
  const mb = track.sizeBytes / MB;
  const encodeSec = 0.5 + 0.15 * mb;
  return { bytes, kbps, ratio, savedPct: Math.max(0, (1 - bytes / track.sizeBytes) * 100), encodeSec };
}

export const outputName = (track: Track, s: EncodeSettings) => track.name.replace(/\.(wav|bwf)$/i, '') + (s.container === 'wav' ? '.dts.wav' : '.dts');
export const presetLabel = (s: EncodeSettings) => `${CODEC_LABEL} · ${s.layout === 'auto' ? 'Auto' : s.layout === '1.0' ? 'Mono' : s.layout} · ${s.bitrateKbps} kbps`;

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
