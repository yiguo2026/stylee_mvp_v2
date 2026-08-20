#!/usr/bin/env python3
"""Write the deterministic manifest for a governed Garments2Look index."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stylee.release_info import (
    MANIFEST_SCHEMA_VERSION,
    RAG_COUNT,
    RAG_DIM,
    RAG_INDEX_FILES,
    RAG_SIGNATURE,
    read_index_metadata,
    sha256_file,
)


def _is_exact_int(value: object, expected: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == expected


def build_rag_manifest(index_dir: str) -> dict:
    """Validate approved metadata and return a manifest for exactly three files."""
    root = Path(index_dir)
    metadata = read_index_metadata(root)
    if metadata.get("signature") != RAG_SIGNATURE:
        raise ValueError("unexpected index signature")
    if not _is_exact_int(metadata.get("dim"), RAG_DIM):
        raise ValueError("unexpected index dimension")
    if not _is_exact_int(metadata.get("count"), RAG_COUNT):
        raise ValueError("unexpected index count")

    files = {}
    for name in RAG_INDEX_FILES:
        path = root / name
        if not path.is_file():
            raise ValueError("required index file is missing")
        files[name] = sha256_file(path)
    return {
        "count": RAG_COUNT,
        "dim": RAG_DIM,
        "files": files,
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "signature": RAG_SIGNATURE,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Garments2Look index manifest")
    parser.add_argument("--dir", default="data/garments2look")
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate the committed manifest without rewriting it",
    )
    args = parser.parse_args()
    manifest = build_rag_manifest(args.dir)
    output_path = Path(args.dir) / "manifest.json"
    if args.check:
        with output_path.open(encoding="utf-8") as manifest_file:
            existing_manifest = json.load(manifest_file)
        if existing_manifest != manifest:
            raise ValueError("RAG manifest is out of date")
        return
    with output_path.open("w", encoding="utf-8") as output_file:
        json.dump(manifest, output_file, indent=2, sort_keys=True)
        output_file.write("\n")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Unable to build RAG manifest: {error}", file=sys.stderr)
        raise SystemExit(1)
