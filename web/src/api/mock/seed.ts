import type { CompareStats, EncodeSettings, Job, LayoutGroup, Preset, Track } from '../types';
import { estimateOutput, outputName, presetLabel } from '@/lib/format';

export const defaultSettings: EncodeSettings = {
  presetId: 'bluray-stereo',
  codec: 'core',
  bitrateKbps: 1509,
  bitDepth: 24,
  layout: '2.0',
  downmix: 'loro',
  generateLfe: false,
  drc: 'film-standard',
  limiter: true,
  container: 'dts',
  outputFolder: '~/Music/DTS Exports',
  keepOriginal: true,
};

export const presets: Preset[] = [
  { id: 'bluray-stereo', name: 'Blu-ray stereo', description: 'DTS Core · 1509 kbps · 2.0', tag: 'Core', tone: 'dts', icon: 'headphones', settings: { codec: 'core', bitrateKbps: 1509, layout: '2.0', container: 'dts' } },
  { id: 'bluray-51', name: 'Blu-ray 5.1', description: 'DTS Core · 1509 kbps · 5.1', tag: 'Surround', tone: 'success', icon: 'surround', settings: { codec: 'core', bitrateKbps: 1509, layout: '5.1', container: 'dts' } },
  { id: 'dts-cd', name: 'DTS-CD / DTS-WAV', description: 'DTS Core · 1411 kbps · 5.1 · .wav', tag: 'WAV', tone: 'info', icon: 'library_music', settings: { codec: 'core', bitrateKbps: 1411, layout: '5.1', container: 'wav' } },
  { id: 'game-audio', name: 'Game audio', description: 'DTS Core · 768 kbps · 5.1 · small files', tag: 'Compact', tone: 'accent', icon: 'bolt', settings: { codec: 'core', bitrateKbps: 768, layout: '5.1', container: 'dts' } },
  { id: 'dialog-mono', name: 'Dialog mono', description: 'DTS Core · 384 kbps · 1.0', tag: 'Mono', tone: 'accent', icon: 'graphic_eq', settings: { codec: 'core', bitrateKbps: 384, layout: '1.0', container: 'dts' } },
];

const bytesOf = (sr: number, bits: number, ch: number, sec: number) => Math.round((sr * bits * ch * sec) / 8);
const t0 = new Date(); t0.setHours(17, 41, 0, 0);
const at = (sec: number) => new Date(t0.getTime() + sec * 1000).toISOString();

function track(id: string, name: string, dur: number, sr: number, bits: 16 | 24 | 32, ch: number, layout: Track['layout'], style: NonNullable<Track['synth']>['style'], seed: number, extra: Partial<Track> = {}): Track {
  return {
    id, name, format: 'WAV', durationSec: dur, sampleRate: sr, bitDepth: bits, channels: ch, layout,
    sizeBytes: bytesOf(sr, bits, ch, dur), bitrateKbps: Math.round((sr * bits * ch) / 1000),
    peakDbfs: -0.3, loudnessLufs: -14.2, status: 'raw', createdAt: at(-600 + seed), settings: { ...defaultSettings }, synth: { seed, style }, ...extra,
  };
}

export function seedTracks(): Track[] {
  return [
    track('trk_01', 'Track01.wav', 85.42, 48000, 24, 2, 'Stereo', 'music', 1),
    track('trk_02', 'Track02_intro.wav', 30, 48000, 24, 2, 'Stereo', 'music', 2, { status: 'encoding', peakDbfs: -0.2, loudnessLufs: -13.1 }),
    track('trk_03', 'Ambience_5.1.wav', 310, 48000, 24, 6, '5.1', 'ambience', 3, { status: 'encoded', peakDbfs: -6.1, loudnessLufs: -24.8, settings: { ...defaultSettings, presetId: 'bluray-51', layout: '5.1' } }),
    track('trk_04', 'Dialog_take3.wav', 47, 48000, 16, 1, 'Mono', 'dialog', 4, { status: 'queued', peakDbfs: -3.4, loudnessLufs: -19.6, settings: { ...defaultSettings, bitrateKbps: 384, layout: 'auto' } }),
    track('trk_05', 'Score_cue_12.wav', 156, 96000, 24, 2, 'Stereo', 'score', 5, { status: 'encoded', peakDbfs: -1.1, loudnessLufs: -18.4, settings: { ...defaultSettings, presetId: null, bitrateKbps: 1509 } }),
    track('trk_06', 'FX_impacts.wav', 22, 44100, 16, 2, 'Stereo', 'fx', 6, { status: 'queued', peakDbfs: -0.8, loudnessLufs: -16.0, settings: { ...defaultSettings, bitrateKbps: 768 } }),
    track('trk_07', 'Track07.wav', 245, 48000, 32, 2, 'Stereo', 'music', 7, { status: 'error', floatingPoint: true, peakDbfs: 2.4, loudnessLufs: -9.8, error: '32-bit float input clips above 0 dBFS' }),
  ];
}

