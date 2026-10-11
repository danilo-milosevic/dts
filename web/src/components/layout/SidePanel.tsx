import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { useMotion } from '@/hooks/useMotion';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';
import { Progress } from '../ui/Progress';
import { TrackRow } from '../domain/TrackRow';
import { RailItem } from '../domain/RailItem';
import { ResizeHandle } from '../ui/ResizeHandle';
import { SettingsPanel } from '@/views/SettingsPanel';
import { estimateOutput, fmtMB } from '@/lib/format';
import { cssPx } from '@/lib/css';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import s from './Layout.module.css';

export function ThemeToggle() {
  const theme = useSettings(st => st.theme); const setTheme = useSettings(st => st.setTheme);
  return <Segmented label="Theme" value={theme} onChange={(v, e: MouseEvent) => setTheme(v, { x: e.clientX, y: e.clientY })} options={[{ value: 'dark', label: 'Dark', icon: 'dark_mode' }, { value: 'light', label: 'Light', icon: 'light_mode' }]} />;
}

/** Left panel: track list, settings, or collapsed rail. Width animates between modes; the full width is user-resizable. */
export function SidePanel() {
  const collapsed = useSettings(st => st.sidePanelCollapsed);
  const mode = useSettings(st => st.sidePanel);
  const set = useSettings(st => st.set);
  const m = useMotion();

  // narrow windows start collapsed; switching tabs never changes the panel, so the workspace doesn't reflow
  const narrow = useMediaQuery('(max-width: 1440px)');
  useEffect(() => { set({ sidePanelCollapsed: narrow }); }, [narrow, set]);

  const rail = collapsed && mode === 'list';
  useSettings(st => st.density); // sizes scale with density
  const userW = useSettings(st => st.sidePanelW);
  const [dragging, setDragging] = useState(false);
  const { min, max } = sidePanelLimits();
  const fullW = Math.min(max, Math.max(min, userW ?? cssPx('size-sidepanel-w', 480)));
  const width = rail ? cssPx('size-rail-w', 72) : fullW;
  return (
    <motion.aside className={s.side} initial={false} animate={{ width }} transition={dragging ? { duration: 0 } : { duration: m.slow, ease: [0.65, 0, 0.35, 1] }} aria-label="Tracks" style={{ '--side-w': `${fullW}px` } as CSSProperties}>
      <motion.div key={rail ? 'rail' : mode} className={s.sideClip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: m.base }}>
        {rail ? <Rail /> : mode === 'settings' ? <SettingsPanel /> : <TrackList />}
      </motion.div>
      {!rail && <ResizeHandle edge="right" label="Resize side panel" width={fullW} min={min} max={max} onResize={w => set({ sidePanelW: w })} onDragChange={setDragging} onReset={() => set({ sidePanelW: null })} />}
    </motion.aside>
  );
}

/** Side panel width range: wide enough for the track rows, never more than ~40 % of the window. */
function sidePanelLimits() { return { min: 360, max: Math.max(400, Math.min(760, Math.round(innerWidth * 0.4))) }; }

