"""Release metadata for the versioned Garments2Look recommendation index."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Mapping, Optional


MANIFEST_SCHEMA_VERSION = 1
CONTRACT_VERSION = "2026-08-18"
RAG_SIGNATURE = "openai_compat:text-embedding-v4:1024"
RAG_DIM = 1024
RAG_COUNT = 3000
RAG_INDEX_FILES = ("index.meta.json", "exemplars.jsonl", "exemplars.vecs")


@dataclass(frozen=True)
class RagArtifactStatus:
    artifact_available: bool
    signature: Optional[str] = None
    dim: Optional[int] = None
    count: Optional[int] = None


def sha256_file(path: Path) -> str:
    """Return a file digest without loading the complete artifact into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_index_metadata(index_dir: Path) -> dict:
    with (index_dir / "index.meta.json").open(encoding="utf-8") as metadata_file:
        metadata = json.load(metadata_file)
    if not isinstance(metadata, dict):
        raise ValueError("index metadata must be an object")
    return metadata


def _is_exact_int(value: object, expected: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == expected


def _unavailable_status() -> RagArtifactStatus:
    return RagArtifactStatus(artifact_available=False)


def validate_rag_artifact(index_dir: str) -> RagArtifactStatus:
    """Return availability only when the pinned index and manifest agree exactly."""
    try:
        root = Path(index_dir)
        metadata = read_index_metadata(root)
        with (root / "manifest.json").open(encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
        if not isinstance(manifest, dict):
            return _unavailable_status()

        if not _is_exact_int(manifest.get("schema_version"), MANIFEST_SCHEMA_VERSION):
            return _unavailable_status()
        if manifest.get("signature") != RAG_SIGNATURE:
            return _unavailable_status()
        if not _is_exact_int(manifest.get("dim"), RAG_DIM):
            return _unavailable_status()
        if not _is_exact_int(manifest.get("count"), RAG_COUNT):
            return _unavailable_status()
        if (
            metadata.get("signature") != manifest["signature"]
            or not _is_exact_int(metadata.get("dim"), RAG_DIM)
            or not _is_exact_int(metadata.get("count"), RAG_COUNT)
        ):
            return _unavailable_status()

        files = manifest.get("files")
        if not isinstance(files, dict) or set(files) != set(RAG_INDEX_FILES):
            return _unavailable_status()
        for name in RAG_INDEX_FILES:
            expected_digest = files[name]
            if not isinstance(expected_digest, str) or len(expected_digest) != 64:
                return _unavailable_status()
            if any(character not in "0123456789abcdef" for character in expected_digest):
                return _unavailable_status()
            if sha256_file(root / name) != expected_digest:
                return _unavailable_status()
        return RagArtifactStatus(True, RAG_SIGNATURE, RAG_DIM, RAG_COUNT)
    except Exception:
        return _unavailable_status()


@lru_cache(maxsize=None)
def _cached_rag_artifact_status(index_dir: str) -> RagArtifactStatus:
    return validate_rag_artifact(index_dir)


def health_payload(environ: Mapping[str, str], index_dir: str) -> dict:
    """Return non-sensitive deployment and recommendation-index metadata."""
    rag_status = _cached_rag_artifact_status(index_dir)
    return {
        "status": "ok",
        "contract_version": CONTRACT_VERSION,
        "git_sha": environ.get("RENDER_GIT_COMMIT", "local"),
        "git_branch": environ.get("RENDER_GIT_BRANCH", "local"),
        "repo_slug": environ.get("RENDER_GIT_REPO_SLUG", "local"),
        "rag": {
            "artifact_available": rag_status.artifact_available,
            "signature": rag_status.signature,
            "dim": rag_status.dim,
            "count": rag_status.count,
        },
    }
