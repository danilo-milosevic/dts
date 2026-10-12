"""End-to-end API tests with real ffmpeg encodes.  Run:  python -m pytest -q  (from the api folder)."""
from __future__ import annotations

import io
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import pytest

from dts_api import create_app
from dts_api.config import Config, find_tool

FFMPEG = find_tool("ffmpeg")
pytestmark = pytest.mark.skipif(not shutil.which(FFMPEG), reason="ffmpeg not installed")


def make_wav(path: Path, seconds: float = 3, channels: int = 2, rate: int = 48000, codec: str = "pcm_s24le") -> Path:
    layout = {1: "mono", 2: "stereo", 6: "5.1"}[channels]
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}:sample_rate={rate}",
                    "-af", f"aformat=channel_layouts={layout}", "-c:a", codec, str(path)], check=True)
    return path


@pytest.fixture()
def client(tmp_path):
    app = create_app(Config(storage=tmp_path / "storage", dist=tmp_path / "nodist", workers=2))
    app.testing = True
    yield app.test_client()
    app.extensions["dts_queue"].stop()
    app.extensions["dts_store"].close()


def upload(client, path: Path, name: str | None = None):
    with open(path, "rb") as f:
        r = client.post("/api/tracks", data={"files": (io.BytesIO(f.read()), name or path.name)}, content_type="multipart/form-data")
    assert r.status_code == 201, r.data
    return r.get_json()[0]


def wait_done(client, track_id: str, timeout: float = 60):
    end = time.time() + timeout
    while time.time() < end:
        t = client.get(f"/api/tracks/{track_id}").get_json()
        if t["status"] in ("encoded", "error"):
            return t
        time.sleep(0.2)
    raise AssertionError("encode timed out")


