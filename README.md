# DTS Encoder

WAV → DTS Core encoder: React app (`web/`) + Flask API with ffmpeg (`api/`).

## Run with Docker

Needs Docker Desktop. From this folder:

```
docker compose up --build -d
```

Open http://localhost:8080. The image builds the frontend, installs Python and ffmpeg, and runs everything in one container.

| | |
|---|---|
| Stop | `docker compose down` (files are kept) |
| Logs | `docker compose logs -f` |
| Update after code changes | `docker compose up --build -d` |
| Delete all uploads/encodes | `docker compose down -v` |

- **Data:** uploads, encoded files and the database live in the `dts-data` volume, so they survive rebuilds and restarts. To keep them in a normal folder instead, replace `dts-data:/data` with `./data:/data` in `docker-compose.yml`.
- **Settings:** set them under `environment:` in `docker-compose.yml`: `DTS_WORKERS` (parallel encodes, default 4) and `DTS_MAX_UPLOAD_MB`. To use another port, change the left side of `"8080:8080"`.
- **Stopping mid-encode:** `docker compose down` (or a restart) stops ffmpeg cleanly. Interrupted encodes are queued again on the next start.

## Develop without Docker

See `api/README.md` (backend, `python run.py`) and `web/README.md` (frontend, `npm run dev`).
