"""HTTP API — the contract in ../API.md (same paths and JSON shapes as the frontend mock)."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from flask import Blueprint, Response, current_app, jsonify, request, send_file
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename

from . import domain as d
from .media import MediaError, analyze
from .stft import FFT_SIZES, WINDOWS, StftParams
from .store import Store, public
from .worker import EncodeQueue, remove_tree

bp = Blueprint("api", __name__, url_prefix="/api")


class ApiError(HTTPException):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


# ------------------------------------------------------------------ helpers
def store() -> Store:
    return current_app.extensions["dts_store"]


def queue() -> EncodeQueue:
    return current_app.extensions["dts_queue"]


def storage() -> Path:
    return current_app.config["DTS"].storage


def track_or_404(id: str) -> dict[str, Any]:
    t = store().get("tracks", id)
    if not t:
        raise ApiError(404, "Track not found")
    return t


def job_or_404(id: str) -> dict[str, Any]:
    j = store().get("jobs", id)
    if not j:
        raise ApiError(404, "Job not found")
    return j


def app_settings() -> dict[str, Any]:
    s = store().kv_get("settings") or {}
    out = {**d.DEFAULT_APP_SETTINGS, **s}
    out["defaults"] = d.merge_settings(d.DEFAULT_SETTINGS, s.get("defaults"))
    return out


def track_defaults(channels: int) -> dict[str, Any]:
    """Encoder settings for a new track: the app defaults, a layout that fits the source, and the preset they match."""
    s = {**app_settings()["defaults"], "layout": d.default_layout(channels)}
    s["presetId"] = d.match_preset(s, list(reversed(store().all("presets"))))
    return s


def body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def visible_jobs() -> list[dict[str, Any]]:
    return [public(j) for j in store().all("jobs", lambda j: not j.get("_cleared"))]


def unique_name(name: str) -> str:
    names = {t["name"] for t in store().all("tracks")}
    if name not in names:
        return name
    stem, ext = (name.rsplit(".", 1) + [""])[:2]
    i = 2
    while f"{stem} ({i}).{ext}" in names:
        i += 1
    return f"{stem} ({i}).{ext}"


# ------------------------------------------------------------------ tracks
@bp.get("/tracks")
def list_tracks():
    return jsonify([public(t) for t in store().all("tracks")])


@bp.get("/tracks/<id>")
def get_track(id: str):
    return jsonify(public(track_or_404(id)))


@bp.post("/tracks")
def upload_tracks():
    files = request.files.getlist("files")
    if not files:
        raise ApiError(400, "No files in the upload (field name: files)")
    cfg = current_app.config["DTS"]
    created = []
    base = store().top("tracks")  # keep the batch in upload order, on top of the list
    for i, f in enumerate(files):
        name = Path(f.filename or "upload.wav").name
        if not re.search(r"\.(wav|bwf|wave)$", name, re.I):
            raise ApiError(415, f"{name}: only WAV / BWF files can be imported")
        tid = d.uid("trk")
        rel = Path("sources") / f"{tid}{Path(secure_filename(name) or 'x.wav').suffix.lower()}"
        dest = cfg.storage / rel
        f.save(dest)
        try:
            meta = analyze(cfg.ffmpeg, cfg.ffprobe, dest)
        except MediaError as e:
            dest.unlink(missing_ok=True)
            raise ApiError(415, f"{name}: {e}")
        t = {"id": tid, "name": unique_name(name), "format": "BWF" if name.lower().endswith(".bwf") else "WAV",
             "sizeBytes": dest.stat().st_size, **meta, "layout": d.layout_label(meta["channels"]),
             "status": "raw", "createdAt": d.now(),
             "settings": track_defaults(meta["channels"]),
             "_source": str(rel)}
        store().put("tracks", t, pos=base + len(files) - i)
        created.append(public(t))
    return jsonify(created), 201


@bp.patch("/tracks/<id>")
def update_track(id: str):
    b = body()
    with store().tx():
        t = track_or_404(id)
        if isinstance(b.get("name"), str) and b["name"].strip():
            t["name"] = b["name"].strip()
        if isinstance(b.get("settings"), dict):
            t["settings"] = d.merge_settings(t["settings"], b["settings"])
        store().put("tracks", t)
    return jsonify(public(t))


@bp.delete("/tracks/<id>")
def delete_track(id: str):
    t = track_or_404(id)
    for j in store().all("jobs", lambda j: j["trackId"] == id):
        if j["status"] == "encoding":
            queue().cancel(j["id"])
        if j["status"] != "done":
            store().delete("jobs", j["id"])
    store().delete("tracks", id)
    stft_cache = current_app.extensions["dts_stft"]
    src = storage() / t["_source"]
    if not store().all("tracks", lambda o: o.get("_source") == t["_source"]):  # duplicates share the source file
        stft_cache.drop(src)
        try:
            src.unlink(missing_ok=True)
        except OSError:  # Windows: file still open by a running request
            current_app.logger.warning("could not delete %s", src)
    remove_tree(storage() / "outputs" / id)
    return jsonify({"ok": True})


@bp.post("/tracks/<id>/duplicate")
def duplicate_track(id: str):
    t = track_or_404(id)
    copy = {k: v for k, v in t.items() if k not in ("output", "error", "_output", "_decoded", "_preview")}
    copy.update(id=d.uid("trk"), name=unique_name(re.sub(r"(\.\w+)$", r" copy\1", t["name"])), status="raw", createdAt=d.now())
    store().put("tracks", copy, pos=store().pos("tracks", id) - 0.001)  # right below the original
    return jsonify(public(copy)), 201


@bp.get("/tracks/<id>/audio")
def track_audio(id: str):
    t = track_or_404(id)
    return send_file(storage() / t["_source"], mimetype="audio/wav", conditional=True, max_age=3600)


def _output_path(t: dict[str, Any], key: str) -> Path:
    if t.get("status") != "encoded" or not t.get(key):
        raise ApiError(404, "Track has no encoded output yet")
    p = storage() / t[key]
    if not p.exists():
        raise ApiError(404, "Output file is missing on the server")
    return p


@bp.get("/tracks/<id>/output")
def track_output(id: str):
    """Download the encoded DTS file."""
    t = track_or_404(id)
    p = _output_path(t, "_output")
    return send_file(p, as_attachment=True, download_name=t["output"]["fileName"], mimetype="audio/vnd.dts", conditional=True)


@bp.get("/tracks/<id>/output/audio")
def track_output_audio(id: str):
    """The DTS output decoded back to WAV: played for A/B; ?download=1 saves it as <name>.decoded.wav."""
    t = track_or_404(id)
    p = _output_path(t, decoded_key(t))
    if request.args.get("download"):
        name = re.sub(r"(\.dts)?\.(wav|dts)$", "", t["output"]["fileName"], flags=re.I) + ".decoded.wav"
        return send_file(p, mimetype="audio/wav", as_attachment=True, download_name=name, conditional=True)
    return send_file(p, mimetype="audio/flac" if p.suffix == ".flac" else "audio/wav", conditional=True, max_age=3600)


def decoded_key(t: dict[str, Any]) -> str:
    """Decoded WAV (tracks encoded before decoding was timed have a FLAC preview instead)."""
    return "_decoded" if t.get("_decoded") else "_preview"


@bp.get("/tracks/<id>/stft")
def track_stft(id: str):
    """STFT spectrogram binned to cols × rows. Body: float32 little-endian dB values, row-major, top row = highest frequency."""
    t = track_or_404(id)
    which = request.args.get("which", "source")
    path = storage() / t["_source"] if which == "source" else _output_path(t, decoded_key(t) if t.get("_decoded") or t.get("_preview") else "_output")
    a = request.args

    def num(key: str, default: float, lo: float, hi: float) -> float:
        try:
            return min(hi, max(lo, float(a.get(key, default))))
        except ValueError:
            raise ApiError(400, f"bad {key}")
    channel = a.get("channel", "mix")
    if channel != "mix" and not channel.isdigit():
        raise ApiError(400, "channel must be 'mix' or a channel index")
    fft = int(num("fftSize", 4096, 256, 8192))
    if fft not in FFT_SIZES:
        raise ApiError(400, f"fftSize must be one of {FFT_SIZES}")
    window = a.get("window", "hann")
    if window not in WINDOWS:
        raise ApiError(400, f"window must be one of {WINDOWS}")
    p = StftParams(channel=channel, fft_size=fft, hop=int(num("hop", 512, 32, 8192)), window=window,
                   scale="linear" if a.get("scale") == "linear" else "log",
                   cols=int(num("cols", 1200, 16, 4096)), rows=int(num("rows", 256, 16, 2048)),
                   f_min=float(a["fMin"]) if a.get("fMin") else None, f_max=float(a["fMax"]) if a.get("fMax") else None)
    try:
        r = current_app.extensions["dts_stft"].get(path, p)
    except MediaError as e:
        raise ApiError(500, f"STFT failed: {e}")
    resp = Response(r.db.astype("<f4").tobytes(), mimetype="application/octet-stream")
    resp.headers.update({"X-Stft-Cols": str(p.cols), "X-Stft-Rows": str(p.rows), "X-Stft-Max-Db": f"{r.max_db:.3f}",
                         "X-Stft-F-Min": f"{r.f_min:.3f}", "X-Stft-F-Max": f"{r.f_max:.3f}", "X-Stft-Duration": f"{r.duration:.4f}",
                         "Cache-Control": "private, max-age=600"})
    return resp


# ------------------------------------------------------------------ presets, settings, capabilities
@bp.get("/presets")
def list_presets():
    return jsonify([public(p) for p in reversed(store().all("presets"))])


@bp.post("/presets")
def create_preset():
    b = body()
    if not isinstance(b.get("name"), str) or not b["name"].strip():
        raise ApiError(400, "Preset name is required")
    p = {"id": d.uid("preset"), "name": b["name"].strip(), "description": str(b.get("description", "")), "tag": str(b.get("tag", "Custom")),
         "tone": b.get("tone", "accent"), "icon": b.get("icon", "tune"), "settings": d.merge_settings({}, b.get("settings"))}
    store().put("presets", p)  # listed oldest first, so it shows up at the end
    return jsonify(p), 201


@bp.get("/settings")
def get_settings():
    return jsonify(app_settings())


@bp.put("/settings")
def put_settings():
    b = body()
    cur = app_settings()
    for k in ("outputDevice", "bufferSize", "previewAfterEncode", "benchmarkFormats"):
        if k in b:
            cur[k] = b[k]
    if isinstance(b.get("defaults"), dict):
        cur["defaults"] = d.merge_settings(cur["defaults"], b["defaults"])
        # the defaults name a preset only while they still match it
        cur["defaults"]["presetId"] = d.match_preset(cur["defaults"], list(reversed(store().all("presets"))))
    store().kv_set("settings", cur)
    return jsonify(cur)


@bp.get("/capabilities")
def capabilities():
    return jsonify(d.CAPABILITIES)


@bp.get("/health")
def health():
    cfg = current_app.config["DTS"]
    return jsonify({"ok": True, "ffmpeg": shutil.which(cfg.ffmpeg) is not None, "ffprobe": shutil.which(cfg.ffprobe) is not None,
                    "workers": cfg.workers, "storage": str(cfg.storage)})


# ------------------------------------------------------------------ jobs & queue
@bp.get("/jobs")
def list_jobs():
    jobs = sorted(visible_jobs(), key=lambda j: j["order"])
    return jsonify({"jobs": jobs, "queue": queue().state})


@bp.post("/jobs")
def create_jobs():
    b = body()
    ids = b.get("trackIds")
    if not isinstance(ids, list) or not ids:
        raise ApiError(400, "trackIds is required")
    created = []
    with store().tx():
        for id in ids:
            t = track_or_404(id)
            if b.get("settings"):
                t["settings"] = d.merge_settings(t["settings"], b["settings"])
            s = t["settings"]
            reason = d.invalid_reason(s)
            if reason:
                raise ApiError(422, f"{t['name']}: {reason}")
            existing = store().all("jobs", lambda j: j["trackId"] == id)
            if any(j["status"] == "encoding" for j in existing):
                continue  # already being encoded
            for j in existing:
                if j["status"] in ("queued", "failed"):
                    store().delete("jobs", j["id"])
            order = max([j["order"] for j in store().all("jobs")] + [0]) + 1
            j = {"id": d.uid("job"), "trackId": id, "trackName": t["name"], "outputName": d.output_name(t, s), "presetLabel": d.preset_label(s),
                 "settings": dict(s), "status": "queued", "progress": 0, "etaSec": None, "inputBytes": t["sizeBytes"], "outputBytes": None,
                 "ratio": None, "encodeSeconds": None, "createdAt": d.now(), "startedAt": None, "finishedAt": None, "error": None, "order": order}
            store().put("jobs", j)
            t.update(status="queued", error=None)
            store().put("tracks", t)
            created.append(j)
    queue().notify()
    return jsonify(created), 201


def _reset_track(track_id: str) -> None:
    t = store().get("tracks", track_id)
    if t and t["status"] in ("queued", "encoding"):
        t["status"] = "encoded" if t.get("_output") else "raw"
        store().put("tracks", t)


@bp.post("/jobs/<id>/cancel")
def cancel_job(id: str):
    j = job_or_404(id)
    if j["status"] == "encoding":
        queue().cancel(id)
    store().delete("jobs", id)
    _reset_track(j["trackId"])
    return jsonify({"ok": True})


@bp.post("/jobs/<id>/retry")
def retry_job(id: str):
    with store().tx():
        j = job_or_404(id)
        t = track_or_404(j["trackId"])
        if j["status"] == "encoding":
            raise ApiError(409, "Job is still encoding")
        reason = d.invalid_reason(t["settings"])
        if reason:
            raise ApiError(422, f"{t['name']}: {reason}")
        j.update(settings=dict(t["settings"]), presetLabel=d.preset_label(t["settings"]), outputName=d.output_name(t, t["settings"]),
                 status="queued", progress=0, etaSec=None, error=None, startedAt=None, finishedAt=None, outputBytes=None, ratio=None,
                 encodeSeconds=None, order=max([x["order"] for x in store().all("jobs")] + [0]) + 1)
        j.pop("_cleared", None)
        store().put("jobs", j)
        t.update(status="queued", error=None)
        store().put("tracks", t)
    queue().notify()
    return jsonify(public(j))


@bp.put("/jobs/order")
def reorder_jobs():
    ids = body().get("ids") or []
    with store().tx():
        queued = {j["id"]: j for j in store().all("jobs", lambda j: j["status"] == "queued")}
        slots = sorted(j["order"] for j in queued.values())  # reuse the queued jobs' order numbers
        for slot, id in zip(slots, [i for i in ids if i in queued]):
            queued[id]["order"] = slot
            store().put("jobs", queued[id])
    return jsonify(sorted(visible_jobs(), key=lambda j: j["order"]))


@bp.delete("/jobs/finished")
def clear_finished():
    with store().tx():
        for j in store().all("jobs", lambda j: j["status"] in ("done", "cancelled") and not j.get("_cleared")):
            j["_cleared"] = True  # hidden from the queue, kept for the Compare history
            store().put("jobs", j)
    return jsonify({"ok": True})


@bp.post("/queue/start")
def start_queue():
    return jsonify(queue().set_running(True))


@bp.post("/queue/pause")
def pause_queue():
    return jsonify(queue().set_running(False))


# ------------------------------------------------------------------ statistics
@bp.get("/stats/compare")
def compare_stats():
    jobs = store().all("jobs", lambda j: j["status"] in ("done", "failed"))
    tracks = {t["id"]: t for t in store().all("tracks")}

    def group(j: dict[str, Any]) -> str:  # output channels: what the encode produced, else what the settings ask for
        ch = (j.get("effective") or {}).get("channels")
        if ch is None:
            layout, src = j["settings"].get("layout"), tracks.get(j["trackId"], {}).get("channels", 2)
            ch = 1 if layout == "1.0" else 2 if layout == "2.0" else min(6, src) if layout in ("5.1", "7.1", "auto") and src > 2 else src
        return d.layout_group(int(ch))
    encodes = [{"file": j["trackName"], "layout": group(j), "inputMB": round(j["inputBytes"] / d.MB, 1), "seconds": round(j["encodeSeconds"] or 0, 2),
                "decodeSeconds": round(j["decodeSeconds"], 3) if j.get("decodeSeconds") is not None else None}
               for j in jobs if j["status"] == "done"]
    session = [{"trackId": j["trackId"], "file": j["trackName"], "layout": group(j), "inputMB": round(j["inputBytes"] / d.MB, 1),
                "outputMB": round(j["outputBytes"] / d.MB, 2) if j.get("outputBytes") else None,
                "status": "done" if j["status"] == "done" else "failed", **({"reason": j["error"]} if j.get("error") else {}),
                "durationSec": tracks.get(j["trackId"], {}).get("durationSec", 0), "encodeSeconds": j.get("encodeSeconds"),
                "decodeSeconds": j.get("decodeSeconds"), "decodedMB": round(j["decodedBytes"] / d.MB, 2) if j.get("decodedBytes") else None,
                "outputBytes": j.get("outputBytes"), "decodedBytes": j.get("decodedBytes"), "inputBytes": j["inputBytes"],
                "benchmarkStatus": j.get("benchmarkStatus"), "benchmarks": j.get("benchmarks") or []}
               for j in jobs if not j.get("_cleared") and j["trackId"] in tracks]
    return jsonify({"encodes": encodes, "sessionFiles": session})
