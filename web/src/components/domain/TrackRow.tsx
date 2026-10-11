import { memo } from 'react';
import type { Job, Track } from '@/api/types';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Tag } from '../ui/Tag';
import { fmtMB, trackMeta } from '@/lib/format';
import s from './TrackRow.module.css';

export function TrackStatusTag({ track, job }: { track: Track; job?: Job }) {
  switch (track.status) {
    case 'encoding': return <Tag tone="accent" dot pulse>Encoding {Math.round((job?.progress ?? 0) * 100)}%</Tag>;
    case 'queued': return <Tag tone="neutral">Queued</Tag>;
    case 'encoded': return <Tag tone="dts">DTS ready</Tag>;
    case 'error': return <Tag tone="danger" title={track.error}>Failed</Tag>;
    default: return <Tag tone="danger">Not encoded</Tag>;
  }
}

export const TrackRow = memo(function TrackRow({ track, job, selected, onSelect, onDuplicate, onRemove }: { track: Track; job?: Job; selected: boolean; onSelect: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const encoded = track.status === 'encoded';
  return (
    <div role="option" aria-selected={selected} tabIndex={0} className={[s.row, selected && s.selected].filter(Boolean).join(' ')} onClick={onSelect} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}>
      <Icon name={encoded ? 'surround' : 'graphic_eq'} size={20} color={encoded ? 'var(--accent-dts)' : 'var(--accent-danger)'} />
      <div className={s.text}>
        <span className={`${s.name} truncate`}>{track.name}</span>
        <span className={`${s.meta} truncate`}>{trackMeta(track)}</span>
      </div>
      <div className={s.tags}>
        <Tag tone="info">{track.format}</Tag>
        <Tag tone="accent">{fmtMB(track.sizeBytes)}</Tag>
        <TrackStatusTag track={track} job={job} />
      </div>
      <div className={s.actions} onClick={e => e.stopPropagation()}>
        <IconButton icon="content_copy" label={`Duplicate ${track.name}`} onClick={onDuplicate} />
        <IconButton icon="delete" variant="danger" label={`Remove ${track.name}`} onClick={onRemove} />
      </div>
    </div>
  );
});
