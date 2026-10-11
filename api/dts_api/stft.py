"""Server-side STFT spectrogram, binned straight to the pixel grid the client draws.

Same algorithm as the browser fallback (src/audio/dsp.worker.ts): at most 3 frames per column,
frequency rows on a log or linear axis, each cell = max power (dB) of the bins/frames it covers.
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

from .media import decode_pcm

WINDOWS = ("hann", "hamming", "blackman")
FFT_SIZES = (256, 512, 1024, 2048, 4096, 8192)


@dataclass(frozen=True)
class StftParams:
    channel: str  # "mix" or a channel index as text
    fft_size: int = 4096
    hop: int = 512
    window: str = "hann"
    scale: str = "log"
    cols: int = 1200
    rows: int = 256
    f_min: float | None = None
    f_max: float | None = None


@dataclass
class StftResult:
    db: np.ndarray  # float32, rows × cols, row 0 = highest frequency
    max_db: float
    f_min: float
    f_max: float
    duration: float


def _window(kind: str, n: int) -> np.ndarray:
    x = 2 * np.pi * np.arange(n) / (n - 1)
    if kind == "hamming":
        return 0.54 - 0.46 * np.cos(x)
    if kind == "blackman":
        return 0.42 - 0.5 * np.cos(x) + 0.08 * np.cos(2 * x)
    return 0.5 - 0.5 * np.cos(x)


def compute(samples: np.ndarray, sr: int, p: StftParams) -> StftResult:
    data = samples.mean(axis=0) if p.channel == "mix" else samples[min(int(p.channel), samples.shape[0] - 1)]
    data = data.astype(np.float32, copy=False)
    n, cols, rows = p.fft_size, p.cols, p.rows
    f_min = max(1.0, p.f_min if p.f_min is not None else (30.0 if p.scale == "log" else 0.0))
    f_max = min(p.f_max or 24000.0, sr / 2)

    if len(data) < n:
        data = np.pad(data, (0, n - len(data)))
    hop = max(p.hop, int(np.ceil((len(data) - n) / (cols * 3))))
    frames = max(1, (len(data) - n) // hop + 1)

    # frequency rows → FFT bin ranges (row 0 at the top = highest frequency)
    bin_hz = sr / n
    r = np.arange(rows)
    if p.scale == "log":
        f0 = f_min * (f_max / f_min) ** ((rows - 1 - r - 0.5) / rows)
        f1 = f_min * (f_max / f_min) ** ((rows - r - 0.5) / rows)
    else:
        f0 = f_min + (f_max - f_min) * ((rows - 1 - r - 0.5) / rows)
        f1 = f_min + (f_max - f_min) * ((rows - r - 0.5) / rows)
    lo = np.maximum(1, np.floor(np.maximum(0, f0) / bin_hz).astype(int))
    hi = np.maximum(lo, np.minimum(n // 2 - 1, np.ceil(f1 / bin_hz).astype(int)))

    win = _window(p.window, n).astype(np.float32)
    norm = n * n / 4
    out = np.full((cols, rows), -200.0, dtype=np.float32)
    frame_col = np.minimum(cols - 1, (np.arange(frames) * cols) // frames)
    chunk = 256
    strided = np.lib.stride_tricks.sliding_window_view(data, n)[::hop][:frames]
    for start in range(0, frames, chunk):
        block = strided[start:start + chunk] * win
        mag = np.abs(np.fft.rfft(block, axis=1)[:, : n // 2]) ** 2
        cells = np.empty((block.shape[0], rows), dtype=np.float32)
        for i in range(rows):
            cells[:, i] = mag[:, lo[i]:hi[i] + 1].max(axis=1)
        cells = 10 * np.log10(cells / norm + 1e-14)
        np.maximum.at(out, frame_col[start:start + chunk], cells)

    # columns no frame landed in (short files) repeat the previous column
    for c in range(1, cols):
        if out[c, 0] == -200.0:
            out[c] = out[c - 1]
    db = np.ascontiguousarray(out.T)
    return StftResult(db=db, max_db=float(db.max()), f_min=f_min, f_max=f_max, duration=samples.shape[1] / sr)


class StftCache:
    """Keeps the last few decoded files and spectrograms in memory."""

    def __init__(self, ffmpeg: str, ffprobe: str, max_audio: int = 2, max_results: int = 48):
        self.ffmpeg, self.ffprobe = ffmpeg, ffprobe
        self._audio: OrderedDict[tuple, tuple[np.ndarray, int]] = OrderedDict()
        self._results: OrderedDict[tuple, StftResult] = OrderedDict()
        self._max_audio, self._max_results = max_audio, max_results
        self._lock = threading.Lock()
        self._inflight: dict[tuple, threading.Lock] = {}

    def _lru(self, cache: OrderedDict, key: tuple, limit: int, make: Callable):
        """Cached value for key; concurrent requests for the same key wait for one computation."""
        with self._lock:
            if key in cache:
                cache.move_to_end(key)
                return cache[key]
            key_lock = self._inflight.setdefault(key, threading.Lock())
        with key_lock:
            with self._lock:
                if key in cache:
                    return cache[key]
            try:
                value = make()
            finally:
                with self._lock:
                    self._inflight.pop(key, None)
            with self._lock:
                cache[key] = value
                while len(cache) > limit:
                    cache.popitem(last=False)
            return value

    def get(self, path: Path, p: StftParams) -> StftResult:
        st = path.stat()
        file_key = (str(path), st.st_mtime_ns, st.st_size)
        audio = lambda: self._lru(self._audio, file_key, self._max_audio, lambda: decode_pcm(self.ffmpeg, self.ffprobe, path))  # noqa: E731
        return self._lru(self._results, (file_key, p), self._max_results, lambda: compute(*audio(), p))

    def drop(self, path: Path) -> None:
        with self._lock:
            for cache in (self._audio, self._results):
                for k in [k for k in cache if (k[0] if isinstance(k[0], str) else k[0][0]) == str(path)]:
                    del cache[k]
