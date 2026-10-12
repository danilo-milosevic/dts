# DTS encoder — backend

Flask app that stores uploaded WAV files, encodes them to DTS with ffmpeg on a small worker pool, and serves playback audio and STFT spectrograms to the React frontend. The HTTP contract is in `../web/API.md`; the frontend is in `../web`.

## Run

Requirements: Python 3.10+, ffmpeg + ffprobe on PATH (Windows: `winget install Gyan.FFmpeg` or a build from ffmpeg.org).

```bash
cd api
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python run.py                      # http://127.0.0.1:8080
```

Then `npm run dev` in `web/`. Vite proxies `/api` to this server. After `npm run build` in `web/`, `python run.py` also serves the built frontend on the same port, so one process runs everything.

Tests (real ffmpeg encodes, ~5 s): `pip install -r requirements-dev.txt`, then `python -m pytest -q`.

## Configuration (environment variables)

| Variable | Default | |
|---|---|---|
| `DTS_STORAGE` | `api/storage` | uploads, encoded files, logs, SQLite database |
| `DTS_WORKERS` | min(4, CPU count) | parallel encodes |
| `DTS_HOST` / `DTS_PORT` | `127.0.0.1` / `8080` | |
| `FFMPEG` / `FFPROBE` | `ffmpeg` / `ffprobe` | paths if not on PATH |
| `DTS_MAX_UPLOAD_MB` | 8192 | per request |
| `DTS_CORS_ORIGIN` | `*` | only matters when the frontend is on another origin; empty disables |
| `DTS_DIST` | `../web/dist` | built frontend to serve at `/` |

## How it works

```
run.py                 starts waitress (or Flask's server) — never the reloader, it would start the workers twice
dts_api/
  __init__.py          create_app(): store, queue, STFT cache, error handling, CORS, serves ../web/dist
  routes.py            every endpoint in web/API.md
  store.py             SQLite: one JSON document per track / job / preset (+ key-value for settings, queue state)
  worker.py            EncodeQueue: N threads claim the next queued job and run ffmpeg
  media.py             ffprobe analysis, EBU R128 loudness/true peak, the ffmpeg command, DTS → WAV decode, PCM decode for STFT
  stft.py              numpy STFT binned to the client's pixel grid, LRU-cached
  domain.py            defaults, presets, capabilities, naming helpers
storage/
  sources/<track>.wav            uploads (duplicated tracks share the file)
  outputs/<track>/<name>.dts     current encode + decoded.wav (the DTS decoded back to WAV: timed, played for A/B)
  logs/<job>.log                 ffmpeg stderr per job
  dts.sqlite3
```

- **One process, no broker.** The queue is the `jobs` table. Worker threads wait on a condition variable, claim the lowest `order` queued job in a transaction, and run ffmpeg with `-progress pipe:1`. Progress and ETA are written back about every 250 ms. Pause/resume is a flag the workers check before claiming. Cancel terminates the ffmpeg process. Jobs left `encoding` after a crash go back to the queue on start.
- **Encoding** (`media.plan_encode`) maps `EncodeSettings` to one ffmpeg filter graph:
  - Layout and downmix: Lo/Ro, Lt/Rt via `matrix_encoding=dolby`, or plain L/R.
  - Generate LFE: 80 Hz low-pass of L+R when turning stereo into 5.1.
  - Resampling to ≤ 48 kHz.
  - DRC through `acompressor`, and a −1 dB ceiling `alimiter`.
  - Then `-c:a dca -b:a <kbps>k`, written to `.dts`, or to `.dts.wav` (DTS-in-WAV).
  - Bitrates outside the encoder's range are clamped, and the job's `notes` say so.
- **Not used by ffmpeg's DTS Core encoder:** `bitDepth` (stored with the settings only). `outputFolder` and `keepOriginal` are kept for the UI. Files always stay in `storage/` and are downloaded through `GET /api/tracks/:id/output`.
- **DTS Core only.** `codec` must be `core` and `container` `dts` or `wav`; anything else gets a `422`.
- **Spectrograms** are computed here, for the source and the encoded output. The file is decoded once with ffmpeg to float32. Each request is binned to the requested `cols × rows`, so the response is about 1 MB for a full-width lane. Results are cached, and concurrent requests for the same file share one decode.
- **Updates are polled.** The frontend polls `/api/jobs` every 500 ms only while something is queued or encoding. For one user on a local server this is simpler than SSE/WebSockets and costs nothing.
