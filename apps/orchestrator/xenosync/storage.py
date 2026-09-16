from __future__ import annotations

import hashlib
from pathlib import Path


class ContentAddressedStore:
    def __init__(self, base_path: Path) -> None:
        self._base_path = base_path
        self._base_path.mkdir(parents=True, exist_ok=True)

    def store_bytes(self, blob: bytes) -> Path:
        digest = hashlib.sha256(blob).hexdigest()
        blob_dir = self._base_path / digest[:2]
        blob_path = blob_dir / digest[2:]
        if not blob_path.exists():
            blob_dir.mkdir(parents=True, exist_ok=True)
            temp_path = blob_path.with_suffix(".tmp")
            temp_path.write_bytes(blob)
            temp_path.replace(blob_path)
        return blob_path

    def store_file(self, src: Path) -> Path:
        data = src.read_bytes()
        return self.store_bytes(data)

    def resolve(self, digest: str) -> Path | None:
        blob_path = self._base_path / digest[:2] / digest[2:]
        if blob_path.exists():
            return blob_path
        return None
