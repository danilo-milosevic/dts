/** Decoded audio for tracks (source and DTS preview), shared by playback, waveform and STFT. */
const sources = new Map<string, AudioBuffer>();
const outputs = new Map<string, AudioBuffer>();
const aliases = new Map<string, string>();
const pending = new Map<string, Promise<AudioBuffer>>();

const key = (id: string) => aliases.get(id) ?? id;

export const audioCache = {
  getSource: (id: string) => sources.get(key(id)),
  setSource: (id: string, b: AudioBuffer) => { sources.set(id, b); },
  getOutput: (id: string) => outputs.get(key(id)),
  setOutput: (id: string, b: AudioBuffer) => { outputs.set(key(id), b); },
  alias: (newId: string, existing: string) => { aliases.set(newId, key(existing)); },
  drop: (id: string) => { sources.delete(id); outputs.delete(id); aliases.delete(id); },
  /** De-duplicates concurrent loads of the same buffer. */
  once: (k: string, load: () => Promise<AudioBuffer>) => {
    const real = k.replace(/^(src|out):([^:]+)/, (_, p, id) => `${p}:${key(id)}`);
    if (!pending.has(real)) pending.set(real, load().catch(e => { pending.delete(real); throw e; }));
    return pending.get(real)!;
  },
};
