/**
 * Mock-only: preview audio for seeded tracks (rendered in synth.worker.ts) and a simulated
 * DTS decode, so waveforms, meters, playback and the STFT view work without a backend.
 * Real uploads skip this and use the decoded file.
 */
import type { Track } from '@/api/types';
import type { SynthRequest, SynthResponse } from './synth.worker';

/** Preview sample rate: full 48 kHz for short files, 24 kHz for long ones to keep memory low. */
export const previewRate = (t: Track) => (t.durationSec > 120 ? 24000 : 48000);

let worker: Worker | null = null; let seq = 0;
const waiting = new Map<number, (r: SynthResponse) => void>();

/** Renders preview audio for a seeded track in a worker and wraps it in an AudioBuffer. */
export async function synthesizeTrack(t: Track): Promise<AudioBuffer> {
  if (!worker) { worker = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' }); worker.onmessage = (e: MessageEvent<SynthResponse>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); }; }
  const id = ++seq; const sr = previewRate(t);
  const req: SynthRequest = { id, seed: t.synth?.seed ?? 1, style: t.synth?.style ?? 'music', duration: t.durationSec, sampleRate: sr, channels: t.channels === 1 ? 1 : 2, peakDb: t.peakDbfs };
  const res = await new Promise<SynthResponse>(r => { waiting.set(id, r); worker!.postMessage(req); });
  const buf = new AudioBuffer({ length: res.channels[0].length, numberOfChannels: res.channels.length, sampleRate: sr });
  res.channels.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}

/** Preview of a DTS Core encode before it exists: the source band-limited the way the bitrate would (mono = downmixed). */
export async function simulateDtsOutput(src: AudioBuffer, kbps: number, mono = false): Promise<AudioBuffer> {
  // a 1-channel destination downmixes the source to mono
  const ctx = new OfflineAudioContext(mono ? 1 : src.numberOfChannels, src.length, src.sampleRate);
  const s = ctx.createBufferSource(); s.buffer = src;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(src.sampleRate / 2 - 100, kbps >= 1500 ? 20000 : kbps >= 768 ? 16000 : 12000);
  const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 14000; shelf.gain.value = kbps >= 1500 ? -2 : -6;
  s.connect(lp); lp.connect(shelf); shelf.connect(ctx.destination); s.start();
  return ctx.startRendering();
}
