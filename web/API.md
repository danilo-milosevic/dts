# DTS Encoder — API contract

The frontend talks to the backend only through `src/api/client.ts`. The backend is the Flask app in `../api` (setup in `../api/README.md`); in development Vite proxies `/api` to it (`VITE_API_PROXY`, default `http://127.0.0.1:8080`). `VITE_USE_MOCKS=true` answers every call with the in-browser mock (`src/api/mock/server.ts`) instead; `VITE_API_BASE` is only needed when the API is on a different origin.

All bodies are JSON unless noted. Types are in `src/api/types.ts` (`Track`, `EncodeSettings`, `Job`, `QueueState`, `Preset`, `CompareStats`, `AppSettingsDto`, `Capabilities`). Errors: any non-2xx status with a plain-text message (shown in a toast).

## Tracks
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/tracks` | — | `Track[]` |
| GET | `/api/tracks/:id` | — | `Track` |
| POST | `/api/tracks` | `multipart/form-data`, field `files` (one or more WAV/BWF) | `Track[]` created (server analyses sample rate, bit depth, channels, peak, loudness) |
| PATCH | `/api/tracks/:id` | `{ name?, settings?: Partial<EncodeSettings> }` | `Track` |
| DELETE | `/api/tracks/:id` | — | `{ ok: true }` (also drops queued jobs for the track) |
| POST | `/api/tracks/:id/duplicate` | — | `Track` |
| GET | `/api/tracks/:id/audio` | — | the uploaded WAV, for playback and the waveform |
| GET | `/api/tracks/:id/output` | — | download the encoded file (`Content-Disposition: attachment`) — encoded tracks only |
| GET | `/api/tracks/:id/output/audio` | — | the DTS output decoded to FLAC (browsers cannot play DTS), for A/B — encoded tracks only |
| GET | `/api/tracks/:id/stft` | query, see below | spectrogram (binary) |

### STFT

`GET /api/tracks/:id/stft?which=source|output&channel=mix|0…&fftSize=4096&hop=512&window=hann|hamming|blackman&scale=log|linear&cols=1200&rows=256[&fMin=30&fMax=24000]`

Computed on the server and already binned to the `cols × rows` pixel grid (at most 3 FFT frames per column; each cell is the max power of the frames/bins it covers). Body: `float32` little-endian dB values, row-major, row 0 = highest frequency. Headers: `X-Stft-Cols`, `X-Stft-Rows`, `X-Stft-Max-Db`, `X-Stft-F-Min`, `X-Stft-F-Max`, `X-Stft-Duration`. `which=output` needs an encoded track (404 otherwise). `fftSize` ∈ 256…8192 (powers of two).

## Presets
| GET | `/api/presets` | — | `Preset[]` |
|---|---|---|---|
| POST | `/api/presets` | `Omit<Preset, 'id'>` | `Preset` |

## Encode queue
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/jobs` | — | `{ jobs: Job[], queue: QueueState }` — polled every 500 ms while anything is queued/encoding |
| POST | `/api/jobs` | `{ trackIds: string[], settings?: Partial<EncodeSettings> }` | `Job[]` created (status `queued`); `422` when the settings ask for something the encoder cannot do (see capabilities) |
| POST | `/api/jobs/:id/cancel` | — | `{ ok: true }` |
| POST | `/api/jobs/:id/retry` | — | `Job` (re-queued with the track's current settings) |
| PUT | `/api/jobs/order` | `{ ids: string[] }` (queued job ids in the new order) | `Job[]` |
| DELETE | `/api/jobs/finished` | — | `{ ok: true }` (hidden from the queue; kept for Compare history) |
| POST | `/api/queue/start` | — | `QueueState` |
| POST | `/api/queue/pause` | — | `QueueState` |

`EncodeSettings.layout` can be `'1.0'` (mono downmix), `'2.0'`, `'5.1'`, `'7.1'` or `'auto'`.

Job lifecycle: `queued → encoding → done | failed`. Cancelling removes the job. While encoding, the server updates `progress` (0–1, from ffmpeg's `-progress` output) and `etaSec`; on `done` it fills `outputBytes`, `ratio`, `encodeSeconds`, `notes` (adjustments such as resampling or a bitrate clamp) and sets the track's `status: 'encoded'` and `output` (incl. the real `bitrateKbps`, `channels`, `sampleRate`). On failure it sets `error` (ffmpeg's message) and the track's `status: 'error'`.

**Progress updates are polled, not pushed.** The client polls `GET /api/jobs` (+ `/api/tracks`) every 500 ms only while a job is queued or encoding, and stops when the queue is idle. For one user on a local server that costs nothing and needs no extra connection type; if push is ever needed, a Server-Sent Events endpoint can replace the poll without changing the job model.

## Statistics (Compare page)
| GET | `/api/stats/compare` | — | `CompareStats` |
|---|---|---|---|

- `encodes`: every finished encode `{ file, layout, inputMB, seconds }` (history + session) — scatter chart. `layout` is the output channel group: `mono`, `stereo` or `surround`.
- `savingsVsBitrate`: savings curves for stereo and 5.1 sources and the current preset bitrate.
- `sessionFiles`: per-file result for this session `{ trackId, file, layout, inputMB, outputMB | null, status, reason?, durationSec, encodeSeconds }`.

## Capabilities
| GET | `/api/capabilities` | — | `Capabilities` — containers and layouts, bitrate limits per output channel count, notes for adapted layouts |
|---|---|---|---|

The app encodes **DTS Core** (Coherent Acoustics) with ffmpeg's `dca` encoder: up to 5.1, 48 kHz, 192–3840 kbps (minimum depends on channels: mono 192, stereo 320, 5.1 768). `EncodeSettings.codec` is always `'core'` and `container` is `'dts'` or `'wav'`; anything else is rejected with `422`. Sources above 48 kHz are resampled; 7.1 is downmixed to 5.1.

| GET | `/api/health` | — | `{ ok, ffmpeg, ffprobe, workers, storage }` |
|---|---|---|---|

## App settings
| GET | `/api/settings` | — | `AppSettingsDto` (output device, buffer size, preview-after-encode, default `EncodeSettings`) |
|---|---|---|---|
| PUT | `/api/settings` | `Partial<AppSettingsDto>` | `AppSettingsDto` |

Appearance settings (theme, accent, font size, density, corners, motion) are client-only and stored in `localStorage`. Encode parallelism is decided by the server (`QueueState.workers`).
