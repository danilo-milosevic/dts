"""Tiny SQLite document store.

Every entity (track, job, preset) is one JSON document in its own table, so the stored shape
is exactly what the API returns. Fields starting with "_" are server-internal (file paths, flags)
and are stripped before a document is sent to the client.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

Doc = dict[str, Any]
TABLES = ("tracks", "jobs", "presets")


def public(doc: Doc) -> Doc:
    """Copy of a document without internal ("_") fields."""
    return {k: v for k, v in doc.items() if not k.startswith("_")}


class Store:
    def __init__(self, path: Path):
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        # one lock for everything: requests and encode workers are threads in the same process
        self.lock = threading.RLock()
        for t in TABLES:
            self._db.execute(f"CREATE TABLE IF NOT EXISTS {t} (id TEXT PRIMARY KEY, pos REAL NOT NULL, data TEXT NOT NULL)")
        self._db.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)")

    @contextmanager
    def tx(self) -> Iterator[None]:
        """Atomic read-modify-write across several calls."""
        with self.lock:
            self._db.execute("BEGIN")
            try:
                yield
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            self._db.execute("COMMIT")

    # ---- documents ----
    def all(self, table: str, where: Callable[[Doc], bool] | None = None) -> list[Doc]:
        """Documents ordered by position, newest first."""
        with self.lock:
            rows = self._db.execute(f"SELECT data FROM {table} ORDER BY pos DESC").fetchall()
        docs = [json.loads(r[0]) for r in rows]
        return [d for d in docs if where(d)] if where else docs

    def get(self, table: str, id: str) -> Doc | None:
        with self.lock:
            row = self._db.execute(f"SELECT data FROM {table} WHERE id = ?", (id,)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, table: str, doc: Doc, pos: float | None = None) -> Doc:
        """Insert or replace. New documents go on top unless `pos` is given; updates keep their position."""
        with self.lock:
            if pos is None:
                row = self._db.execute(f"SELECT pos FROM {table} WHERE id = ?", (doc["id"],)).fetchone()
                pos = row[0] if row else self.top(table) + 1
            self._db.execute(f"INSERT OR REPLACE INTO {table} (id, pos, data) VALUES (?, ?, ?)", (doc["id"], pos, json.dumps(doc)))
        return doc

    def pos(self, table: str, id: str) -> float | None:
        with self.lock:
            row = self._db.execute(f"SELECT pos FROM {table} WHERE id = ?", (id,)).fetchone()
        return row[0] if row else None

    def top(self, table: str) -> float:
        with self.lock:
            return self._db.execute(f"SELECT COALESCE(MAX(pos), 0) FROM {table}").fetchone()[0]

    def delete(self, table: str, id: str) -> None:
        with self.lock:
            self._db.execute(f"DELETE FROM {table} WHERE id = ?", (id,))

    def update(self, table: str, id: str, **fields: Any) -> Doc | None:
        with self.lock:
            doc = self.get(table, id)
            if doc is None:
                return None
            doc.update(fields)
            return self.put(table, doc)

    def count(self, table: str) -> int:
        with self.lock:
            return self._db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    # ---- key/value (settings, queue state) ----
    def kv_get(self, key: str, default: Any = None) -> Any:
        with self.lock:
            row = self._db.execute("SELECT data FROM kv WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def kv_set(self, key: str, value: Any) -> Any:
        with self.lock:
            self._db.execute("INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)", (key, json.dumps(value)))
        return value

    def close(self) -> None:
        with self.lock:
            self._db.close()