export function seedJobs(tracks: Track[]): Job[] {
  const byId = Object.fromEntries(tracks.map(t => [t.id, t]));
  const job = (n: number, trackId: string, status: Job['status'], progress: number, started: number | null, finished: number | null, error: string | null = null): Job => {
    const t = byId[trackId]; const s = t.settings; const est = estimateOutput(t, s);
    const done = status === 'done';
    if (done) t.output = { fileName: outputName(t, s), sizeBytes: Math.round(est.bytes), codec: s.codec, bitrateKbps: s.bitrateKbps, encodeSeconds: est.encodeSec };
    return {
      id: `job_${n}`, trackId, trackName: t.name, outputName: outputName(t, s), presetLabel: presetLabel(s), settings: s, status, progress,
      etaSec: status === 'encoding' ? est.encodeSec * (1 - progress) : null, inputBytes: t.sizeBytes, outputBytes: done ? Math.round(est.bytes) : null,
      ratio: done ? est.ratio : null, encodeSeconds: done ? est.encodeSec : null, createdAt: at(0), startedAt: started == null ? null : at(started), finishedAt: finished == null ? null : at(finished), error, order: n,
    };
  };
  return [
    job(1, 'trk_02', 'encoding', 0.42, 70, null),
    job(2, 'trk_04', 'queued', 0, null, null),
    job(3, 'trk_06', 'queued', 0, null, null),
    job(4, 'trk_03', 'done', 1, 0, 58),
    job(5, 'trk_05', 'done', 1, 58, 79),
    job(6, 'trk_07', 'failed', 0.31, 7, 9, '32-bit float input clips above 0 dBFS — normalize or enable the limiter'),
  ];
}


/** Historical encodes shown in Compare → "Encode time vs file size" (from compare-data.json). */
export const historicalEncodes: CompareStats['encodes'] = [
  ['FX_old_v1.wav', 'stereo', 3.9, 1.1], ['Dialog_v2.wav', 'mono', 4.5, 1.2], ['Intro_v1.wav', 'stereo', 8.7, 1.8], ['Track01_v1.wav', 'stereo', 24.6, 4.2],
  ['Foley_pass2.wav', 'stereo', 41, 6.9], ['Crowd_loop.wav', 'surround', 58, 9.4], ['Trailer_mix.wav', 'surround', 120, 18.6], ['Reel3_stems.wav', 'surround', 160, 24.1], ['Episode_04.wav', 'surround', 210, 32.3],
  ['Sting_01.wav', 'mono', 12, 3.1], ['Theme_alt.wav', 'stereo', 33, 6.2], ['Suite_movt2.wav', 'stereo', 140, 22.0], ['Live_set_A.wav', 'stereo', 205, 31.9],
  ['Room_tone_5.1.wav', 'surround', 18, 4.1], ['Rain_5.1.wav', 'surround', 52, 9.0], ['Battle_7.1.wav', 'surround', 120, 19.6], ['VO_take12.wav', 'mono', 26, 4.4],
].map(([file, layout, inputMB, seconds]) => ({ file: file as string, layout: layout as LayoutGroup, inputMB: inputMB as number, seconds: seconds as number }));

