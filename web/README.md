# DTS Encoder — React + D3

WAV → DTS encoder, built from the Figma design (SI file, Page 2). Frontend: React 18 + TypeScript + Vite, D3 for charts, framer-motion for animation, zustand for state. Backend: Flask + ffmpeg in `../api` (see `../api/README.md` and `API.md`).

## Run

Needs Node 18+, Python 3.10+ and ffmpeg on PATH.

```bash
# 1. backend (terminal 1, from the repo root D:\Projekti\DTS)
cd api
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python run.py                                      # http://127.0.0.1:8080

# 2. frontend (terminal 2)
cd web
npm install
npm run dev                                        # http://localhost:5173 — /api is proxied to :8080
```

Production / single process: `npm run build` in `web/`, then `python api/run.py` (repo root) serves the built app and the API together on http://127.0.0.1:8080.

No backend at hand? Put `VITE_USE_MOCKS=true` in `web/.env` and `npm run dev` runs everything in the browser against the mock server (seed tracks, simulated queue).

## What works

- **Tracks** — import real WAV/BWF files (drag & drop, file picker, folder), search, filter, duplicate, remove. New rows animate in.
- **Compress** — Convert to mono (downmixes playback, the DTS preview and the encode layout), per-channel lanes with header, mute/solo/gain, live peak meters and waveform (click to seek). Source and DTS output cards, metadata, A/B compare.
- **Spectrogram** — STFT computed on the server for the source and the encoded output (FFT size, hop, window, log/linear scale, dynamic range), hover readout, output-vs-source difference view. The not-yet-encoded preview (and mock mode) is computed in a Web Worker.
- **Playback** — Web Audio: play/pause/stop/skip/loop, scrubber, volume, Source/DTS switch, keyboard (Space, Alt+←/→).
- **Encoder settings** — DTS Core presets, bitrate/layout/loudness/output options, live size/ratio/time estimate, save preset, encode.
- **Queue** — live progress, drag-to-reorder, cancel/retry, pause/resume.
- **Compare** — KPI cards with sparklines; D3 scatter (encode time vs size) with legend toggles, linear/log, brush-to-zoom; savings-vs-bitrate curve with a draggable preset marker that updates the selected track; savings-by-file bars (percent/MB, sort); library totals.
- **Settings** — theme (animated circular reveal), accent color, font size, density, corners, motion speed, playback, encoder defaults.

## Styling: design tokens

Every color, spacing, radius, font size, weight, shadow, size and duration lives in `src/theme/tokens.ts` and is written to CSS custom properties on `<html>` at startup and whenever a setting changes. Stylesheets only use `var(--…)`:

- Colors: `--bg-*`, `--text-*`, `--border-*`, `--accent-*`, `--spec-src-0…6` / `--spec-dts-0…6` (spectrogram color maps), per theme.
- Spacing `--space-2…48` (× density), radii `--radius-xs…xl` (× corners), type `--fs-display…numeric` (× font size), `--fw-*`, `--font-family`.
- Sizes `--size-*` (side panel, rail, inspector, lane height, controls…), shadows `--shadow-*`, motion `--dur-*` (× motion speed) and `--ease-*`.

Change defaults in `tokens.ts`; Settings → Display / Appearance scale them at runtime (saved in localStorage).

## Structure

```
src/
  theme/tokens.ts          design tokens → CSS variables
  styles/global.css        base styles, text styles, theme transition
  api/                     client.ts (all endpoints), types.ts, errors.ts, mock/ (in-browser backend + seed data)
  audio/                   engine.ts (playback + meters), dsp.worker.ts (FFT/STFT/peaks),
                           synth.worker.ts (mock audio), cache.ts
  store/                   zustand stores: data (server state + polling), settings, ui, mixer
  hooks/                   element size, playhead, motion, track audio, media query
  components/
    ui/                    Button, IconButton, Tag, Input, Select, Toggle, Checkbox/Radio, Segmented,
                           Slider, Tabs, Progress, Meter, Swatch, Stat, Card, Field, Legend, Tooltip, Menu, Icon
    domain/                TrackRow, RailItem, QueueRow, Dropzone, Toasts
    audio/                 Waveform, Spectrogram, ChannelLane, Transport
    charts/                ScatterChart, SavingsCurve, SavingsBars, Sparkline (D3)
    layout/                SidePanel (list / rail / footer), Workspace + PageHeader
  views/                   EncoderView (+ Inspector, EncoderParts), QueueView, CompareView, ImportView,
                           SettingsPanel
```

## Backend

`../api` — Flask app, SQLite, an in-process ffmpeg worker pool and numpy STFT. Setup, configuration and design notes: `../api/README.md`. Endpoints, payloads and the job lifecycle: `API.md`.
