import { useEffect, useState } from 'react';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { api } from '@/api/client';
import type { AppSettingsDto } from '@/api/types';
import { engine } from '@/audio/engine';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Input } from '@/components/ui/Input';
import { SwatchPicker } from '@/components/ui/Swatch';
import { SideFooter, ThemeToggle } from '@/components/layout/SidePanel';
import { bitrateOptions } from './inspectorOptions';
import s from './SettingsPanel.module.css';

function SettingsCard({ title, icon, children, action }: { title: string; icon: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className={s.card}><div className={s.cardHead}><Icon name={icon} size={20} color="var(--accent-primary)" /><span className={s.cardTitle}>{title}</span>{action}</div>{children}</section>;
}

/** Settings side panel. Appearance changes apply instantly through the token system. */
export function SettingsPanel() {
  const st = useSettings();
  const toast = useUi(u => u.toast);
  const [server, setServer] = useState<AppSettingsDto | null>(null);
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([{ value: 'default', label: 'System default' }]);

  useEffect(() => { api.settings.get().then(setServer).catch(() => undefined); }, []);
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then(list => {
      const outs = list.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default').map((d, i) => ({ value: d.deviceId, label: d.label || `Output ${i + 1}` }));
      setDevices([{ value: 'default', label: 'System default' }, ...(outs.length ? outs : [{ value: 'studio', label: 'Studio Display' }, { value: 'usb', label: 'USB Audio Interface' }])]);
    }).catch(() => undefined);
  }, []);
  const saveServer = (patch: Partial<AppSettingsDto>) => { setServer(v => (v ? { ...v, ...patch, defaults: { ...v.defaults, ...(patch.defaults ?? {}) } } : v)); api.settings.update(server ? { ...patch, defaults: { ...server.defaults, ...(patch.defaults ?? {}) } } : patch).catch(e => toast({ tone: 'error', title: 'Could not save settings', message: String(e) })); };
  const d = server?.defaults;

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <IconButton icon="menu_open" variant="soft" size={40} label="Back to tracks" onClick={() => st.set({ sidePanel: 'list' })} />
        <span className={s.title}>Settings</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="s" icon="restart" onClick={() => { st.resetAppearance(); toast({ tone: 'info', title: 'Appearance reset to defaults' }); }}>Reset all</Button>
      </div>
      <div className={s.body}>
        <SettingsCard title="Display" icon="desktop">
          <Field label="Theme"><ThemeToggle /></Field>
          <Field label="Accent color"><SwatchPicker value={st.accent} onChange={st.setAccent} /></Field>
          <Field label="Font size" hint="Small · Mid · Big type scale"><Segmented value={st.fontScale} onChange={st.setFontScale} options={[{ value: 'small', label: 'Small' }, { value: 'mid', label: 'Mid' }, { value: 'big', label: 'Big' }]} /></Field>
        </SettingsCard>
        <SettingsCard title="Appearance" icon="palette">
          <Field label="Density" hint="Scales every spacing token"><Segmented value={st.density} onChange={st.setDensity} options={[{ value: 'compact', label: 'Compact' }, { value: 'default', label: 'Default' }, { value: 'comfortable', label: 'Comfy' }]} /></Field>
          <Field label="Corners" hint="Scales every radius token"><Segmented value={st.radius} onChange={st.setRadius} options={[{ value: 'sharp', label: 'Sharp' }, { value: 'default', label: 'Default' }, { value: 'round', label: 'Round' }]} /></Field>
          <Field label="Motion" hint="Animation speed"><Segmented value={st.motion} onChange={st.setMotion} options={[{ value: 'off', label: 'Off' }, { value: 'reduced', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }]} /></Field>
        </SettingsCard>
        <SettingsCard title="Playback" icon="headphones">
          <Field label="Output device"><Select width={180} value={st.outputDevice} options={devices} onChange={v => { st.set({ outputDevice: v }); engine.setOutputDevice(v).catch(() => toast({ tone: 'warning', title: 'This browser cannot switch output devices' })); }} /></Field>
          <Field label="Buffer size" hint="Lower = less latency"><Select width={180} value={st.bufferSize} options={[256, 512, 1024, 2048].map(v => ({ value: v, label: `${v} samples` }))} onChange={v => st.set({ bufferSize: v })} /></Field>
          <Field label="Preview after encode" hint="Switch to the DTS result when done"><Toggle checked={st.previewAfterEncode} onChange={v => st.set({ previewAfterEncode: v })} label="Preview after encode" /></Field>
        </SettingsCard>
        <SettingsCard title="Encoder defaults" icon="tune">
          {d ? <>
            <Field label="Default bitrate" hint="DTS Core"><Select width={180} value={d.bitrateKbps} options={bitrateOptions} onChange={v => saveServer({ defaults: { ...d, bitrateKbps: v } })} /></Field>
            <Field label="Output folder" layout="stacked"><Input icon="folder_open" value={d.outputFolder} onChange={v => saveServer({ defaults: { ...d, outputFolder: v } })} aria-label="Output folder" /></Field>
          </> : <div className="skeleton" style={{ height: 160 }} />}
        </SettingsCard>
      </div>
      <SideFooter />
    </div>
  );
}
