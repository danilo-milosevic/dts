# DTS Encoder — one image: the React app (built) + the Flask API + ffmpeg.
#   docker compose up --build      →  http://localhost:8080

# ---- 1. build the frontend ---------------------------------------------------------------
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 2. runtime: Python + ffmpeg -----------------------------------------------------------
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DTS_HOST=0.0.0.0 \
    DTS_PORT=8080 \
    DTS_STORAGE=/data \
    DTS_DIST=/app/web/dist

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api
COPY api/requirements.txt ./
RUN pip install -r requirements.txt
COPY api/ ./
COPY --from=web /web/dist /app/web/dist

RUN useradd --create-home --uid 1000 dts && mkdir -p /data && chown dts:dts /data
USER dts
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4).status == 200 else 1)"
CMD ["python", "run.py"]
