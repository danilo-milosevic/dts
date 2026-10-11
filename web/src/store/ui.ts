/** Transient UI state: toasts, filters, view mode, STFT parameters. */
import { create } from 'zustand';
import { uid } from '@/lib/format';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export interface Toast { id: string; tone: ToastTone; title: string; message?: string; action?: { label: string; run: () => void }; }

export interface StftUi { fftSize: 1024 | 2048 | 4096 | 8192; hop: 256 | 512 | 1024; window: 'hann' | 'hamming' | 'blackman'; scale: 'log' | 'linear'; rangeDb: number; }

interface UiState {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: string) => void;
  search: string;
  filter: 'all' | 'raw' | 'encoded' | 'failed';
  view: 'waveform' | 'spectrogram';
  outputView: 'output' | 'difference';
  zoom: number;
  stft: StftUi;
  compareLayout: 'all' | 'mono' | 'stereo' | 'surround';
  set: (p: Partial<Omit<UiState, 'set' | 'toast' | 'dismiss'>>) => void;
  setStft: (p: Partial<StftUi>) => void;
}

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  toast: (t, ms = 5000) => { const id = uid('toast'); set(s => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] })); if (ms) setTimeout(() => get().dismiss(id), ms); },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  search: '',
  filter: 'all',
  view: 'waveform',
  outputView: 'output',
  zoom: 1,
  stft: { fftSize: 4096, hop: 512, window: 'hann', scale: 'log', rangeDb: 90 },
  compareLayout: 'all',
  set: p => set(p as Partial<UiState>),
  setStft: p => set(s => ({ stft: { ...s.stft, ...p } })),
}));
