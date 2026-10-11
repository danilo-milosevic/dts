/** Web Audio playback engine: play/pause/seek/loop, A/B source ↔ DTS, per-channel level meters. */
import { create } from 'zustand';

export type Which = 'source' | 'dts';
interface PlayerState { trackId: string | null; which: Which; playing: boolean; duration: number; volume: number; loop: boolean; channels: number; mono: boolean; }
export const usePlayer = create<PlayerState>(() => ({ trackId: null, which: 'source', playing: false, duration: 0, volume: 0.8, loop: false, channels: 2, mono: false }));

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let src: AudioBufferSourceNode | null = null;
let analysers: AnalyserNode[] = [];
let gains: GainNode[] = [];
let channelGains: number[] = [];
let mono = false;
let monoNode: GainNode | null = null;
let mergeNode: ChannelMergerNode | null = null;
let buffers: Partial<Record<Which, AudioBuffer>> = {};
let startedAt = 0; // ctx time when playback (re)started
let offset = 0;    // position (s) at startedAt
const tmp = new Float32Array(2048);

function ensure() {
  if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); master = ctx.createGain(); master.gain.value = usePlayer.getState().volume; master.connect(ctx.destination); }
  return ctx;
}

/** merge → (mono downmix) → master. A 1-channel 'speakers' gain node sums L/R (and surround) to mono. */
function route() {
  if (!ctx || !mergeNode) return;
  if (!monoNode) { monoNode = ctx.createGain(); monoNode.channelCount = 1; monoNode.channelCountMode = 'explicit'; monoNode.channelInterpretation = 'speakers'; monoNode.connect(master!); }
  mergeNode.disconnect();
  mergeNode.connect(mono ? monoNode : master!);
}

function buildGraph(buf: AudioBuffer) {
  const c = ensure();
  src?.disconnect(); analysers.forEach(a => a.disconnect());
  src = c.createBufferSource(); src.buffer = buf; src.loop = usePlayer.getState().loop;
  const n = buf.numberOfChannels;
  const split = c.createChannelSplitter(n); const merge = c.createChannelMerger(n);
  gains.forEach(g => g.disconnect());
  gains = Array.from({ length: n }, (_, i) => { const g = c.createGain(); g.gain.value = channelGains[i] ?? 1; return g; });
  analysers = Array.from({ length: n }, () => { const a = c.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0.6; return a; });
  src.connect(split);
  gains.forEach((g, i) => { split.connect(g, i); g.connect(merge, 0, i); g.connect(analysers[i]); });
  mergeNode?.disconnect(); mergeNode = merge; route();
  src.onended = () => { if (src?.buffer === buf && !src.loop && engine.currentTime() >= buf.duration - 0.05) { offset = 0; usePlayer.setState({ playing: false }); } };
}

export const engine = {
  /** Load source (and optionally DTS) buffers for a track. Keeps position when the same track is reloaded. */
  load(trackId: string, source: AudioBuffer, dts?: AudioBuffer) {
    const st = usePlayer.getState();
    const same = st.trackId === trackId;
    if (!same) { this.stop(); offset = 0; }
    buffers = { source, dts };
    usePlayer.setState({ trackId, duration: source.duration, channels: source.numberOfChannels, which: same ? st.which : 'source' });
  },
  setDts(dts: AudioBuffer) { buffers.dts = dts; },
  async play() {
    const c = ensure(); if (c.state === 'suspended') await c.resume();
    const st = usePlayer.getState(); const buf = buffers[st.which] ?? buffers.source; if (!buf) return;
    if (st.playing) return;
    buildGraph(buf); if (offset >= buf.duration) offset = 0;
    src!.start(0, offset); startedAt = c.currentTime; usePlayer.setState({ playing: true });
  },
  pause() { if (!usePlayer.getState().playing) return; offset = this.currentTime(); try { src?.stop(); } catch { /* already stopped */ } usePlayer.setState({ playing: false }); },
  stop() { try { src?.stop(); } catch { /* noop */ } offset = 0; usePlayer.setState({ playing: false }); },
  toggle() { return usePlayer.getState().playing ? this.pause() : this.play(); },
  seek(sec: number) {
    const playing = usePlayer.getState().playing; if (playing) { try { src?.stop(); } catch { /* noop */ } usePlayer.setState({ playing: false }); }
    offset = Math.max(0, Math.min(sec, usePlayer.getState().duration)); if (playing) this.play();
  },
  skip(delta: number) { this.seek(this.currentTime() + delta); },
  setWhich(which: Which) {
    if (which === usePlayer.getState().which) return;
    const playing = usePlayer.getState().playing; const pos = this.currentTime();
    if (playing) { try { src?.stop(); } catch { /* noop */ } }
    usePlayer.setState({ which, playing: false }); offset = pos; if (playing) this.play();
  },
  /** Linear gain per channel (mute/solo/gain from the channel lanes). */
  setChannelGains(g: number[]) { channelGains = g; if (ctx) gains.forEach((node, i) => node.gain.setTargetAtTime(g[i] ?? 1, ctx!.currentTime, 0.015)); },
  /** Downmix playback to mono (Convert to mono). */
  setMono(on: boolean) { if (on === mono) return; mono = on; usePlayer.setState({ mono: on }); route(); },
  setVolume(v: number) { usePlayer.setState({ volume: v }); if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
  setLoop(loop: boolean) { usePlayer.setState({ loop }); if (src) src.loop = loop; },
  currentTime() {
    const st = usePlayer.getState(); if (!st.playing || !ctx) return offset;
    const t = offset + (ctx.currentTime - startedAt); return st.loop ? t % st.duration : Math.min(t, st.duration);
  },
  /** Per-channel levels in dBFS (rms, peak). Empty when not playing. */
  levels(): { rms: number; peak: number }[] {
    if (!usePlayer.getState().playing) return [];
    const lv = analysers.map(a => { a.getFloatTimeDomainData(tmp); let p = 0, s = 0; for (let i = 0; i < tmp.length; i++) { const v = Math.abs(tmp[i]); if (v > p) p = v; s += v * v; } return { rms: 20 * Math.log10(Math.sqrt(s / tmp.length) + 1e-9), peak: 20 * Math.log10(p + 1e-9) }; });
    if (!mono || lv.length < 2) return lv;
    const avg = { rms: lv.reduce((a, l) => a + l.rms, 0) / lv.length, peak: Math.max(...lv.map(l => l.peak)) - 3 };
    return lv.map(() => avg);
  },
  async setOutputDevice(id: string) { const c = ensure() as AudioContext & { setSinkId?: (id: string) => Promise<void> }; if (c.setSinkId) await c.setSinkId(id === 'default' ? '' : id); },
};
