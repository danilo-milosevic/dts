import type { EncodeSettings } from '@/api/types';

/** DTS Core bitrates (kbps). The server raises anything below the per-layout minimum (mono 192, stereo 320, 5.1 768). */
export const bitrateOptions = [384, 768, 1152, 1411, 1509].map(v => ({ value: v, label: `${v} kbps`, hint: v === 1509 ? 'Blu-ray / DVD max' : v === 1411 ? 'DTS-CD / DTS-WAV' : v === 768 ? 'Broadcast, games' : undefined }));

export const downmixOptions: { value: EncodeSettings['downmix']; label: string }[] = [{ value: 'loro', label: 'Lo/Ro stereo' }, { value: 'ltrt', label: 'Lt/Rt (Pro Logic)' }, { value: 'none', label: 'None' }];
export const drcOptions: { value: EncodeSettings['drc']; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'film-light', label: 'Film light' }, { value: 'film-standard', label: 'Film standard' }, { value: 'music-light', label: 'Music light' }, { value: 'music-standard', label: 'Music standard' }, { value: 'speech', label: 'Speech' },
];
export const containerOptions: { value: EncodeSettings['container']; label: string }[] = [{ value: 'dts', label: '.dts (raw)' }, { value: 'wav', label: '.wav (DTS-WAV)' }];
