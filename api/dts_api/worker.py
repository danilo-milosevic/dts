"""Encode queue: a few worker threads in the server process, each running one ffmpeg at a time.

Jobs live in the database (status queued → encoding → done | failed). Workers claim the next
queued job in `order`, run ffmpeg with `-progress pipe:1` and write progress/ETA back while it
runs. No broker, no separate process — this app is not meant to scale out.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from .config import Config
from .domain import now
from .media import MediaError, decode_to_wav, pcm_codec, plan_encode
from .store import Store

log = logging.getLogger(__name__)


class EncodeQueue:
    def __init__(self, store: Store, cfg: Config):
        self.store, self.cfg = store, cfg
        self.cond = threading.Condition(store.lock)
        self._procs: dict[str, subprocess.Popen] = {}
        self._cancelled: set[str] = set()
        self._threads: list[threading.Thread] = []
        self._stop = False
        self._recover()

    # ---- state shown to the client ----
    @property
    def state(self) -> dict[str, Any]:
        q = self.store.kv_get("queue", {"running": True, "startedAt": None})
        return {"running": q["running"], "workers": self.cfg.workers, "maxWorkers": max(self.cfg.workers, 8), "startedAt": q["startedAt"]}

    def set_running(self, running: bool) -> dict[str, Any]:
        with self.cond:
            q = self.store.kv_get("queue", {"running": True, "startedAt": None})
            q["running"] = running
            if running and not q.get("startedAt"):
                q["startedAt"] = now()
            self.store.kv_set("queue", q)
            self.cond.notify_all()
        return self.state

    def notify(self) -> None:
        with self.cond:
            q = self.store.kv_get("queue", {"running": True, "startedAt": None})
            if q["running"] and not q.get("startedAt"):
                q["startedAt"] = now()
                self.store.kv_set("queue", q)
            self.cond.notify_all()

    # ---- lifecycle ----
    def _recover(self) -> None:
        """Jobs left 'encoding' by a crash/restart go back to the front of the queue."""
        with self.store.tx():
            for j in self.store.all("jobs", lambda j: j["status"] == "encoding"):
                j.update(status="queued", progress=0, etaSec=None, startedAt=None)
                self.store.put("jobs", j)
                t = self.store.get("tracks", j["trackId"])
                if t:
                    t["status"] = "queued"
                    self.store.put("tracks", t)

    def start(self) -> None:
        for i in range(self.cfg.workers):
            th = threading.Thread(target=self._loop, name=f"encoder-{i + 1}", daemon=True)
            th.start()
            self._threads.append(th)

    def stop(self) -> None:
        with self.cond:
            self._stop = True
            self.cond.notify_all()
        for p in list(self._procs.values()):
            p.kill()

    def cancel(self, job_id: str) -> None:
        """Stop a running encode (the caller removes the job)."""
        with self.cond:
            self._cancelled.add(job_id)
            proc = self._procs.get(job_id)
        if proc and proc.poll() is None:
            proc.terminate()

    # ---- worker ----
    def _claim(self) -> dict[str, Any] | None:
        if not self.store.kv_get("queue", {"running": True})["running"]:
            return None
        with self.store.tx():
            waiting = sorted(self.store.all("jobs", lambda j: j["status"] == "queued"), key=lambda j: j["order"])
            for j in waiting:
                t = self.store.get("tracks", j["trackId"])
                if not t:
                    self.store.delete("jobs", j["id"])
                    continue
                j.update(status="encoding", startedAt=now(), progress=0, etaSec=None)
                t["status"] = "encoding"
                self.store.put("jobs", j)
                self.store.put("tracks", t)
                return j
        return None

    def _loop(self) -> None:
        while True:
            with self.cond:
                job = None
                while not self._stop and (job := self._claim()) is None:
                    self.cond.wait(timeout=5)
                if self._stop:
                    return
            try:
                self._encode(job)
            except Exception as e:  # never let a worker thread die
                log.exception("encode %s crashed", job["id"])
                self._fail(job["id"], f"Internal error: {e}")

    def _encode(self, job: dict[str, Any]) -> None:
        track = self.store.get("tracks", job["trackId"])
        if not track:
            return
        storage = self.cfg.storage
        src = storage / track["_source"]
        out_dir = storage / "outputs" / track["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        tmp = out_dir / f".{job['id']}.part"
        plan = plan_encode(self.cfg.ffmpeg, src, tmp, track, job["settings"])
        logfile = storage / "logs" / f"{job['id']}.log"
        log.info("encode %s: %s", job["id"], " ".join(plan.args))

        started = time.monotonic()
        duration = max(0.001, float(track["durationSec"]))
        with open(logfile, "wb") as err:
            try:
                proc = subprocess.Popen(plan.args, stdout=subprocess.PIPE, stderr=err, text=True)
            except FileNotFoundError:
                return self._fail(job["id"], f"{self.cfg.ffmpeg} not found — install ffmpeg and put it on PATH")
            with self.cond:
                self._procs[job["id"]] = proc
            last_write = 0.0
            for line in proc.stdout:  # type: ignore[union-attr]
                key, _, value = line.strip().partition("=")
                if key != "out_time_us" or not value.lstrip("-").isdigit():
                    continue
                progress = min(0.9, max(0.0, int(value) / 1e6 / duration) * 0.9)  # last 10 %: decoding back to WAV
                if time.monotonic() - last_write > 0.25 and progress > 0:
                    elapsed = time.monotonic() - started
                    self.store.update("jobs", job["id"], progress=round(progress, 4), etaSec=round(elapsed / progress * (1 - progress), 1))
                    last_write = time.monotonic()
            code = proc.wait()
        encode_seconds = round(time.monotonic() - started, 3)  # the encode alone
        with self.cond:
            self._procs.pop(job["id"], None)
            cancelled = job["id"] in self._cancelled
            self._cancelled.discard(job["id"])

        if cancelled or self._stop:  # stopped by shutdown: stays 'encoding' and is re-queued on the next start
            tmp.unlink(missing_ok=True)
            return
        if code != 0:
            tmp.unlink(missing_ok=True)
            msg = logfile.read_text(errors="replace").strip().splitlines()
            return self._fail(job["id"], (msg[-1] if msg else f"ffmpeg exited with code {code}")[:300])

        # encoded: move into place, then decode the DTS back to WAV (timed — for the compression/decompression comparison;
        # the decoded WAV is also what the browser plays for A/B)
        final = out_dir / job["outputName"]
        decoded = out_dir / "decoded.wav"
        for old in out_dir.iterdir():  # one current output per track
            if old != tmp and not old.name.startswith("."):
                try:
                    old.unlink(missing_ok=True)
                except OSError:  # Windows: still open (being downloaded / played) — overwritten below or left behind
                    log.warning("could not remove old output %s", old)
        shutil.move(str(tmp), final)
        self.store.update("jobs", job["id"], progress=0.92, etaSec=None)
        decode_seconds: float | None = None
        decoded_bytes: int | None = None
        try:
            t0 = time.monotonic()
            decode_to_wav(self.cfg.ffmpeg, final, decoded, pcm_codec(track))
            decode_seconds, decoded_bytes = round(time.monotonic() - t0, 3), decoded.stat().st_size
        except MediaError as e:
            log.warning("decode of %s failed: %s", job["id"], e)
            plan.notes.append(f"decoding the DTS back to WAV failed: {e}")
        size = final.stat().st_size

        with self.store.tx():
            j = self.store.get("jobs", job["id"])
            t = self.store.get("tracks", track["id"])
            if not j or not t:  # deleted while encoding
                return
            j.update(status="done", progress=1, etaSec=None, finishedAt=now(), outputBytes=size,
                     ratio=round(j["inputBytes"] / max(size, 1), 3), encodeSeconds=encode_seconds,
                     decodeSeconds=decode_seconds, decodedBytes=decoded_bytes,
                     notes=plan.notes, effective={"channels": plan.channels, "sampleRate": plan.sample_rate, "bitrateKbps": plan.kbps})
            t.update(status="encoded", error=None,
                     output={"fileName": final.name, "sizeBytes": size, "codec": j["settings"]["codec"], "bitrateKbps": plan.kbps,
                             "encodeSeconds": encode_seconds, "decodeSeconds": decode_seconds, "decodedBytes": decoded_bytes,
                             "channels": plan.channels, "sampleRate": plan.sample_rate},
                     _output=str(final.relative_to(storage)), _decoded=str(decoded.relative_to(storage)) if decoded_bytes else None)
            t.pop("_preview", None)
            self.store.put("jobs", j)
            self.store.put("tracks", t)
        log.info("encode %s: %.2fs → %d bytes; decode %s s → %s bytes", job["id"], encode_seconds, size, decode_seconds, decoded_bytes)

    def _fail(self, job_id: str, message: str) -> None:
        with self.store.tx():
            j = self.store.get("jobs", job_id)
            if not j:
                return
            j.update(status="failed", etaSec=None, finishedAt=now(), error=message)
            self.store.put("jobs", j)
            t = self.store.get("tracks", j["trackId"])
            if t:
                t.update(status="error", error=message)
                self.store.put("tracks", t)


def remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
