"""DTS encoder backend: Flask API + in-process ffmpeg worker queue."""
from __future__ import annotations

import atexit
import logging
from pathlib import Path

from flask import Flask, Response, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .config import Config
from .domain import SEED_PRESETS
from .routes import bp
from .stft import StftCache
from .store import Store
from .worker import EncodeQueue


def create_app(cfg: Config | None = None) -> Flask:
    cfg = cfg or Config()
    cfg.ensure_dirs()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = Flask(__name__, static_folder=None)
    app.config["DTS"] = cfg
    app.config["MAX_CONTENT_LENGTH"] = cfg.max_upload_bytes

    store = Store(cfg.db_path)
    if store.count("presets") == 0:
        for p in SEED_PRESETS:
            store.put("presets", dict(p))
    queue = EncodeQueue(store, cfg)
    app.extensions.update(dts_store=store, dts_queue=queue, dts_stft=StftCache(cfg.ffmpeg, cfg.ffprobe))
    app.register_blueprint(bp)

    @app.errorhandler(HTTPException)
    def http_error(e: HTTPException):
        # the frontend shows the plain-text body in a toast
        return Response(e.description or e.name, status=e.code or 500, mimetype="text/plain")

    @app.errorhandler(Exception)
    def server_error(e: Exception):
        app.logger.exception("unhandled error")
        return Response(f"Server error: {e}", status=500, mimetype="text/plain")

    if cfg.cors_origin:
        @app.after_request
        def cors(resp: Response) -> Response:
            if request.path.startswith("/api/"):
                resp.headers["Access-Control-Allow-Origin"] = cfg.cors_origin
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
                resp.headers["Access-Control-Expose-Headers"] = "X-Stft-Cols, X-Stft-Rows, X-Stft-Max-Db, X-Stft-F-Min, X-Stft-F-Max, X-Stft-Duration, Content-Disposition"
            return resp

    # serve the built frontend (npm run build → ../dist) so one process runs everything
    dist: Path = cfg.dist
    if (dist / "index.html").exists():
        @app.get("/", defaults={"path": ""})
        @app.get("/<path:path>")
        def frontend(path: str):
            if path.startswith("api/"):
                return Response("Not found", 404, mimetype="text/plain")
            if path and (dist / path).is_file():
                return send_from_directory(dist, path)
            return send_from_directory(dist, "index.html")  # client-side routes

    if cfg.start_workers:
        queue.start()
        atexit.register(queue.stop)  # don't leave ffmpeg processes behind on Ctrl+C
    return app
