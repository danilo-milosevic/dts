"""Format benchmark: after the DTS encode, compress and decompress the same audio with other popular codecs.

Only the numbers are kept (size, encode time, decode time, decoded size); the files are deleted right away.
Every format gets the same input as the DTS encode — same channel layout and sample rate (the encode plan's
layout graph, without DRC / limiter) — so sizes and times compare like for like. Formats that can't carry
that many channels (MP3) are downmixed, which is reported in the result's `note`.
"""
from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .media import MediaError, _run


@dataclass(frozen=True)
class Format:
    id: str
    label: str
    codec: str          # ffmpeg encoder
    muxer: str          # ffmpeg output format
    ext: str
    lossless: bool = False
    max_channels: int = 8
    #: bitrate (kbps) for a channel count; None = lossless / not applicable
    kbps: Callable[[int], int | None] = lambda ch: None
    extra: Callable[[int], list[str]] = lambda ch: []
    rates: tuple[int, ...] = ()   # allowed sample rates (empty = any)
    description: str = ""
    #: channel layout names this encoder insists on, by channel count (e.g. libopus wants 5.1, not 5.1(side))
    layouts: dict[int, str] = field(default_factory=dict)


FORMATS: list[Format] = [
    Format("flac", "FLAC", "flac", "flac", ".flac", lossless=True, extra=lambda ch: ["-compression_level", "5"],
           description="Lossless — bit-identical after decoding"),
    Format("ac3", "AC-3", "ac3", "ac3", ".ac3", max_channels=6, kbps=lambda ch: {1: 192, 2: 384}.get(ch, 640),
           rates=(32000, 44100, 48000), description="Dolby Digital — the other common disc / broadcast surround codec"),
    Format("aac", "AAC", "aac", "adts", ".aac", kbps=lambda ch: {1: 128, 2: 256}.get(ch, min(512, 85 * ch)),
           description="Streaming and video standard (ffmpeg native encoder)"),
    Format("mp3", "MP3", "libmp3lame", "mp3", ".mp3", max_channels=2, kbps=lambda ch: 160 if ch == 1 else 320,
           rates=(32000, 44100, 48000), description="Most compatible lossy format — stereo at most"),
    Format("opus", "Opus", "libopus", "ogg", ".opus", kbps=lambda ch: 64 * ch, rates=(48000,),
           extra=lambda ch: ["-mapping_family", "1"] if ch > 2 else [], layouts={3: "3.0", 4: "quad", 5: "5.0", 6: "5.1", 8: "7.1"},
           description="Modern lossy codec (low latency, high efficiency)"),
]

_STEREO = {1: "mono", 2: "stereo"}


def _pick_rate(sr: int, allowed: tuple[int, ...]) -> int:
    """The source rate if the codec takes it, else the highest allowed rate not above it (or the lowest allowed)."""
    if not allowed or sr in allowed:
        return sr
    lower = [r for r in allowed if r <= sr]
    return max(lower) if lower else min(allowed)


@dataclass
class Result:
    format: str
    label: str
    lossless: bool
    channels: int
    sampleRate: int
    bitrateKbps: int | None
    sizeBytes: int | None = None
    encodeSeconds: float | None = None
    decodeSeconds: float | None = None
    decodedBytes: int | None = None
    note: str | None = None
    error: str | None = None
    description: str = ""

    def asdict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class Benchmark:
    ffmpeg: str
    work_dir: Path
    should_stop: Callable[[], bool] = lambda: False
    formats: list[Format] = field(default_factory=lambda: list(FORMATS))

    def run(self, src: Path, layout_graph: str, channels: int, sample_rate: int, pcm_codec: str,
            on_progress: Callable[[float], None] = lambda f: None) -> list[dict[str, Any]]:
        self.work_dir.mkdir(parents=True, exist_ok=True)
        out: list[dict[str, Any]] = []
        for i, fmt in enumerate(self.formats):
            if self.should_stop():
                break
            out.append(self._one(fmt, src, layout_graph, channels, sample_rate, pcm_codec).asdict())
            on_progress((i + 1) / len(self.formats))
        return out

    def _one(self, fmt: Format, src: Path, layout_graph: str, channels: int, sample_rate: int, pcm_codec: str) -> Result:
        ch = min(channels, fmt.max_channels)
        sr = _pick_rate(sample_rate, fmt.rates)
        notes = []
        graph = layout_graph
        if ch != channels:
            graph = graph.replace("[out]", "[pre]") + f";[pre]aformat=channel_layouts={_STEREO.get(ch, 'stereo')}[out]"
            notes.append(f"{fmt.label} carries at most {fmt.max_channels} ch — downmixed from {channels}")
        if sr != sample_rate:
            graph = graph.replace("[out]", "[rs]") + f";[rs]aresample={sr}[out]"
            notes.append(f"resampled to {sr // 1000} kHz")
        if ch in fmt.layouts:
            graph = graph.replace("[out]", "[lay]") + f";[lay]aformat=channel_layouts={fmt.layouts[ch]}[out]"
        kbps = fmt.kbps(ch)
        r = Result(format=fmt.id, label=fmt.label, lossless=fmt.lossless, channels=ch, sampleRate=sr, bitrateKbps=kbps,
                   note="; ".join(notes) or None, description=fmt.description)
        enc = self.work_dir / f"bench{fmt.ext}"
        dec = self.work_dir / f"bench-{fmt.id}.wav"
        try:
            args = [self.ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", str(src),
                    "-filter_complex", graph, "-map", "[out]", "-c:a", fmt.codec, *(["-b:a", f"{kbps}k"] if kbps else []),
                    *fmt.extra(ch), "-f", fmt.muxer, str(enc)]
            t0 = time.monotonic()
            p = _run(args)
            r.encodeSeconds = round(time.monotonic() - t0, 3)
            if p.returncode != 0:
                raise MediaError(p.stderr.decode(errors="replace").strip().splitlines()[-1] if p.stderr else "encode failed")
            r.sizeBytes = enc.stat().st_size
            t0 = time.monotonic()
            p = _run([self.ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", str(enc), "-map", "0:a:0", "-c:a", pcm_codec, "-f", "wav", str(dec)])
            r.decodeSeconds = round(time.monotonic() - t0, 3)
            if p.returncode != 0:
                raise MediaError(p.stderr.decode(errors="replace").strip().splitlines()[-1] if p.stderr else "decode failed")
            r.decodedBytes = dec.stat().st_size
        except (MediaError, OSError, subprocess.SubprocessError) as e:
            r.error = str(e)[:300]
            if r.sizeBytes is None:
                r.encodeSeconds = None
            r.decodeSeconds = r.decodeSeconds if r.decodedBytes else None
        finally:
            for f in (enc, dec):
                try:
                    f.unlink(missing_ok=True)
                except OSError:
                    pass
        return r
