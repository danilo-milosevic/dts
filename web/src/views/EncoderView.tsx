import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useData, selectedTrack } from '@/store/data';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { engine, usePlayer } from '@/audio/engine';
import { api, USE_MOCKS } from '@/api/client';
import type { SaveResult } from '@/lib/save';
import { useTrackAudio } from '@/hooks/useTrackAudio';
import { useMotion } from '@/hooks/useMotion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Workspace, PageHeader } from '@/components/layout/Page';
import { Transport } from '@/components/audio/Transport';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { Tag } from '@/components/ui/Tag';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { cssPx } from '@/lib/css';
import { Stat } from '@/components/ui/Stat';
import { TrackStatusTag } from '@/components/domain/TrackRow';
import { CODEC_LABEL, estimateOutput, fmtDuration, fmtKHz, fmtMB, fmtTime, outputName } from '@/lib/format';
import { Lanes, StftToolbar, TimeRuler } from './EncoderParts';
import { Inspector } from './Inspector';
import { ImportView } from './ImportView';
import s from './Encoder.module.css';

export function EncoderView() {
  const track = useData(selectedTrack);
  const ready = useData(d => d.ready);
  const tracks = useData(d => d.tracks.length);
  const { encode, remove, updateSettings } = useData();
  const job = useData(d => d.jobs.find(j => j.trackId === track?.id && (j.status === 'encoding' || j.status === 'queued')));
  const view = useUi(u => u.view); const outputView = useUi(u => u.outputView); const setUi = useUi(u => u.set); const toast = useUi(u => u.toast);
  const inspectorOpen = useSettings(st => st.inspectorOpen); const setSettings = useSettings(st => st.set);
  const previewAfter = useSettings(st => st.previewAfterEncode);
  const { source, output } = useTrackAudio(track);
  const playing = usePlayer(p => p.playing && p.trackId === track?.id);
  const narrow = useMediaQuery('(max-width: 1500px)');
  const [drawer, setDrawer] = useState(false);
  const showInspector = narrow ? drawer : inspectorOpen;
  // resizable inspector (drag its left edge; double-click resets)
  const insUserW = useSettings(st => st.inspectorW);
  useSettings(st => st.density);
  const insMax = Math.max(360, Math.min(640, Math.round(innerWidth * 0.36)));
  const insW = Math.min(insMax, Math.max(320, insUserW ?? cssPx('size-inspector-w', 400)));
  const insVar = { '--ins-w': `${insW}px` } as CSSProperties;
  const insHandle = <ResizeHandle edge="left" label="Resize encoder settings" width={insW} min={320} max={insMax} onResize={w => setSettings({ inspectorW: w })} onReset={() => setSettings({ inspectorW: null })} />;
  const nav = useNavigate();
  const m = useMotion();

  // switch to the DTS result automatically when this track finishes encoding
  const isMono = !!track && track.settings.layout === '1.0' && track.channels > 1;
  useEffect(() => { engine.setMono(isMono); }, [isMono]);
  useEffect(() => () => { engine.pause(); engine.setMono(false); }, []); // stop playback when leaving the Compress page
  const status = track?.status;
  useEffect(() => { if (status === 'encoded' && previewAfter && output) engine.setWhich('dts'); }, [status, previewAfter, output]);

  /** Run a save (Save-as dialog where supported) and report the result. Mock mode has no files to save. */
  const save = (run: () => Promise<SaveResult>) => {
    if (USE_MOCKS) { toast({ tone: 'info', title: 'Mock mode', message: 'Downloads need the encoder server.' }); return; }
    run().then(r => r.status !== 'cancelled' && toast({ tone: 'success', title: r.status === 'saved' ? `Saved ${r.name}` : `Downloading ${r.name}` }))
      .catch(e => toast({ tone: 'error', title: 'Download failed', message: String(e) }));
  };
  if (ready && !tracks) return <ImportView />;
  if (!track) return <Workspace><div className={s.empty}>Select a track</div></Workspace>;

  const st = track.settings; const est = estimateOutput(track, st);
  const mono = st.layout === '1.0' && track.channels > 1;
  const encoded = track.status === 'encoded' && track.output;
  const outName = track.output?.fileName ?? outputName(track, st);
  const busy = track.status === 'queued' || track.status === 'encoding';

  return (
    <div className={s.layout}>
      <Workspace
        actions={<>
          <Button icon={playing ? 'pause' : 'headphones'} onClick={() => engine.toggle()} disabled={!source}>{playing ? 'Pause' : 'Preview'}</Button>
          <Button variant="dts" icon="bolt" loading={busy} onClick={() => encode([track.id])}>{busy ? `Encoding ${Math.round((job?.progress ?? 0) * 100)}%` : 'Encode to DTS'}</Button>
          <IconButton icon="tune" label={showInspector ? 'Hide encoder settings' : 'Show encoder settings'} active={showInspector} onClick={() => (narrow ? setDrawer(d => !d) : setSettings({ inspectorOpen: !inspectorOpen }))} />
        </>}
        footer={<Transport trackId={track.id} ready={!!source} dtsReady={!!encoded} />}>
        <PageHeader title="Compress" sub={`${track.name}  →  ${outName}`}>
          <Segmented label="View" value={view} onChange={v => setUi({ view: v })} options={[{ value: 'waveform', label: 'Waveform', icon: 'graphic_eq' }, { value: 'spectrogram', label: 'Spectrogram', icon: 'tune' }]} />
        </PageHeader>

        <div key={track.id} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            {/* Source */}
            <section className={s.card} aria-label="Source">
              <div className={s.cardHead}>
                <Icon name="graphic_eq" size={24} color="var(--accent-danger)" />
                <span className={s.cardName}>{track.name}</span>
                <Tag tone="info">{track.format}</Tag><Tag tone="accent">{fmtMB(track.sizeBytes)}</Tag><TrackStatusTag track={track} job={job} />
                <span style={{ flex: 1 }} />
                <Button size="s" icon="tune" onClick={() => setUi({ view: view === 'waveform' ? 'spectrogram' : 'waveform' })}>{view === 'waveform' ? 'Show STFT' : 'Show waveform'}</Button>
                {track.channels > 1 && <Button size="s" icon="compress" variant={mono ? 'primary' : 'secondary'} onClick={() => { updateSettings(track.id, { layout: mono ? (track.channels >= 6 ? '5.1' : '2.0') : '1.0' }); toast({ tone: 'info', title: mono ? `${track.name}: back to ${track.layout}` : `${track.name}: converted to mono`, message: mono ? undefined : 'Playback, preview and the encode are now mono (L + R downmix).' }); }}>{mono ? 'Undo mono' : 'Convert to mono'}</Button>}
                <IconButton icon="delete" variant="danger" label="Remove track" onClick={() => { remove(track.id); toast({ tone: 'info', title: `Removed ${track.name}` }); }} />
              </div>
              <div className={s.meta}>
                <Stat label="Sample rate" value={fmtKHz(track.sampleRate)} />
                <Stat label="Bit depth" value={`${track.bitDepth}-bit ${track.floatingPoint ? 'float' : 'PCM'}`} />
                <Stat label="Channels" value={`${track.channels} · ${track.layout}`} />
                <Stat label="Duration" value={fmtTime(track.durationSec, true)} />
                <Stat label="Bitrate" value={`${track.bitrateKbps} kbps`} />
              </div>
              {view === 'spectrogram' && <StftToolbar />}
              <Lanes track={track} buffer={source} tone="source" which="source" view={view} mono={mono} />
              <TimeRuler duration={track.durationSec} />
            </section>

            {/* Output */}
            <section className={s.card} aria-label="DTS output">
              <div className={s.cardHead}>
                <Icon name="surround" size={24} color="var(--accent-dts)" />
                <span className={s.cardName}>{outName}</span>
                <Tag tone="dts">{CODEC_LABEL}</Tag>
                <Tag tone="dts">{encoded ? fmtMB(track.output!.sizeBytes) : `≈ ${fmtMB(est.bytes)}`}</Tag>
                <Tag tone="neutral">{encoded ? 'Encoded' : 'Preview'}</Tag>
                <span style={{ flex: 1 }} />
                {view === 'spectrogram' && <Segmented value={outputView} onChange={v => setUi({ outputView: v })} options={[{ value: 'output', label: 'Output' }, { value: 'difference', label: 'Difference' }]} />}
                <Button size="s" icon="headphones" disabled={!output} onClick={() => { engine.setWhich(usePlayer.getState().which === 'dts' ? 'source' : 'dts'); if (!usePlayer.getState().playing) engine.play(); }}>A/B compare</Button>
                <Button size="s" icon="download" disabled={!encoded} onClick={() => save(() => api.tracks.saveOutput(track))}>Download DTS</Button>
                <Button size="s" icon="download" disabled={!encoded || !track.output?.decodedBytes} onClick={() => save(() => api.tracks.saveDecoded(track))}>Decoded WAV</Button>
              </div>
              <div className={s.meta}>
                <Stat label="Codec" value={CODEC_LABEL} tone="dts" />
                <Stat label="Bitrate" value={`${encoded ? track.output!.bitrateKbps : st.bitrateKbps} kbps`} />
                <Stat label="Sample rate" value={fmtKHz(track.sampleRate)} />
                <Stat label="Layout" value={st.layout === 'auto' ? track.layout : st.layout === '1.0' ? 'Mono' : st.layout} />
                <Stat label={encoded ? 'Size' : 'Est. size'} value={fmtMB(encoded ? track.output!.sizeBytes : est.bytes)} tone="dts" />
                <Stat label="Ratio" value={`×${(encoded ? track.sizeBytes / track.output!.sizeBytes : est.ratio).toFixed(2)}`} tone="dts" />
                <Stat label="Encode time" value={encoded ? fmtDuration(track.output!.encodeSeconds) : `≈ ${fmtDuration(est.encodeSec)}`} />
                {encoded && track.output!.decodeSeconds != null && <Stat label="Decode time" value={fmtDuration(track.output!.decodeSeconds)} />}
                {encoded && track.output!.decodedBytes != null && <Stat label="Decoded WAV" value={fmtMB(track.output!.decodedBytes)} />}
                <Stat label="Bandwidth" value={`${st.bitrateKbps >= 1500 ? 20 : st.bitrateKbps >= 768 ? 16 : 12} kHz`} tone={st.bitrateKbps < 768 ? 'warning' : undefined} />
              </div>
              <Lanes track={track} buffer={output} compare={view === 'spectrogram' && outputView === 'difference' ? source : undefined} tone="dts" which="dts" view={view} />
            </section>
        </div>
        <Button variant="ghost" icon="queue_music" onClick={() => nav('/queue')} style={{ alignSelf: 'flex-start' }}>Open queue</Button>
      </Workspace>
      <AnimatePresence initial={false}>
        {showInspector && (narrow ? (
          <motion.div key="drawer" className={s.drawer} initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: m.slow, ease: [0.65, 0, 0.35, 1] }} style={insVar}>
            <Inspector track={track} onClose={() => setDrawer(false)} />
            {insHandle}
          </motion.div>
        ) : (
          <motion.div key="ins" initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: m.slow, ease: [0.65, 0, 0.35, 1] }} style={{ display: 'flex', position: 'relative', ...insVar }}>
            <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}><Inspector track={track} /></div>
            {insHandle}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
