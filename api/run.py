"""Start the DTS encoder server:  python run.py   (see README.md for options)."""
from __future__ import annotations

import logging
import shutil
import signal
import sys

from dts_api import create_app
from dts_api.config import Config


def main() -> None:
    cfg = Config()
    for tool in (cfg.ffmpeg, cfg.ffprobe):
        if not shutil.which(tool):
            sys.exit(f"'{tool}' was not found. Install ffmpeg (https://ffmpeg.org/download.html) and put it on PATH, "
                     f"or set FFMPEG / FFPROBE to the executables.")
    app = create_app(cfg)
    # docker stop sends SIGTERM: exit normally so running ffmpeg jobs are stopped (they resume on the next start)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    log = logging.getLogger("dts")
    log.info("ffmpeg: %s", shutil.which(cfg.ffmpeg))
    log.info("storage: %s · workers: %d · http://%s:%d", cfg.storage, cfg.workers, cfg.host, cfg.port)
    try:
        from waitress import serve
    except ImportError:  # Flask's own server is fine for a local tool; never use the reloader (it would start the workers twice)
        app.run(host=cfg.host, port=cfg.port, threaded=True, use_reloader=False)
    else:
        serve(app, host=cfg.host, port=cfg.port, threads=16, max_request_body_size=cfg.max_upload_bytes)


if __name__ == "__main__":
    main()