function Rail() {
  const tracks = useData(d => d.tracks); const selectedId = useData(d => d.selectedId); const select = useData(d => d.select);
  const set = useSettings(st => st.set); const nav = useNavigate();
  return (
    <div className={s.railInner}>
      <IconButton icon="menu" variant="soft" size={40} label="Expand track list" onClick={() => set({ sidePanelCollapsed: false })} />
      <IconButton icon="search" size={40} label="Search tracks" onClick={() => set({ sidePanelCollapsed: false })} />
      <span className={s.divider} />
      <div className={s.railList}>
        <AnimatePresence initial={false}>
          {tracks.map(t => (
            <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
              <RailItem track={t} selected={t.id === selectedId} onClick={() => { select(t.id); nav('/'); }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <IconButton icon="add" variant="accent" size={40} label="Add tracks" onClick={() => nav('/import')} />
      <span className={s.spacer} />
      <IconButton icon="settings" variant="soft" size={40} label="Settings" onClick={() => set({ sidePanelCollapsed: false, sidePanel: 'settings' })} />
    </div>
  );
}

function TrackList() {
  const { tracks, jobs, selectedId, select, duplicate, remove, freshIds } = useData();
  const { search, filter, set: setUi } = useUi();
  const setSettings = useSettings(st => st.set);
  const nav = useNavigate(); const { pathname } = useLocation();
  const m = useMotion();
  const counts = useMemo(() => ({ all: tracks.length, raw: tracks.filter(t => t.status === 'raw' || t.status === 'queued' || t.status === 'encoding').length, encoded: tracks.filter(t => t.status === 'encoded').length, failed: tracks.filter(t => t.status === 'error').length }), [tracks]);
  const visible = tracks.filter(t => (filter === 'all' || (filter === 'raw' ? ['raw', 'queued', 'encoding'].includes(t.status) : filter === 'encoded' ? t.status === 'encoded' : t.status === 'error')) && t.name.toLowerCase().includes(search.toLowerCase()));
  const total = tracks.reduce((a, t) => a + t.sizeBytes, 0);
  const est = tracks.reduce((a, t) => a + (t.output?.sizeBytes ?? estimateOutput(t, t.settings).bytes), 0);
  const jobFor = (id: string) => jobs.find(j => j.trackId === id && (j.status === 'encoding' || j.status === 'queued'));

  return (
    <div className={s.sideInner}>
      <div className={s.header}>
        <IconButton icon="menu_open" variant="soft" size={40} label="Collapse track list" onClick={() => setSettings({ sidePanelCollapsed: true })} />
        <span className={s.headerTitle}>Tracks</span>
        <span className={s.spacer} />
        <Tag tone="neutral">{tracks.length} files</Tag>
      </div>
      {tracks.length > 0 ? <>
        <Input icon="search" value={search} onChange={v => setUi({ search: v })} placeholder="Search tracks" clearable aria-label="Search tracks" />
        <Segmented full value={filter} onChange={v => setUi({ filter: v })} label="Filter tracks" options={[{ value: 'all', label: `All ${counts.all}` }, { value: 'raw', label: `Raw ${counts.raw}` }, { value: 'encoded', label: `Encoded ${counts.encoded}` }, { value: 'failed', label: `Failed ${counts.failed}` }]} />
        <div className={s.scroll}>
          <div className={s.list} role="listbox" aria-label="Tracks">
            <AnimatePresence initial={false}>
              {visible.map(t => (
                <motion.div key={t.id} layout="position" initial={freshIds.includes(t.id) ? { opacity: 0, height: 0, x: -24 } : false} animate={{ opacity: 1, height: 'auto', x: 0 }} exit={{ opacity: 0, height: 0, x: 24 }} transition={{ duration: m.base, layout: m.spring }} style={{ overflow: 'hidden' }}>
                  <TrackRow track={t} job={jobFor(t.id)} selected={t.id === selectedId} onSelect={() => { select(t.id); if (pathname !== '/') nav('/'); }} onDuplicate={() => duplicate(t.id)} onRemove={() => remove(t.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
            {!visible.length && <div className={s.noMatch}>No tracks match “{search || filter}”</div>}
          </div>
        </div>
        <div className={s.header}>
          <Button variant="primary" icon="add" full onClick={() => nav('/import')}>Add tracks</Button>
          <Button variant="secondary" icon="folder_open" full onClick={() => nav('/import')}>Add folder</Button>
        </div>
        <div className={s.library}>
          <div className={s.libRow}><span className="t-label">Library</span><span className={s.spacer} /><span className="t-caption c-muted">{tracks.length} files · {fmtMB(total)}</span></div>
          <Progress value={est / Math.max(1, total)} tone="dts" label="Estimated output size" />
          <div className={s.libRow}><span className="t-small c-muted">Estimated DTS output</span><span className={s.spacer} /><span className="t-caption c-dts">≈ {fmtMB(est, 0)} · saves {Math.round((1 - est / Math.max(1, total)) * 100)}%</span></div>
        </div>
      </> : (
        <div className={s.empty}>
          <div className={s.emptyBadge}><Icon name="library_music" size={32} /></div>
          <span className="t-subheading c-primary">No tracks yet</span>
          <span className="t-body" style={{ maxWidth: 300 }}>Add WAV files to build your encode queue. They are uploaded to the encoder server, which keeps the originals and the DTS files.</span>
          <Button variant="primary" icon="add" onClick={() => nav('/import')}>Add tracks</Button>
        </div>
      )}
      <SideFooter />
    </div>
  );
}

export function SideFooter() {
  const mode = useSettings(st => st.sidePanel); const set = useSettings(st => st.set);
  return (
    <div className={s.footer}>
      <IconButton icon="settings" variant={mode === 'settings' ? 'accent' : 'soft'} size={40} label={mode === 'settings' ? 'Close settings' : 'Settings'} onClick={() => set({ sidePanel: mode === 'settings' ? 'list' : 'settings' })} />
      <span className="t-label">Settings</span>
      <span className={s.spacer} />
      <ThemeToggle />
      <span className={s.version}>v{__APP_VERSION__}</span>
    </div>
  );
}
