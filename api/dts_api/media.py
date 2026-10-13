"""ffprobe / ffmpeg helpers: upload analysis, the DTS encode command, decoding for playback and STFT."""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .domain import DCA_MAX_KBPS, DCA_MIN_KBPS, DCA_SAMPLE_RATES


class MediaError(Exception):
    """ffmpeg/ffprobe failed or the file is not usable."""


def _run(args: list[str], timeout: float | None = None) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as e:
        raise MediaError(f"{args[0]} not found — install ffmpeg and put it on PATH (or set FFMPEG / FFPROBE)") from e


# ---------------------------------------------------------------- analysis

def probe(ffprobe: str, path: Path) -> dict[str, Any]:
    """First audio stream + container info."""
    r = _run([ffprobe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)], timeout=60)
    if r.returncode != 0:
        raise MediaError(r.stderr.decode(errors="replace").strip() or "ffprobe failed")
    info = json.loads(r.stdout or b"{}")
    audio = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    if not audio:
        raise MediaError("no audio stream")
    return {"stream": audio, "format": info.get("format", {})}


def loudness(ffmpeg: str, path: Path) -> tuple[float, float]:
    """(integrated loudness LUFS, true peak dBFS) via the EBU R128 filter."""
    r = _run([ffmpeg, "-hide_banner", "-nostats", "-nostdin", "-i", str(path), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"])
    text = r.stderr.decode(errors="replace")
    summary = text[text.rfind("Summary:"):]
    lufs = re.search(r"I:\s+(-?[\d.]+|-inf)\s+LUFS", summary)
    peak = re.search(r"Peak:\s+(-?[\d.]+|-inf)\s+dBFS", summary)

    def num(m: re.Match | None, floor: float) -> float:
        if not m or m.group(1) == "-inf":
            return floor
        return round(max(floor, float(m.group(1))), 1)
    return num(lufs, -70.0), num(peak, -120.0)


def analyze(ffmpeg: str, ffprobe: str, path: Path) -> dict[str, Any]:
    """Everything the Track needs from a WAV/BWF file."""
    info = probe(ffprobe, path)
    s, fmt = info["stream"], info["format"]
    if not str(fmt.get("format_name", "")).split(",")[0] in ("wav", "w64", "rf64"):
        raise MediaError("not a WAV/BWF file")
    codec = s.get("codec_name", "")
    if not codec.startswith("pcm_"):
        raise MediaError(f"unsupported WAV encoding ({codec}); only PCM WAV is accepted")
    floating = codec.startswith("pcm_f")
    bits = int(s.get("bits_per_sample") or s.get("bits_per_raw_sample") or 16)
    bits = 32 if floating or bits > 24 else 24 if bits > 16 else 16
    channels = int(s.get("channels") or 1)
    sr = int(s.get("sample_rate") or 48000)
    duration = float(s.get("duration") or fmt.get("duration") or 0)
    lufs, peak = loudness(ffmpeg, path)
    return {"sampleRate": sr, "bitDepth": bits, "floatingPoint": floating, "channels": channels,
            "durationSec": round(duration, 3), "bitrateKbps": round(sr * bits * channels / 1000),
            "peakDbfs": peak, "loudnessLufs": lufs}


# ---------------------------------------------------------------- encode plan

_DRC = {  # EncodeSettings.drc → ffmpeg acompressor (DTS Core has no DRC metadata, so it is applied to the audio)
    "film-light": "acompressor=threshold=-24dB:ratio=2:attack=20:release=250",
    "film-standard": "acompressor=threshold=-20dB:ratio=3:attack=20:release=250",
    "music-light": "acompressor=threshold=-18dB:ratio=1.5:attack=30:release=300",
    "music-standard": "acompressor=threshold=-16dB:ratio=2.5:attack=30:release=300",
    "speech": "acompressor=threshold=-26dB:ratio=4:attack=10:release=150:makeup=2",
}


@dataclass
class EncodePlan:
    args: list[str]
    #: filter graph doing only the layout / sample-rate conversion (no DRC, no limiter), ends in [out] — reused by the format benchmark
    layout_graph: str
    channels: int
    sample_rate: int
    kbps: int
    notes: list[str] = field(default_factory=list)


def upmix_graph(src_ch: int) -> str:
    """Mono / stereo → 5.1(side): stereo on L/R, mono on C, surrounds silent, LFE = 80 Hz low-pass of the input. Ends in [mix]."""
    front = "FL=c0|FR=c1|FC=0*c0" if src_ch == 2 else "FL=0*c0|FR=0*c0|FC=c0"
    lfe_sum = "0.5*c0+0.5*c1" if src_ch == 2 else "c0"
    return (f"[0:a]asplit=2[m][l];[l]pan=mono|c0={lfe_sum},lowpass=f=80[lfe];"
            f"[m]pan=5.0(side)|{front}|SL=0*c0|SR=0*c0[five];"
            "[five][lfe]join=inputs=2:channel_layout=5.1(side):map=0.0-FL|0.1-FR|0.2-FC|1.0-LFE|0.3-SL|0.4-SR[mix]")


def _target_rate(sr: int) -> int:
    if sr in DCA_SAMPLE_RATES:
        return sr
    return 44100 if sr % 11025 == 0 else 48000


def plan_encode(ffmpeg: str, src: Path, out: Path, track: dict[str, Any], s: dict[str, Any]) -> EncodePlan:
    """Build the ffmpeg command for one DTS Core encode from EncodeSettings."""
    src_ch = int(track["channels"])
    layout = s.get("layout", "auto")
    notes: list[str] = []
    pre: list[str] = []  # filters before the layout conversion
    chain: list[str] = []
    graph: str | None = None

    if layout == "1.0":
        target, ch = "mono", 1
    elif layout == "2.0":
        target, ch = "stereo", 2
        if src_ch > 2 and s.get("downmix") == "ltrt":
            pre.append("aresample=matrix_encoding=dolby")
        elif src_ch > 2 and s.get("downmix") == "none":
            pre.append("pan=stereo|c0=FL|c1=FR")
    elif layout in ("5.1", "7.1"):
        if layout == "7.1":
            notes.append("DTS Core carries at most 5.1 — downmixed to 5.1")
        target, ch = "5.1(side)", 6
        if src_ch <= 2:
            graph = upmix_graph(src_ch)
            where = "L/R" if src_ch == 2 else "the centre channel"
            notes.append(f"{'stereo' if src_ch == 2 else 'mono'} source upmixed to 5.1: audio on {where}, LFE from its bass (80 Hz low-pass), surrounds silent")
    else:  # auto: keep the source layout where DTS Core can carry it
        target, ch = {1: ("mono", 1), 2: ("stereo", 2), 3: ("quad(side)", 4), 4: ("quad(side)", 4), 5: ("5.0(side)", 5)}.get(src_ch, ("5.1(side)", 6))

    sr = _target_rate(int(track["sampleRate"]))
    if sr != track["sampleRate"]:
        notes.append(f"resampled {track['sampleRate']} Hz → {sr} Hz (DTS Core max 48 kHz)")
    chain.append(f"aformat=channel_layouts={target}:sample_rates={sr}")
    if s.get("drc") in _DRC:
        chain.append(_DRC[s["drc"]])
    if s.get("limiter"):
        chain.append("alimiter=limit=-1dB:level=0")  # ≈ −1 dBTP ceiling, no auto make-up gain

    kbps = int(s.get("bitrateKbps") or 1509)
    lo = DCA_MIN_KBPS.get(ch, 768)
    if not lo <= kbps <= DCA_MAX_KBPS:
        clamped = min(DCA_MAX_KBPS, max(lo, kbps))
        notes.append(f"{kbps} kbps is outside the DTS Core range for {ch} ch — used {clamped} kbps")
        kbps = clamped

    filters = ",".join(pre + chain)
    fg = f"{graph};[mix]{filters}[out]" if graph else f"[0:a]{filters}[out]"
    args = [ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", str(src),
            "-filter_complex", fg, "-map", "[out]",
            "-c:a", "dca", "-strict", "-2", "-b:a", f"{kbps}k",
            "-progress", "pipe:1", "-nostats",
            "-f", "wav" if s.get("container") == "wav" else "dts", str(out)]
    layout_only = f"aformat=channel_layouts={target}:sample_rates={sr}"
    layout_graph = f"{graph};[mix]{','.join(pre + [layout_only])}[out]" if graph else f"[0:a]{','.join(pre + [layout_only])}[out]"
    return EncodePlan(args=args, layout_graph=layout_graph, channels=ch, sample_rate=sr, kbps=kbps, notes=notes)


def pcm_codec(track: dict[str, Any]) -> str:
    """PCM format matching the source WAV, so decoded and original sizes compare like for like."""
    if track.get("floatingPoint"):
        return "pcm_f32le"
    return {16: "pcm_s16le", 24: "pcm_s24le"}.get(int(track.get("bitDepth") or 24), "pcm_s32le")


def decode_to_wav(ffmpeg: str, encoded: Path, dest: Path, codec: str = "pcm_s24le") -> None:
    """Decode a DTS file back to a PCM WAV (decompression step; also what the browser plays for A/B)."""
    r = _run([ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", str(encoded), "-map", "0:a:0", "-c:a", codec, "-f", "wav", str(dest)])
    if r.returncode != 0 or not dest.exists():
        dest.unlink(missing_ok=True)
        raise MediaError(r.stderr.decode(errors="replace").strip() or "could not decode the DTS output")


# ---------------------------------------------------------------- decoding for STFT

def decode_pcm(ffmpeg: str, ffprobe: str, path: Path) -> tuple[np.ndarray, int]:
    """Whole file as float32 samples shaped (channels, frames), plus the sample rate."""
    s = probe(ffprobe, path)["stream"]
    ch, sr = int(s.get("channels") or 1), int(s.get("sample_rate") or 48000)
    r = _run([ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le", "-"])
    if r.returncode != 0:
        raise MediaError(r.stderr.decode(errors="replace").strip() or "decode failed")
    data = np.frombuffer(r.stdout, dtype="<f4")
    data = data[: len(data) - len(data) % ch]
    return data.reshape(-1, ch).T.copy(), sr
