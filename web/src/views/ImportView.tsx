import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useData } from '@/store/data';
import { api } from '@/api/client';
import { useMotion } from '@/hooks/useMotion';
import { Workspace } from '@/components/layout/Page';
import { Dropzone, ACCEPT } from '@/components/domain/Dropzone';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Tag } from '@/components/ui/Tag';
import { Button } from '@/components/ui/Button';
import s from './Import.module.css';

const RECENT = [['~/Music/Projects/Feature_Film_Mix/Stems', '14 WAV · 2.3 GB'], ['~/Desktop/Score_Deliverables', '6 WAV · 512 MB'], ['/Volumes/Archive/2025_Game_SFX', '128 WAV · 940 MB']];

export function ImportView() {
  const { presets, upload, uploading, tracks } = useData();
  const [preset, setPreset] = useState<string | null>(null);
  const nav = useNavigate(); const m = useMotion();
  const picker = useRef<HTMLInputElement>(null);
  const take = async (files: File[]) => {
    const created = await upload(files);
    if (!created.length) return;
    if (preset) { const p = presets.find(x => x.id === preset); if (p) created.forEach(t => useData.getState().applyPreset(t.id, p.id)); }
    nav('/');
  };
  const choosePreset = async (id: string) => { setPreset(id); const p = presets.find(x => x.id === id); if (p) { const cur = await api.settings.get(); await api.settings.update({ defaults: { ...cur.defaults, ...p.settings, presetId: id } }); } };
  return (
    <Workspace actions={<>
      <Button disabled={!tracks.length} icon="headphones">Preview</Button>
      <Button variant="dts" icon="bolt" disabled>Encode to DTS</Button>
    </>} contentStyle={{ alignItems: 'center', paddingTop: 'var(--space-48)', gap: 'var(--space-32)' }}>
      <motion.div className={s.hero} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: m.slow }}>
        <h1 className={s.heroTitle}>Start a new encode</h1>
        <p className={s.heroSub}>Convert WAV masters to DTS for Blu-ray, home theater and game audio. Everything runs locally on this computer.</p>
      </motion.div>
      <motion.div className={s.zone} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: m.slow, delay: m.fast }}>
        <Dropzone onFiles={take} busy={uploading} />
      </motion.div>
      <div className={s.presets}>
        {presets.filter(p => ['bluray-51', 'home-theater', 'game-audio'].includes(p.id)).map((p, i) => (
          <motion.button key={p.id} type="button" className={[s.preset, preset === p.id && s.presetActive].filter(Boolean).join(' ')} onClick={() => choosePreset(p.id)}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: m.base, delay: m.fast * (2 + i) }}>
            <Icon name={p.icon as IconName} size={24} color="var(--accent-primary)" />
            <span className="t-label">{p.name}</span>
            <span className="t-small c-muted">{p.description}</span>
            <Tag tone={p.tone}>{preset === p.id ? 'Selected' : p.tag}</Tag>
          </motion.button>
        ))}
      </div>
      <div className={s.recent}>
        <span className="t-caption t-upper c-muted">Recent folders</span>
        {RECENT.map(([p, meta]) => (
          <button key={p} type="button" className={s.folder} onClick={() => picker.current?.click()}>
            <Icon name="folder" size={20} color="var(--text-secondary)" /><span className="t-body grow truncate">{p}</span><span className="t-caption c-muted">{meta}</span><Icon name="chevron_right" size={18} color="var(--text-muted)" />
          </button>
        ))}
        <input ref={picker} type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) take(f); }} />
      </div>
    </Workspace>
  );
}
