import type { PointerEvent } from 'react';
import type { Job } from '@/api/types';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Menu } from '../ui/Menu';
import { Progress } from '../ui/Progress';
import { Stat } from '../ui/Stat';
import { Tag } from '../ui/Tag';
import { fmtDuration } from '@/lib/format';
import s from './QueueRow.module.css';

const statusTag: Record<Job['status'], [Parameters<typeof Tag>[0]['tone'], string]> = { queued: ['neutral', 'Queued'], encoding: ['accent', 'Encoding'], done: ['dts', 'Done'], failed: ['danger', 'Failed'], cancelled: ['neutral', 'Cancelled'] };

export function QueueRow({ job, onCancel, onRetry, onOpen, onDragStart, dragging }: { job: Job; onCancel: () => void; onRetry: () => void; onOpen: () => void; onDragStart?: (e: PointerEvent) => void; dragging?: boolean }) {
  const [tone, label] = statusTag[job.status];
  const pct = Math.round(job.progress * 100);
  const eta = job.status === 'encoding' ? `ETA ${fmtDuration(job.etaSec ?? 0)}` : job.status === 'done' ? fmtDuration(job.encodeSeconds ?? 0) : job.status === 'failed' ? 'Clipping' : 'Waiting';
  return (
    <div className={[s.row, job.status === 'encoding' && s.encoding, dragging && s.dragging].filter(Boolean).join(' ')}>
      <span className={s.handle} onPointerDown={job.status === 'queued' ? onDragStart : undefined} style={{ opacity: job.status === 'queued' ? 1 : 0.3 }} aria-label="Drag to reorder"><Icon name="drag_indicator" size={18} /></span>
      <Icon name={job.status === 'done' ? 'surround' : 'graphic_eq'} size={22} color={job.status === 'done' ? 'var(--accent-dts)' : 'var(--accent-danger)'} />
      <div className={s.text}>
        <span className={`${s.name} truncate`}>{job.trackName}</span>
        <span className={`${s.preset} truncate`}>{job.presetLabel} → {job.outputName}</span>
      </div>
      <div className={s.progress}>
        <div className={s.labels}><span>{pct}%</span><span className={job.status === 'failed' ? s.err : s.eta}>{eta}</span></div>
        <Progress value={job.progress} tone={job.status === 'done' ? 'dts' : job.status === 'failed' ? 'danger' : 'accent'} live={job.status === 'encoding'} muted={job.status === 'queued'} label={`${job.trackName} progress`} />
      </div>
      <div className={s.ratio}><Stat label="Ratio" value={job.ratio ? `×${job.ratio.toFixed(2)}` : '—'} tone={job.status === 'done' ? 'dts' : undefined} align="right" /></div>
      <Tag tone={tone} pulse={job.status === 'encoding'} dot={job.status === 'encoding'}>{label}</Tag>
      <Menu items={[
        { label: 'Show track', icon: 'graphic_eq', onClick: onOpen },
        { label: 'Retry', icon: 'replay', onClick: onRetry, disabled: job.status !== 'failed' },
        'separator',
        { label: job.status === 'done' ? 'Remove from list' : 'Cancel', icon: 'close', onClick: onCancel, danger: true },
      ]} trigger={p => <IconButton icon="more_vert" label="Job actions" onClick={p.onClick} ref={p.ref} aria-expanded={p['aria-expanded']} />} />
    </div>
  );
}
