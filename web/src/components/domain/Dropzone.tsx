import { useRef, useState, type DragEvent } from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import s from './Dropzone.module.css';

export const ACCEPT = '.wav,.wave,.bwf,audio/wav,audio/x-wav';
const isAudio = (f: File) => /\.(wav|wave|bwf)$/i.test(f.name) || f.type.includes('wav');

export function Dropzone({ onFiles, busy, compact }: { onFiles: (files: File[]) => void; busy?: number; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => { const files = Array.from(list ?? []).filter(isAudio); if (files.length) onFiles(files); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); };
  return (
    <div className={[s.zone, over && s.over].filter(Boolean).join(' ')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} style={compact ? { padding: 'var(--space-20)' } : undefined}>
      <div className={s.badge}><Icon name="upload" size={30} /></div>
      <div className={s.title}>{over ? 'Release to import' : 'Drop WAV files here'}</div>
      <div className={s.hint}>WAV / BWF · 16–32-bit · 44.1–192 kHz · up to 8 channels</div>
      <div className={s.actions}>
        <Button variant="primary" icon="folder_open" onClick={() => file.current?.click()}>Browse files</Button>
        <Button variant="secondary" icon="library_music" onClick={() => folder.current?.click()}>Add folder</Button>
      </div>
      <input ref={file} className={s.file} type="file" multiple accept={ACCEPT} onChange={e => { take(e.target.files); e.target.value = ''; }} />
      <input ref={folder} className={s.file} type="file" multiple {...({ webkitdirectory: '' } as object)} onChange={e => { take(e.target.files); e.target.value = ''; }} />
      {!!busy && <div className={s.busy}>Analyzing {busy} file{busy === 1 ? '' : 's'}…</div>}
    </div>
  );
}
