import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Track } from '@/api/types';
import { engine } from '@/audio/engine';
import { useUi } from '@/store/ui';

/** Loads source + DTS (or preview) audio for a track and hands both to the playback engine. */
export function useTrackAudio(track: Track | null) {
  const [source, setSource] = useState<AudioBuffer | null>(null);
  const [output, setOutput] = useState<AudioBuffer | null>(null);
  const id = track?.id;
  const outKey = track ? `${track.output?.sizeBytes ?? 'pre'}:${track.output?.bitrateKbps ?? track.settings.bitrateKbps}:${track.settings.layout}` : '';

  useEffect(() => {
    let live = true; setSource(null); if (!track) return;
    api.tracks.audio(track).then(b => { if (live) { setSource(b); engine.load(track.id, b); } })
      .catch(e => useUi.getState().toast({ tone: 'error', title: `Could not load ${track.name}`, message: String(e) }));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let live = true; if (!track || !source) return;
    const t = setTimeout(() => api.tracks.outputAudio(track).then(b => { if (live) { setOutput(b); engine.setDts(b); } }).catch(() => undefined), 350);
    return () => { live = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source, outKey]);

  return { source, output: source ? output : null };
}
