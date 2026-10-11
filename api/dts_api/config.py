"""Server configuration, read from environment variables (all optional)."""
from __future__ import annotations

import glob
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def find_tool(name: str) -> str:
    """Path to ffmpeg/ffprobe: the FFMPEG/FFPROBE variable, then PATH, then common Windows install folders
    (winget, Chocolatey, Scoop, C:\\ffmpeg) — so a fresh install works without editing PATH or restarting the terminal."""
    env = os.environ.get(name.upper())
    if env:
        return env
    if shutil.which(name):
        return name
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA", "")
        home = os.path.expanduser("~")
        patterns = [
            rf"{local}\Microsoft\WinGet\Links\{name}.exe",
            rf"{local}\Microsoft\WinGet\Packages\*FFmpeg*\*\bin\{name}.exe",
            rf"{os.environ.get('ProgramData', 'C:/ProgramData')}\chocolatey\bin\{name}.exe",
            rf"{home}\scoop\shims\{name}.exe",
            rf"C:\ffmpeg\bin\{name}.exe",
            rf"C:\Program Files\ffmpeg\bin\{name}.exe",
        ]
        for pattern in patterns:
            hits = sorted(glob.glob(pattern), reverse=True)  # newest version folder first
            if hits:
                return hits[0]
    return name


@dataclass
class Config:
    #: Where uploads, encoded files and the SQLite database live.
    storage: Path = field(default_factory=lambda: Path(os.environ.get("DTS_STORAGE", API_DIR / "storage")).resolve())
    #: Built frontend (npm run build) served at "/" when present.
    dist: Path = field(default_factory=lambda: Path(os.environ.get("DTS_DIST", API_DIR.parent / "web" / "dist")).resolve())
    ffmpeg: str = field(default_factory=lambda: find_tool("ffmpeg"))
    ffprobe: str = field(default_factory=lambda: find_tool("ffprobe"))
    #: Parallel encodes. The server decides this, not the client.
    workers: int = field(default_factory=lambda: max(1, _int("DTS_WORKERS", min(4, os.cpu_count() or 2))))
    host: str = field(default_factory=lambda: os.environ.get("DTS_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: _int("DTS_PORT", 8080))
    #: Access-Control-Allow-Origin for cross-origin frontends ("" disables CORS headers).
    cors_origin: str = field(default_factory=lambda: os.environ.get("DTS_CORS_ORIGIN", "*"))
    max_upload_bytes: int = field(default_factory=lambda: _int("DTS_MAX_UPLOAD_MB", 8192) * 1024 * 1024)
    #: Start the encode workers (tests may turn this off and drive the queue manually).
    start_workers: bool = True

    @property
    def db_path(self) -> Path:
        return self.storage / "dts.sqlite3"

    def ensure_dirs(self) -> None:
        for sub in ("sources", "outputs", "logs"):
            (self.storage / sub).mkdir(parents=True, exist_ok=True)
