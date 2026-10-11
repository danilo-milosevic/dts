import { useCallback, useEffect, useRef, useState } from 'react';
import { engine, usePlayer } from '@/audio/engine';
import { usePlayhead } from '@/hooks/usePlayhead';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Slider } from '../ui/Slider';
import { Segmented } from '../ui/Segmented';
import { fmtTime } from '@/lib/format';
import s from './Transport.module.css';

/** Playback bar: transport, timecode, scrubber, volume and Source/DTS A/B switch. */
export function Transport({ trackId, ready, dtsReady }: { trackId?: string; ready: boolean; dtsReady: boolean }) {
  const p = usePlayer();
  const tc = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState(0);
  const last = useRef(0);
  const paint = useCallback((sec: number) => {
    if (tc.current) tc.current.textContent = fmtTime(sec, true);
    const now = performance.now(); if (now - last.current > 120) { last.current = now; setPos(sec); }
  }, []);
  usePlayhead(trackId, paint);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if (e.code === 'Space') { e.preventDefault(); engine.toggle(); }
      if (e.code === 'ArrowLeft' && e.altKey) engine.skip(-5);
      if (e.code === 'ArrowRight' && e.altKey) engine.skip(5);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, []);

  const active = p.trackId === trackId;
  return (
    <div className={s.bar}>
      <div className={s.controls}>
        <IconButton icon="skip_previous" size={40} label="Back 5 s" disabled={!ready} onClick={() => engine.skip(-5)} />
        <IconButton icon={active && p.playing ? 'pause' : 'play_arrow'} variant="accent" size={40} label={p.playing ? 'Pause' : 'Play'} disabled={!ready} onClick={() => engine.toggle()} />
        <IconButton icon="stop" size={40} label="Stop" disabled={!ready} onClick={() => { engine.stop(); usePlayer.setState({}); }} />
        <IconButton icon="skip_next" size={40} label="Forward 5 s" disabled={!ready} onClick={() => engine.skip(5)} />
        <IconButton icon="repeat" size={40} label="Loop" active={p.loop} onClick={() => engine.setLoop(!p.loop)} />
      </div>
      <div className={s.tc}><span ref={tc}>00:00.00</span><span className={s.total}>/ {fmtTime(active ? p.duration : 0, true)}</span></div>
      <Slider label="Position" min={0} max={Math.max(0.01, p.duration)} step={0.01} value={active ? pos : 0} onChange={v => { engine.seek(v); setPos(v); usePlayer.setState({}); }} />
      <div className={s.vol}>
        <Icon name={p.volume === 0 ? 'volume_off' : 'volume_up'} size={20} />
        <Slider label="Volume" width={120} min={0} max={1} step={0.01} value={p.volume} onChange={v => engine.setVolume(v)} />
      </div>
      <Segmented size="m" label="Listen to" value={p.which} onChange={v => engine.setWhich(v)} options={[{ value: 'source', label: 'Source' }, { value: 'dts', label: dtsReady ? 'DTS' : 'DTS (preview)' }]} />
    </div>
  );
}
