import { useMemo, type CSSProperties } from 'react';
import { scaleLinear } from 'd3';
import type { Track } from '@/api/types';
import { useUi, type StftUi } from '@/store/ui';
import { useElementSize } from '@/hooks/useElementSize';
import { ChannelLane, channelNames } from '@/components/audio/ChannelLane';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { fmtShortTime } from '@/lib/format';
import type { Which } from '@/audio/engine';
import s from './Encoder.module.css';

/** Time axis aligned to the lane's waveform column (same grid + 16px inner padding). */
export function TimeRuler({ duration }: { duration: number }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const ticks = useMemo(() => { const x = scaleLinear().domain([0, duration]).range([16, Math.max(17, width - 16)]); const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find(st => duration / st <= Math.max(2, width / 90)) ?? 600; return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => ({ t: i * step, x: x(i * step) })); }, [duration, width]);
  return (
    <div className={s.ruler}><span /><span />
      <div ref={ref} className={s.ticks}>{ticks.map(t => <span key={t.t} className={s.tick} style={{ left: t.x }}>{fmtShortTime(t.t)}</span>)}</div>
    </div>
  );
}

export function Lanes({ track, buffer, compare, tone, which, view, mix, mono }: { track: Track; buffer: AudioBuffer | null; compare?: AudioBuffer | null; tone: 'source' | 'dts'; which: Which; view: 'waveform' | 'spectrogram'; mix?: boolean; mono?: boolean }) {
  const names = channelNames[track.layout] ?? channelNames.Stereo;
  const idleDb = track.loudnessLufs - 2;
  if (mix || mono) return <div className={s.lanes}><ChannelLane trackId={track.id} channel={0} channels={1} name={mono ? 'Mono' : 'Mix'} position={mono ? `${track.layout} → mono downmix` : track.channels > 1 ? `${track.layout} → stereo preview` : 'Mono'} buffer={buffer} compare={compare} tone={tone} which={which} view={view} idleDb={idleDb} mix /></div>;
  return (
    <div className={s.lanes}>
      {names.map(([n, p], ch) => <ChannelLane key={ch} trackId={track.id} channel={ch} channels={names.length} name={n} position={p} buffer={buffer} tone={tone} which={which} view={view} idleDb={idleDb - (p === 'LFE' ? 6 : 0)} />)}
    </div>
  );
}

export function StftToolbar() {
  const stft = useUi(u => u.stft); const setStft = useUi(u => u.setStft);
  return (
    <div className={s.toolbar}>
      <span className={s.tbLabel}>FFT</span>
      <Select width={96} value={stft.fftSize} onChange={v => setStft({ fftSize: v })} options={[1024, 2048, 4096, 8192].map(v => ({ value: v as StftUi['fftSize'], label: String(v) }))} aria-label="FFT size" />
      <span className={s.tbLabel}>Hop</span>
      <Select width={84} value={stft.hop} onChange={v => setStft({ hop: v })} options={[256, 512, 1024].map(v => ({ value: v as StftUi['hop'], label: String(v) }))} aria-label="Hop size" />
      <span className={s.tbLabel}>Window</span>
      <Select width={110} value={stft.window} onChange={v => setStft({ window: v })} options={[{ value: 'hann', label: 'Hann' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' }]} aria-label="Window" />
      <span className={s.vr} />
      <Segmented label="Frequency scale" value={stft.scale} onChange={v => setStft({ scale: v })} options={[{ value: 'log', label: 'Log' }, { value: 'linear', label: 'Linear' }]} />
      <span style={{ flex: 1 }} />
      <span className={s.tbLabel}>Range</span>
      <Slider label="Dynamic range" width={110} min={40} max={120} step={5} value={stft.rangeDb} onChange={v => setStft({ rangeDb: v })} />
      <span className="t-caption c-secondary">−{stft.rangeDb} dB</span>
      <span className={s.colorbar} style={{ background: `linear-gradient(90deg, ${[0, 1, 2, 3, 4, 5, 6].map(i => `var(--spec-src-${i})`).join(', ')})` } as CSSProperties} />
      <span className="t-caption c-secondary">0 dB</span>
    </div>
  );
}
