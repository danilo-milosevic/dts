import type { Track } from '@/api/types';
import { useData } from '@/store/data';
import { useUi } from '@/store/ui';
import { api } from '@/api/client';
import { Field, Section } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Stat } from '@/components/ui/Stat';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { CODEC_LABEL, estimateOutput, fmtDuration, fmtMB, layoutChannels } from '@/lib/format';
import { Tag } from '@/components/ui/Tag';
import { optionHelp } from './optionHelp';
import { bitrateOptions, containerOptions, downmixOptions, drcOptions } from './inspectorOptions';
import s from './Encoder.module.css';

const W = 168;

/** Encoder settings for the selected track, with a live size / ratio / time estimate. */
export function Inspector({ track, onClose }: { track: Track; onClose?: () => void }) {
  const { presets, updateSettings, applyPreset, encode } = useData();
  const toast = useUi(u => u.toast);
  const st = track.settings;
  const up = (p: Partial<Track['settings']>) => updateSettings(track.id, p);
  const est = estimateOutput(track, st);
  const busy = track.status === 'queued' || track.status === 'encoding';
  const presetValue = st.presetId ?? 'custom';
  const presetOpts = [...presets.map(p => ({ value: p.id, label: `Preset · ${p.name}`, hint: p.description })), ...(st.presetId ? [] : [{ value: 'custom', label: 'Preset · Custom' }])];
  const maxBitrate = track.bitrateKbps;

  // bitrates below the encoder's minimum for the output layout are disabled
  const caps = useData(d => d.capabilities);
  const outCh = Math.min(6, layoutChannels(st.layout, track));
  const minKbps = caps?.bitrateKbps.min[String(outCh)];
  const rateOpts = bitrateOptions.map(o => (minKbps && o.value < minKbps ? { ...o, disabled: true, hint: `Below the ${minKbps} kbps minimum for ${outCh} ch` } : o));

  return (
    <aside className={s.inspector} aria-label="Encoder settings">
      <div className={s.insHead}>
        <div className={s.insTitle}>
          <span>Encoder settings</span>
          {onClose && <IconButton icon="close" label="Close settings" onClick={onClose} style={{ marginLeft: 'auto', marginRight: 'var(--space-4)' }} />}
          <Menu items={[
            { label: 'Reset to defaults', icon: 'restart', onClick: async () => { const d = await api.settings.get(); up({ ...d.defaults, presetId: d.defaults.presetId }); } },
            { label: 'Apply to all raw tracks', icon: 'content_copy', onClick: () => { useData.getState().tracks.filter(t => t.status === 'raw' && t.id !== track.id).forEach(t => updateSettings(t.id, { ...st })); toast({ tone: 'success', title: 'Settings applied to all raw tracks' }); } },
          ]} trigger={p => <IconButton icon="more_vert" label="More" onClick={p.onClick} ref={p.ref} />} />
        </div>
        <Select value={presetValue} options={presetOpts} onChange={v => v !== 'custom' && applyPreset(track.id, v)} aria-label="Preset" />
      </div>
      <div className={s.insBody}>
        <Section title="Format">
          <Field label="Codec" hint="Coherent Acoustics · ffmpeg"><Tag tone="dts">{CODEC_LABEL}</Tag></Field>
          <Field label="Bitrate" hint={`Source is ${maxBitrate} kbps`}><Select width={W} value={st.bitrateKbps} options={rateOpts} onChange={v => up({ bitrateKbps: v })} /></Field>
          <Field label="Bit depth" hint={`${track.sampleRate / 1000} kHz output`}><Segmented value={String(st.bitDepth) as '16' | '24'} onChange={v => up({ bitDepth: Number(v) as 16 | 24 })} options={[{ value: '16', label: '16-bit' }, { value: '24', label: '24-bit' }]} /></Field>
        </Section>
        <Section title="Channels">
          <Field label="Layout"><Segmented value={st.layout} onChange={v => up({ layout: v })} options={[{ value: '1.0', label: 'Mono' }, { value: '2.0', label: '2.0' }, { value: '5.1', label: '5.1' }, { value: '7.1', label: '7.1', title: caps?.layoutNotes['7.1'] }, { value: 'auto', label: 'Auto' }]} /></Field>
          <Field label="Downmix" info={optionHelp.downmix} hint={track.channels > 2 ? undefined : 'Only for multichannel sources'}><Select width={W} disabled={track.channels <= 2 && st.layout !== '2.0'} value={st.downmix} options={downmixOptions} onChange={v => up({ downmix: v })} /></Field>
        </Section>
        <Section title="Loudness & dynamics">
          <Field label="Dynamic range" info={optionHelp.drc}><Select width={W} value={st.drc} options={drcOptions} onChange={v => up({ drc: v })} /></Field>
          <Field label="True-peak limiter" info={optionHelp.limiter} hint={track.peakDbfs > 0 ? `Source peaks at +${track.peakDbfs} dBFS — keep on` : 'Ceiling −1.0 dBTP'}><Toggle checked={st.limiter} onChange={v => up({ limiter: v })} label="True-peak limiter" /></Field>
        </Section>
        <Section title="Output">
          <Field label="Container"><Select width={W} value={st.container} options={containerOptions} onChange={v => up({ container: v })} /></Field>
          <Field label="Output folder" layout="stacked"><Input icon="folder_open" value={st.outputFolder} onChange={v => up({ outputFolder: v })} aria-label="Output folder" /></Field>
          <div style={{ padding: 'var(--space-4) 0' }}><Checkbox checked={st.keepOriginal} onChange={v => up({ keepOriginal: v })}>Keep original WAV</Checkbox></div>
        </Section>
      </div>
      <div className={s.insFoot}>
        <div className={s.estimate}>
          <Stat label="Est. size" value={fmtMB(est.bytes)} tone="dts" />
          <Stat label="Ratio" value={`×${est.ratio.toFixed(2)}`} tone="dts" />
          <Stat label="Saves" value={`${est.savedPct.toFixed(1)}%`} tone="accent" />
          <Stat label="Time" value={`≈ ${fmtDuration(est.encodeSec)}`} />
        </div>
        <div className={s.actions}>
          <Button icon="download" onClick={async () => { const p = await api.presets.create({ name: `${track.name.replace(/\.\w+$/, '')} preset`, description: `${CODEC_LABEL} · ${st.bitrateKbps} kbps · ${st.layout}`, tag: 'Custom', tone: 'accent', icon: 'tune', settings: { ...st, presetId: null } }); useData.setState(d => ({ presets: [...d.presets, p] })); updateSettings(track.id, { presetId: p.id }); toast({ tone: 'success', title: 'Preset saved', message: p.name }); }}>Save preset</Button>
          <Button variant="dts" icon="bolt" loading={busy} onClick={() => encode([track.id])} title={`Encode ${track.name}`}>{busy ? 'In queue' : 'Encode'}</Button>
        </div>
      </div>
    </aside>
  );
}
