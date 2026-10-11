import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reorder, useDragControls, AnimatePresence, motion } from 'framer-motion';
import type { Job } from '@/api/types';
import { useData } from '@/store/data';
import { useMotion } from '@/hooks/useMotion';
import { Workspace, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Stat } from '@/components/ui/Stat';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/components/ui/Icon';
import { QueueRow } from '@/components/domain/QueueRow';
import { fmtClock, fmtMB, estimateOutput } from '@/lib/format';
import s from './Queue.module.css';

function DraggableJob({ job, onDrop }: { job: Job; onDrop: () => void }) {
  const controls = useDragControls();
  const { cancelJob, retryJob, select } = useData(); const nav = useNavigate();
  const [dragging, setDragging] = useState(false);
  return (
    <Reorder.Item value={job} dragListener={false} dragControls={controls} onDragStart={() => setDragging(true)} onDragEnd={() => { setDragging(false); onDrop(); }} style={{ position: 'relative', listStyle: 'none' }}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
      <QueueRow job={job} dragging={dragging} onDragStart={e => controls.start(e)} onCancel={() => cancelJob(job.id)} onRetry={() => retryJob(job.id)} onOpen={() => { select(job.trackId); nav('/'); }} />
    </Reorder.Item>
  );
}

export function QueueView() {
  const { jobs, queue, tracks, startQueue, pauseQueue, clearFinished, reorderJobs, cancelJob, retryJob, select } = useData();
  const nav = useNavigate(); const m = useMotion();
  const active = useMemo(() => jobs.filter(j => j.status === 'encoding' || j.status === 'queued').sort((a, b) => (a.status === b.status ? a.order - b.order : a.status === 'encoding' ? -1 : 1)), [jobs]);
  const finished = useMemo(() => jobs.filter(j => j.status === 'done' || j.status === 'failed').sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')), [jobs]);
  const [order, setOrder] = useState(active);
  useEffect(() => setOrder(o => { const ids = new Set(active.map(j => j.id)); const kept = o.filter(j => ids.has(j.id)).map(j => active.find(a => a.id === j.id)!); return [...kept, ...active.filter(a => !kept.some(k => k.id === a.id))]; }), [active]);

  const done = jobs.filter(j => j.status === 'done');
  const input = tracks.reduce((a, t) => a + t.sizeBytes, 0);
  const output = tracks.reduce((a, t) => a + (t.output?.sizeBytes ?? estimateOutput(t, t.settings).bytes), 0);
  const overall = jobs.length ? jobs.reduce((a, j) => a + (j.status === 'failed' ? 1 : j.progress), 0) / jobs.length : 0;
  const started = queue.startedAt ? fmtClock(queue.startedAt).slice(0, 5) : '—';

  return (
    <Workspace actions={<>
      {queue.running ? <Button icon="pause" onClick={pauseQueue}>Pause all</Button> : <Button icon="play_arrow" onClick={startQueue}>Resume</Button>}
      <Button variant="dts" icon="play_arrow" disabled={queue.running && !!active.length} onClick={() => { const raw = tracks.filter(t => t.status === 'raw').map(t => t.id); if (raw.length) useData.getState().encode(raw); else startQueue(); }}>{tracks.some(t => t.status === 'raw') ? 'Encode remaining' : 'Start queue'}</Button>
    </>}>
      <PageHeader title="Encoding queue" sub={`${done.length} of ${tracks.length} encoded · started ${started}${queue.running ? '' : ' · paused'}`}>
        <Button variant="ghost" icon="close" disabled={!finished.length} onClick={clearFinished}>Clear finished</Button>
        <Button icon="add" onClick={() => nav('/import')}>Add files</Button>
      </PageHeader>
      <section className={s.summary} aria-label="Queue summary">
        <Stat label="Files" value={tracks.length} />
        <Stat label="Encoded" value={done.length} tone="dts" />
        <Stat label="Input" value={fmtMB(input)} />
        <Stat label="Output" value={`≈ ${fmtMB(output, 0)}`} tone="dts" />
        <Stat label="Saved" value={`${Math.round((1 - output / Math.max(1, input)) * 100)}%`} tone="accent" />
        <Stat label="Active" value={`${jobs.filter(j => j.status === 'encoding').length} / ${queue.workers}`} />
        <div className={s.overall}>
          <div className={s.overallRow}><span>Overall progress</span><span style={{ color: 'var(--text-primary)' }}>{Math.round(overall * 100)}%</span></div>
          <Progress value={overall} live={queue.running && !!active.length} label="Overall progress" />
        </div>
      </section>

      <h2 className={s.group}>In progress · {active.length}</h2>
      {order.length ? (
        <Reorder.Group axis="y" values={order} onReorder={setOrder} className={s.list}>
          {order.map(j => <DraggableJob key={j.id} job={j} onDrop={() => reorderJobs(order.filter(o => o.status === 'queued').map(o => o.id))} />)}
        </Reorder.Group>
      ) : (
        <div className={s.empty}><Icon name="check_circle" size={28} color="var(--accent-success)" /><span>Nothing waiting. Pick a track and press Encode, or encode every raw track at once.</span></div>
      )}
      <h2 className={s.group}>Finished · {finished.length}</h2>
      <ul className={s.list}>
        <AnimatePresence initial={false}>
          {finished.map(j => (
            <motion.li key={j.id} layout initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: m.base, layout: m.spring }}>
              <QueueRow job={j} onCancel={() => cancelJob(j.id)} onRetry={() => retryJob(j.id)} onOpen={() => { select(j.trackId); nav('/'); }} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Workspace>
  );
}
