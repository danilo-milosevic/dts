"""Domain defaults and helpers shared by the routes and the encode workers.

The JSON shapes mirror the frontend types in src/api/types.ts.
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any

MB = 1_000_000  # decimal megabytes, as shown in the UI

# --- what this server encodes --------------------------------------------------------------
# DTS Core (Coherent Acoustics) through ffmpeg's "dca" encoder — the only DTS encoder ffmpeg has.
DCA_SAMPLE_RATES = (8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)
DCA_MAX_KBPS = 3840
#: Lowest bitrate the dca encoder accepts per output channel count (measured with ffmpeg 6/7).
DCA_MIN_KBPS = {1: 192, 2: 320, 3: 384, 4: 512, 5: 640, 6: 768}
CONTAINERS = ("dts", "wav")

CAPABILITIES: dict[str, Any] = {
    "encoder": "ffmpeg dca (DTS Core / Coherent Acoustics)",
    "containers": list(CONTAINERS),
    "layouts": ["1.0", "2.0", "5.1", "7.1", "auto"],
    "maxChannels": 6,
    "maxSampleRate": 48000,
    "bitrateKbps": {"min": DCA_MIN_KBPS, "max": DCA_MAX_KBPS},
    "layoutNotes": {"7.1": "DTS Core carries at most 5.1 — 7.1 sources are downmixed to 5.1."},
}

DEFAULT_SETTINGS: dict[str, Any] = {
    "presetId": "bluray-stereo",
    "codec": "core",
    "bitrateKbps": 1509,
    "bitDepth": 24,
    "layout": "2.0",
    "downmix": "loro",
    "drc": "none",
    "limiter": True,
    "container": "dts",
    "outputFolder": "DTS Exports",
    "keepOriginal": True,
}

DEFAULT_APP_SETTINGS: dict[str, Any] = {
    "outputDevice": "default",
    "bufferSize": 512,
    "previewAfterEncode": True,
    #: after each DTS encode, also compress/decompress with FLAC, AC-3, AAC, MP3 and Opus for the Compare page
    "benchmarkFormats": True,
    "defaults": DEFAULT_SETTINGS,
}

SEED_PRESETS: list[dict[str, Any]] = [
    {"id": "bluray-stereo", "name": "Blu-ray stereo", "description": "DTS Core · 1509 kbps · 2.0", "tag": "Core", "tone": "dts", "icon": "headphones",
     "settings": {"codec": "core", "bitrateKbps": 1509, "layout": "2.0", "container": "dts"}},
    {"id": "bluray-51", "name": "Blu-ray 5.1", "description": "DTS Core · 1509 kbps · 5.1", "tag": "Surround", "tone": "success", "icon": "surround",
     "settings": {"codec": "core", "bitrateKbps": 1509, "layout": "5.1", "container": "dts"}},
    {"id": "dts-cd", "name": "DTS-CD / DTS-WAV", "description": "DTS Core · 1411 kbps · 5.1 · .wav", "tag": "WAV", "tone": "info", "icon": "library_music",
     "settings": {"codec": "core", "bitrateKbps": 1411, "layout": "5.1", "container": "wav"}},
    {"id": "game-audio", "name": "Game audio", "description": "DTS Core · 768 kbps · 5.1 · small files", "tag": "Compact", "tone": "accent", "icon": "bolt",
     "settings": {"codec": "core", "bitrateKbps": 768, "layout": "5.1", "container": "dts"}},
    {"id": "dialog-mono", "name": "Dialog mono", "description": "DTS Core · 384 kbps · 1.0", "tag": "Mono", "tone": "accent", "icon": "graphic_eq",
     "settings": {"codec": "core", "bitrateKbps": 384, "layout": "1.0", "container": "dts"}},
]

CODEC_LABEL = "DTS Core"


def uid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def layout_label(channels: int) -> str:
    return "Mono" if channels <= 1 else "Stereo" if channels == 2 else "5.1" if channels <= 6 else "7.1"


def default_layout(channels: int) -> str:
    return "auto" if channels == 1 else "5.1" if channels >= 6 else "2.0"


def output_name(track: dict[str, Any], s: dict[str, Any]) -> str:
    base = re.sub(r"\.(wav|bwf)$", "", track["name"], flags=re.I)
    return base + (".dts.wav" if s.get("container") == "wav" else ".dts")


def preset_label(s: dict[str, Any]) -> str:
    layout = "Auto" if s["layout"] == "auto" else "Mono" if s["layout"] == "1.0" else s["layout"]
    return f"{CODEC_LABEL} · {layout} · {s['bitrateKbps']} kbps"


def merge_settings(base: dict[str, Any], patch: dict[str, Any] | None) -> dict[str, Any]:
    """Apply a partial EncodeSettings, ignoring unknown keys (and dropping retired ones such as dialnormDb)."""
    out = {k: v for k, v in base.items() if k in DEFAULT_SETTINGS}
    for k, v in (patch or {}).items():
        if k in DEFAULT_SETTINGS:
            out[k] = v
    return out


def match_preset(s: dict[str, Any], presets: list[dict[str, Any]]) -> str | None:
    """Id of the first preset whose settings all equal these settings, else None ("Custom")."""
    for p in presets:
        if p.get("settings") and all(s.get(k) == v for k, v in p["settings"].items()):
            return p["id"]
    return None


def invalid_reason(s: dict[str, Any]) -> str | None:
    """Why these settings cannot be encoded, or None when they can."""
    if s.get("codec", "core") != "core":
        return f"unknown codec '{s.get('codec')}' — only DTS Core ('core') is supported"
    if s.get("container") not in CONTAINERS:
        return f"unknown container '{s.get('container')}' — use 'dts' or 'wav'"
    return None


def layout_group(channels: int) -> str:
    """Output channel group the Compare page groups encodes by."""
    return "mono" if channels <= 1 else "stereo" if channels == 2 else "surround"
