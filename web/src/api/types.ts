/** Shared API types — the contract the backend should implement (see API.md). */

/** The only bitstream this app writes: DTS Core (Coherent Acoustics, via ffmpeg's dca encoder). */
export type Codec = 'core';
/** Output channel group, used to compare encodes on the Compare page. */
export type LayoutGroup = 'mono' | 'stereo' | 'surround';
export type ChannelLayout = 'Mono' | 'Stereo' | '5.1' | '7.1';
export type TrackStatus = 'raw' | 'queued' | 'encoding' | 'encoded' | 'error';

export interface Track {
  id: string;
  name: string;
  format: 'WAV' | 'BWF';
  sizeBytes: number;
  durationSec: number;
  sampleRate: number;
  bitDepth: 16 | 24 | 32;
  floatingPoint?: boolean;
  channels: number;
  layout: ChannelLayout;
  bitrateKbps: number;
  peakDbfs: number;
  loudnessLufs: number;
  status: TrackStatus;
  createdAt: string;
  /** Present once encoded. */
  output?: {
    fileName: string; sizeBytes: number; codec: Codec; bitrateKbps: number; encodeSeconds: number; channels?: number; sampleRate?: number;
    /** The DTS file decoded back to WAV after encoding (decompression): time taken and WAV size. Null if decoding failed. */
    decodeSeconds?: number | null; decodedBytes?: number | null;
  };
  error?: string;
  /** Per-track encoder settings (last used). */
  settings: EncodeSettings;
  /** Mock-only: seed + style used to synthesize preview audio. */
  synth?: { seed: number; style: 'music' | 'ambience' | 'dialog' | 'fx' | 'score' };
}

export interface EncodeSettings {
  presetId: string | null;
  codec: Codec;
  bitrateKbps: number;
  bitDepth: 16 | 24;
  layout: '1.0' | '2.0' | '5.1' | '7.1' | 'auto';
  downmix: 'loro' | 'ltrt' | 'none';
  generateLfe: boolean;
  drc: 'none' | 'film-light' | 'film-standard' | 'music-light' | 'music-standard' | 'speech';
  limiter: boolean;
  container: 'dts' | 'wav';
  outputFolder: string;
  keepOriginal: boolean;
}

export interface Preset { id: string; name: string; description: string; tag: string; tone: 'success' | 'dts' | 'accent' | 'info'; icon: string; settings: Partial<EncodeSettings>; }

export type JobStatus = 'queued' | 'encoding' | 'done' | 'failed' | 'cancelled';
export interface Job {
  id: string;
  trackId: string;
  trackName: string;
  outputName: string;
  presetLabel: string;
  settings: EncodeSettings;
  status: JobStatus;
  progress: number; // 0…1
  etaSec: number | null;
  inputBytes: number;
  outputBytes: number | null;
  ratio: number | null;
  encodeSeconds: number | null;
  /** Decoding the DTS result back to WAV (filled when done). */
  decodeSeconds?: number | null;
  decodedBytes?: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  order: number;
  /** Server notes about adjustments made for the encoder (resampling, bitrate clamp, downmix). */
  notes?: string[];
}

export interface QueueState { running: boolean; workers: number; maxWorkers: number; startedAt: string | null; }


/** One finished encode: `seconds` = encode time, `decodeSeconds` = decoding the DTS back to WAV (null for older encodes). */
export interface EncodeSample { file: string; layout: LayoutGroup; inputMB: number; seconds: number; decodeSeconds?: number | null; }
export interface CompareStats {
  encodes: EncodeSample[];
  sessionFiles: { trackId: string; file: string; layout: LayoutGroup; inputMB: number; outputMB: number | null; status: 'done' | 'failed'; reason?: string; durationSec: number; encodeSeconds: number | null; decodeSeconds?: number | null; decodedMB?: number | null }[];
}

export interface AppSettingsDto { outputDevice: string; bufferSize: number; previewAfterEncode: boolean; defaults: EncodeSettings; }

/** Limits of the server's encoder (GET /api/capabilities), used to disable options the encoder would reject. */
export interface Capabilities {
  encoder: string;
  containers: EncodeSettings['container'][];
  layouts: EncodeSettings['layout'][];
  maxChannels: number;
  maxSampleRate: number;
  /** min: lowest bitrate per output channel count ("1", "2", … "6"). */
  bitrateKbps: { min: Record<string, number>; max: number };
  /** Explanations for layouts the encoder adapts (e.g. 7.1 → 5.1). */
  layoutNotes: Partial<Record<EncodeSettings['layout'], string>>;
}