def test_upload_analyses_wav(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Tone.wav", channels=2))
    assert t["sampleRate"] == 48000 and t["channels"] == 2 and t["bitDepth"] == 24 and t["layout"] == "Stereo"
    assert 2.9 < t["durationSec"] < 3.1 and t["status"] == "raw"
    assert -30 < t["loudnessLufs"] < 0 and t["peakDbfs"] < 0
    assert "_source" not in t
    assert client.get(f"/api/tracks/{t['id']}/audio").status_code == 200


def test_rejects_non_wav(client):
    r = client.post("/api/tracks", data={"files": (io.BytesIO(b"hello"), "notes.txt")}, content_type="multipart/form-data")
    assert r.status_code == 415 and b"WAV" in r.data
    r = client.post("/api/tracks", data={"files": (io.BytesIO(b"RIFF....garbage"), "bad.wav")}, content_type="multipart/form-data")
    assert r.status_code == 415


def test_encode_stereo_end_to_end(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Song.wav"))
    jobs = client.post("/api/jobs", json={"trackIds": [t["id"]], "settings": {"bitrateKbps": 768, "drc": "film-light"}}).get_json()
    assert jobs[0]["status"] == "queued" and jobs[0]["outputName"] == "Song.dts"
    done = wait_done(client, t["id"])
    assert done["status"] == "encoded", done.get("error")
    out = done["output"]
    assert out["fileName"] == "Song.dts" and out["bitrateKbps"] == 768 and out["sizeBytes"] > 0
    j = client.get("/api/jobs").get_json()["jobs"][0]
    assert j["status"] == "done" and j["ratio"] > 1 and j["progress"] == 1
    dl = client.get(f"/api/tracks/{t['id']}/output")
    assert dl.status_code == 200 and "Song.dts" in dl.headers["Content-Disposition"]
    assert dl.data[:4] == b"\x7f\xfe\x80\x01"  # DTS core sync word
    pv = client.get(f"/api/tracks/{t['id']}/output/audio")
    assert pv.status_code == 200 and pv.data[:4] == b"RIFF"


def test_mono_and_wav_container_and_bitrate_clamp(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Dialog.wav"))
    client.post("/api/jobs", json={"trackIds": [t["id"]], "settings": {"layout": "1.0", "container": "wav", "bitrateKbps": 64}})
    done = wait_done(client, t["id"])
    assert done["status"] == "encoded", done.get("error")
    assert done["output"]["fileName"] == "Dialog.dts.wav" and done["output"]["channels"] == 1
    assert done["output"]["bitrateKbps"] == 192  # clamped to the DTS Core minimum for mono
    job = client.get("/api/jobs").get_json()["jobs"][0]
    assert any("192" in n for n in job["notes"])


def test_surround_and_hires_resample(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Amb.wav", channels=6, rate=96000))
    assert t["layout"] == "5.1" and t["settings"]["layout"] == "5.1"
    client.post("/api/jobs", json={"trackIds": [t["id"]]})
    done = wait_done(client, t["id"])
    assert done["status"] == "encoded", done.get("error")
    assert done["output"]["channels"] == 6 and done["output"]["sampleRate"] == 48000


def test_only_dts_core_is_accepted(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "A.wav"))
    r = client.post("/api/jobs", json={"trackIds": [t["id"]], "settings": {"codec": "ma"}})
    assert r.status_code == 422 and b"only DTS Core" in r.data
    r = client.post("/api/jobs", json={"trackIds": [t["id"]], "settings": {"codec": "core", "container": "dtshd"}})
    assert r.status_code == 422 and b"container" in r.data
    caps = client.get("/api/capabilities").get_json()
    assert caps["containers"] == ["dts", "wav"] and "codecs" not in caps and caps["bitrateKbps"]["min"]["6"] == 768


def test_pause_reorder_cancel(client, tmp_path):
    client.post("/api/queue/pause")
    a = upload(client, make_wav(tmp_path / "A.wav"))
    b = upload(client, make_wav(tmp_path / "B.wav"))
    ja, jb = client.post("/api/jobs", json={"trackIds": [a["id"], b["id"]]}).get_json()
    order = client.put("/api/jobs/order", json={"ids": [jb["id"], ja["id"]]}).get_json()
    assert [j["id"] for j in order] == [jb["id"], ja["id"]]
    time.sleep(0.5)
    assert all(j["status"] == "queued" for j in client.get("/api/jobs").get_json()["jobs"])  # paused
    assert client.post(f"/api/jobs/{ja['id']}/cancel").get_json() == {"ok": True}
    assert client.get(f"/api/tracks/{a['id']}").get_json()["status"] == "raw"
    assert client.post("/api/queue/start").get_json()["running"] is True
    assert wait_done(client, b["id"])["status"] == "encoded"
    assert client.delete("/api/jobs/finished").get_json() == {"ok": True}
    assert client.get("/api/jobs").get_json()["jobs"] == []
    stats = client.get("/api/stats/compare").get_json()
    assert len(stats["encodes"]) == 1 and stats["sessionFiles"] == []  # history kept, queue cleared
    assert stats["encodes"][0]["layout"] == "stereo" and "savingsVsBitrate" not in stats


def test_stft(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "S.wav", seconds=2))
    r = client.get(f"/api/tracks/{t['id']}/stft?which=source&channel=0&fftSize=2048&hop=256&cols=200&rows=64&scale=log")
    assert r.status_code == 200
    cols, rows = int(r.headers["X-Stft-Cols"]), int(r.headers["X-Stft-Rows"])
    db = np.frombuffer(r.data, dtype="<f4").reshape(rows, cols)
    assert (cols, rows) == (200, 64) and abs(float(r.headers["X-Stft-Duration"]) - 2) < 0.01
    # the 440 Hz tone is the loudest row
    f_min, f_max = float(r.headers["X-Stft-F-Min"]), float(r.headers["X-Stft-F-Max"])
    peak_row = int(db[:, 100].argmax())
    freq = f_min * (f_max / f_min) ** ((rows - peak_row - 0.5) / rows)
    assert 380 < freq < 520
    assert client.get(f"/api/tracks/{t['id']}/stft?which=output").status_code == 404  # not encoded yet
    assert client.get(f"/api/tracks/{t['id']}/stft?fftSize=1000").status_code == 400


def test_duplicate_patch_delete(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Orig.wav"))
    c = client.post(f"/api/tracks/{t['id']}/duplicate").get_json()
    assert c["name"] == "Orig copy.wav"
    names = [x["name"] for x in client.get("/api/tracks").get_json()]
    assert names == ["Orig.wav", "Orig copy.wav"]
    p = client.patch(f"/api/tracks/{c['id']}", json={"settings": {"bitrateKbps": 1152, "bogus": 1}}).get_json()
    assert p["settings"]["bitrateKbps"] == 1152 and "bogus" not in p["settings"]
    client.delete(f"/api/tracks/{t['id']}")
    assert client.get(f"/api/tracks/{c['id']}/audio").status_code == 200  # shared source survives
    client.delete(f"/api/tracks/{c['id']}")
    assert client.get("/api/tracks").get_json() == []


def test_settings_and_presets(client):
    s = client.put("/api/settings", json={"bufferSize": 1024, "defaults": {"bitrateKbps": 768}}).get_json()
    assert s["bufferSize"] == 1024 and s["defaults"]["bitrateKbps"] == 768 and s["defaults"]["codec"] == "core"
    presets = client.get("/api/presets").get_json()
    assert presets[0]["id"] == "bluray-stereo"
    new = client.post("/api/presets", json={"name": "Mine", "settings": {"bitrateKbps": 1152}}).get_json()
    assert client.get("/api/presets").get_json()[-1]["id"] == new["id"]


def test_default_bitrate_applies_to_new_tracks(client, tmp_path):
    s = client.put("/api/settings", json={"defaults": {"bitrateKbps": 768}}).get_json()
    assert s["defaults"]["bitrateKbps"] == 768 and s["defaults"]["presetId"] is None  # no longer the 1509 preset
    t = upload(client, make_wav(tmp_path / "New.wav"))
    assert t["settings"]["bitrateKbps"] == 768 and t["settings"]["presetId"] is None
    client.post("/api/jobs", json={"trackIds": [t["id"]]})
    assert wait_done(client, t["id"])["output"]["bitrateKbps"] == 768
    s = client.put("/api/settings", json={"defaults": {"bitrateKbps": 1509}}).get_json()
    assert s["defaults"]["presetId"] == "bluray-stereo"
    assert upload(client, make_wav(tmp_path / "St.wav"))["settings"]["presetId"] == "bluray-stereo"
    assert upload(client, make_wav(tmp_path / "Sur.wav", channels=6))["settings"]["presetId"] == "bluray-51"


def test_encode_then_decode_is_timed(client, tmp_path):
    t = upload(client, make_wav(tmp_path / "Film.wav", channels=6, codec="pcm_s16le"))
    client.post("/api/jobs", json={"trackIds": [t["id"]]})
    done = wait_done(client, t["id"])
    out = done["output"]
    assert out["encodeSeconds"] > 0 and out["decodeSeconds"] > 0
    assert out["decodedBytes"] > out["sizeBytes"]  # decompressed WAV is bigger than the DTS
    job = client.get("/api/jobs").get_json()["jobs"][0]
    assert job["decodeSeconds"] == out["decodeSeconds"] and job["decodedBytes"] == out["decodedBytes"]
    wav = client.get(f"/api/tracks/{t['id']}/output/audio")
    assert wav.status_code == 200 and wav.data[:4] == b"RIFF" and len(wav.data) == out["decodedBytes"]
    dl = client.get(f"/api/tracks/{t['id']}/output/audio?download=1")
    assert "Film.decoded.wav" in dl.headers["Content-Disposition"]
    row = client.get("/api/stats/compare").get_json()["sessionFiles"][0]
    assert row["decodeSeconds"] > 0 and row["decodedMB"] > row["outputMB"]
    assert client.get("/api/stats/compare").get_json()["encodes"][0]["decodeSeconds"] > 0
    # DTS files are no longer accepted as imports
    r = client.post("/api/tracks", data={"files": (io.BytesIO(b"x"), "Mix.dts")}, content_type="multipart/form-data")
    assert r.status_code == 415
