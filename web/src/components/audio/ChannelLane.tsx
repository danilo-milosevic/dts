import { useMemo, type CSSProperties } from 'react';
import type { Which } from '@/audio/engine';
import { mixKey, useMixer } from '@/store/mixer';
import { Icon } from '../ui/Icon';
import { Slider } from '../ui/Slider';
import { Meter } from '../ui/Meter';
import { Waveform } from './Waveform';
import { Spectrogram } from './Spectrogram';
import s from './ChannelLane.module.css';

export const channelNames: Record<string, [string, string][]> = {
  Mono: [['Mono', 'Center · M']],
  Stereo: [['Channel 1', 'Front Left · L'], ['Channel 2', 'Front Right · R']],
  '5.1': [['Channel 1', 'Front Left · L'], ['Channel 2', 'Front Right · R'], ['Channel 3', 'Center · C'], ['Channel 4', 'LFE'], ['Channel 5', 'Surround Left · Ls'], ['Channel 6', 'Surround Right · Rs']],
  '7.1': [['Channel 1', 'Front Left · L'], ['Channel 2', 'Front Right · R'], ['Channel 3', 'Center · C'], ['Channel 4', 'LFE'], ['Channel 5', 'Side Left · Ls'], ['Channel 6', 'Side Right · Rs'], ['Channel 7', 'Rear Left · Lb'], ['Channel 8', 'Rear Right · Rb']],
};

/** Lane names for an output with `count` channels, in WAV / ffmpeg channel order. */
export function channelNamesFor(count: number): [string, string][] {
  const L: [string, string] = ['Channel 1', 'Front Left · L'], R: [string, string] = ['Channel 2', 'Front Right · R'];
  const n = (i: number, p: string): [string, string] => [`Channel ${i}`, p];
  if (count <= 1) return [['Mono', 'Center · C']];
  if (count === 2) return channelNames.Stereo;
  if (count === 3) return [L, R, n(3, 'Center · C')];
  if (count === 4) return [L, R, n(3, 'Surround Left · Ls'), n(4, 'Surround Right · Rs')];
  if (count === 5) return [L, R, n(3, 'Center · C'), n(4, 'Surround Left · Ls'), n(5, 'Surround Right · Rs')];
  if (count === 6) return channelNames['5.1'];
  return channelNames['7.1'].slice(0, count);
}

function isSilentChannel(b: AudioBuffer, ch: number) {
  if (ch >= b.numberOfChannels) return false;
  const d = b.getChannelData(ch); const step = Math.max(1, Math.floor(d.length / 20000));
  for (let i = 0; i < d.length; i += step) if (Math.abs(d[i]) > 1e-4) return false;
  return true;
}

export interface ChannelLaneProps {
  trackId: string; channel: number; channels: number; name: string; position: string;
  buffer: AudioBuffer | null; compare?: AudioBuffer | null; tone: 'source' | 'dts'; which: Which;
  view: 'waveform' | 'spectrogram'; idleDb: number; mix?: boolean;
}

export function ChannelLane({ trackId, channel, channels, name, position, buffer, compare, tone, which, view, idleDb, mix }: ChannelLaneProps) {
  const key = mixKey(trackId, which);
  const lane = useMixer(m => m.lanes[key]?.[channel]) ?? { gainDb: 0, mute: false, solo: false };
  const anySolo = useMixer(m => m.lanes[key]?.some(l => l?.solo) ?? false);
  const update = useMixer(m => m.update);
  const silent = lane.mute || (anySolo && !lane.solo);
  // channels with no signal (e.g. centre / surrounds after a stereo → 5.1 upmix) show an empty meter at rest
  const empty = useMemo(() => !mix && !!buffer && isSilentChannel(buffer, channel), [buffer, channel, mix]);
  // a mix / mono lane controls every source channel at once
  const targets = mix ? Array.from({ length: buffer?.numberOfChannels ?? 2 }, (_, i) => i) : [channel];
  const set = (patch: Partial<typeof lane>) => targets.forEach(c => update(key, c, Math.max(channels, targets.length), patch));
  const bufCh = mix ? 'mix' : buffer ? channel % buffer.numberOfChannels : channel;
  // always two meter columns so every lane's waveform starts at the same x
  const meterChannels = mix ? ((buffer?.numberOfChannels ?? 2) > 1 ? [0, 1] : [0, 0]) : [channel, channel];
  return (
    <div className={s.lane} style={{ '--lane-h': view === 'spectrogram' ? 'var(--size-spec-h)' : undefined } as CSSProperties}>
      <div className={s.head}>
        <div>
          <div className={s.name}>{name}</div>
          <div className={s.pos}>{position}</div>
        </div>
        <div className={s.controls}>
          <div className={s.ms}>
            <button type="button" aria-pressed={lane.mute} title="Mute" className={[s.msBtn, lane.mute && s.muteOn].filter(Boolean).join(' ')} onClick={() => set({ mute: !lane.mute })}>M</button>
            <button type="button" aria-pressed={lane.solo} title="Solo" className={[s.msBtn, lane.solo && s.soloOn].filter(Boolean).join(' ')} onClick={() => set({ solo: !lane.solo })}>S</button>
          </div>
          <div className={s.gain}>
            <Icon name={silent ? 'volume_off' : 'volume_up'} size={16} />
            <Slider label={`${name} gain`} min={-24} max={12} step={0.5} value={lane.gainDb} onChange={v => set({ gainDb: v })} />
            <span className={s.gainValue}>{lane.gainDb > 0 ? '+' : ''}{lane.gainDb.toFixed(1)} dB</span>
          </div>
        </div>
      </div>
      <Meter trackId={trackId} which={which} channels={meterChannels} idleDb={silent || empty ? -100 : idleDb + lane.gainDb} />
      <div className={silent ? s.dim : undefined} style={{ minWidth: 0 }}>
        {view === 'waveform'
          ? <Waveform buffer={buffer} channel={bufCh} tone={tone} trackId={trackId} which={which} label={name} />
          : <Spectrogram buffer={buffer} compare={compare} channel={bufCh} palette={tone === 'source' ? 'src' : 'dts'} trackId={trackId} which={which} label={name} />}
      </div>
    </div>
  );
}
