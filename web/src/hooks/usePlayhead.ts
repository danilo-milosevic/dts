import { useEffect } from 'react';
import { engine, usePlayer, type Which } from '@/audio/engine';

/**
 * Calls `paint(seconds, active)` every animation frame while `trackId` (optionally a specific source)
 * is playing, and immediately whenever playback state, a seek, or `paint` itself changes
 * (e.g. after a component remounts or is resized). Paint should mutate the DOM directly.
 */
export function usePlayhead(trackId: string | undefined, paint: (sec: number, active: boolean) => void, which?: Which) {
  const active = usePlayer(p => p.trackId === trackId && (!which || p.which === which));
  const playing = usePlayer(p => p.playing);
  useEffect(() => {
    paint(active ? engine.currentTime() : 0, active);
    if (!active || !playing) return;
    let raf = 0; const loop = () => { paint(engine.currentTime(), true); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [active, playing, trackId, paint]);
  // repaint after seeks while paused
  useEffect(() => usePlayer.subscribe(() => paint(active ? engine.currentTime() : 0, active)), [active, paint]);
}

/** Seek and notify subscribers so paused playheads repaint. */
export const seekTo = (sec: number) => { engine.seek(sec); usePlayer.setState({}); };
