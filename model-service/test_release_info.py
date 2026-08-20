import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts.build_rag_manifest import build_rag_manifest
from stylee.release_info import health_payload, validate_rag_artifact


def _write_fixture(root: Path) -> None:
    (root / "index.meta.json").write_text(json.dumps({
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
    }), encoding="utf-8")
    (root / "exemplars.jsonl").write_text('{"text":"look"}\n', encoding="utf-8")
    (root / "exemplars.vecs").write_bytes(b"vectors")
    files = {}
    for name in ("index.meta.json", "exemplars.jsonl", "exemplars.vecs"):
        files[name] = hashlib.sha256((root / name).read_bytes()).hexdigest()
    (root / "manifest.json").write_text(json.dumps({
        "schema_version": 1,
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
        "files": files,
    }), encoding="utf-8")


def test_validate_rag_artifact_accepts_matching_manifest():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        status = validate_rag_artifact(str(root))
        assert status.artifact_available is True
        assert status.signature == "openai_compat:text-embedding-v4:1024"
        assert status.dim == 1024 and status.count == 3000


def test_validate_rag_artifact_rejects_hash_drift():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        (root / "exemplars.vecs").write_bytes(b"changed")
        status = validate_rag_artifact(str(root))
        assert status.artifact_available is False


def test_validate_rag_artifact_rejects_boolean_schema_version():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        manifest_path = root / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["schema_version"] = True
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        status = validate_rag_artifact(str(root))
        assert status.artifact_available is False


def test_health_payload_reports_render_sha_and_rag_status():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        payload = health_payload({
            "RENDER_GIT_COMMIT": "abc123",
            "RENDER_GIT_BRANCH": "main",
            "RENDER_GIT_REPO_SLUG": "fitzw/style-model",
        }, str(root))
        assert payload["status"] == "ok"
        assert payload["contract_version"] == "2026-08-18"
        assert payload["git_sha"] == "abc123"
        assert payload["git_branch"] == "main"
        assert payload["repo_slug"] == "fitzw/style-model"
        assert payload["rag"]["artifact_available"] is True
        assert payload["rag"]["count"] == 3000


def test_health_payload_uses_local_defaults_for_empty_environment():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        payload = health_payload({}, str(root))
        assert payload["git_sha"] == "local"
        assert payload["git_branch"] == "local"
        assert payload["repo_slug"] == "local"


def test_health_payload_reads_fresh_release_environment_each_call():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        environment = {
            "RENDER_GIT_COMMIT": "first-sha",
            "RENDER_GIT_BRANCH": "first-branch",
            "RENDER_GIT_REPO_SLUG": "first/repo",
        }
        first = health_payload(environment, str(root))
        environment.update({
            "RENDER_GIT_COMMIT": "second-sha",
            "RENDER_GIT_BRANCH": "main",
            "RENDER_GIT_REPO_SLUG": "fitzw/style-model",
        })
        second = health_payload(environment, str(root))
        assert first["git_sha"] == "first-sha"
        assert second["git_sha"] == "second-sha"
        assert second["git_branch"] == "main"
        assert second["repo_slug"] == "fitzw/style-model"


def test_build_rag_manifest_rejects_float_metadata_dimension():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        (root / "index.meta.json").write_text(json.dumps({
            "signature": "openai_compat:text-embedding-v4:1024",
            "dim": 1024.0,
            "count": 3000,
        }), encoding="utf-8")
        try:
            build_rag_manifest(str(root))
            assert False, "float dimensions must be rejected"
        except ValueError:
            pass


def main():
    test_validate_rag_artifact_accepts_matching_manifest()
    test_validate_rag_artifact_rejects_hash_drift()
    test_validate_rag_artifact_rejects_boolean_schema_version()
    test_health_payload_reports_render_sha_and_rag_status()
    test_health_payload_uses_local_defaults_for_empty_environment()
    test_health_payload_reads_fresh_release_environment_each_call()
    test_build_rag_manifest_rejects_float_metadata_dimension()
    print("ok")


if __name__ == "__main__":
    main()
