import contextlib
import hashlib
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Event, Lock, Thread
import time
from unittest.mock import patch

import scripts.wait_for_release as release_wait
from scripts.wait_for_release import ReleaseError, wait_for_release


ROOT = Path(__file__).resolve().parent
EXPECTED_CONTRACT_VERSION = "2026-08-18"


def _health(git_sha: str, *, contract_version=EXPECTED_CONTRACT_VERSION,
            artifact_available=True) -> dict:
    return {
        "status": "ok",
        "contract_version": contract_version,
        "git_sha": git_sha,
        "git_branch": "main",
        "repo_slug": "fitzw/style-model",
        "rag": {
            "artifact_available": artifact_available,
            "signature": "openai_compat:text-embedding-v4:1024",
            "dim": 1024,
            "count": 3000,
        },
    }


@contextlib.contextmanager
def _serve_health(responses):
    class Handler(BaseHTTPRequestHandler):
        calls = 0

        def do_GET(self):
            response = responses[min(type(self).calls, len(responses) - 1)]
            type(self).calls += 1
            body = response if isinstance(response, bytes) else json.dumps(response).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/health", Handler
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)


def _expect_release_error(response: dict | bytes) -> None:
    with _serve_health([response]) as (url, _handler):
        with patch.object(release_wait, "POLL_INTERVAL_SECONDS", 0.01):
            try:
                wait_for_release(url, "a" * 40, timeout_seconds=0.04)
                assert False, "an invalid release must fail closed"
            except ReleaseError:
                pass


def test_wait_for_release_returns_only_for_the_exact_sha_and_logs_safe_scalars():
    expected_sha = "a" * 40
    old_sha_with_same_prefix = ("a" * 39) + "b"
    stale = _health(old_sha_with_same_prefix)
    stale["do_not_log"] = "health-response-secret"
    current = _health(expected_sha)
    output = io.StringIO()

    with _serve_health([stale, current]) as (url, handler):
        with patch.object(release_wait, "POLL_INTERVAL_SECONDS", 0.01):
            with contextlib.redirect_stdout(output):
                result = wait_for_release(url, expected_sha, timeout_seconds=1)

    assert handler.calls == 2
    assert result == current
    progress = output.getvalue()
    assert "health-response-secret" not in progress
    assert expected_sha not in progress
    assert f"sha={expected_sha[:12]}" in progress
    assert "status=ok" in progress
    assert f"contract={EXPECTED_CONTRACT_VERSION}" in progress
    assert "rag=True" in progress


def test_wait_for_release_times_out_on_sha_mismatch():
    _expect_release_error(_health("b" * 40))


def test_wait_for_release_rejects_contract_mismatch():
    _expect_release_error(_health("a" * 40, contract_version="stale-contract"))


def test_wait_for_release_rejects_unavailable_rag_artifact():
    _expect_release_error(_health("a" * 40, artifact_available=False))


def test_wait_for_release_rejects_malformed_json():
    _expect_release_error(b"not-json")


def test_wait_for_release_bounds_reads_and_rechecks_deadline_after_io():
    clock = {"now": 100.0}
    expected_sha = "a" * 40

    class Response:
        status = 200
        read_limit = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def read(self, limit=None):
            type(self).read_limit = limit
            clock["now"] += 2.0
            return json.dumps(_health(expected_sha)).encode()

    request_timeouts = []

    def urlopen(_request, timeout):
        request_timeouts.append(timeout)
        return Response()

    with patch.object(release_wait.time, "monotonic", lambda: clock["now"]):
        with patch.object(release_wait.urllib.request, "urlopen", urlopen):
            try:
                wait_for_release("https://health.invalid", expected_sha, timeout_seconds=1)
                assert False, "a matching response received after the deadline must be rejected"
            except ReleaseError:
                pass

    assert request_timeouts == [1.0]
    assert Response.read_limit == 65537


def test_wait_for_release_rejects_oversized_health_response():
    class Response:
        status = 200
        read_limit = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def read(self, limit=None):
            type(self).read_limit = limit
            return b"x" * 65537

    with patch.object(release_wait.urllib.request, "urlopen", lambda *_args, **_kwargs: Response()):
        try:
            wait_for_release("https://health.invalid", "a" * 40, timeout_seconds=1)
            assert False, "an oversized response must fail closed"
        except ReleaseError as error:
            assert "size limit" in str(error)

    assert Response.read_limit == 65537


def test_wait_for_release_enforces_outer_deadline_when_opener_blocks():
    expected_sha = "a" * 40
    opener_finished = Event()

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def read(self, _limit=None):
            return json.dumps(_health(expected_sha)).encode()

    def blocking_urlopen(_request, timeout):
        assert timeout <= 0.05
        time.sleep(0.3)
        opener_finished.set()
        return Response()

    started = time.monotonic()
    with patch.object(release_wait.urllib.request, "urlopen", blocking_urlopen):
        try:
            wait_for_release("https://health.invalid", expected_sha, timeout_seconds=0.05)
            assert False, "a late matching result must never be accepted"
        except ReleaseError:
            pass
    elapsed = time.monotonic() - started

    assert elapsed < 0.2, f"outer deadline was not enforced: elapsed={elapsed:.3f}s"
    assert not opener_finished.is_set(), "wait_for_release waited for the blocked opener"


def test_wait_for_release_discards_late_attempt_then_retries_without_worker_overlap():
    expected_sha = "a" * 40
    state = {"active": 0, "calls": 0, "max_active": 0}
    state_lock = Lock()

    class Response:
        status = 200

        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            pass

        def read(self, _limit=None):
            return json.dumps(self.payload).encode()

    def first_late_then_current(_request, timeout):
        assert timeout <= 0.03
        with state_lock:
            state["calls"] += 1
            attempt = state["calls"]
            state["active"] += 1
            state["max_active"] = max(state["max_active"], state["active"])
        try:
            if attempt == 1:
                time.sleep(0.08)
            payload = _health(expected_sha)
            payload["attempt"] = attempt
            return Response(payload)
        finally:
            with state_lock:
                state["active"] -= 1

    with patch.object(release_wait, "REQUEST_TIMEOUT_SECONDS", 0.03):
        with patch.object(release_wait, "POLL_INTERVAL_SECONDS", 0):
            with patch.object(release_wait.urllib.request, "urlopen", first_late_then_current):
                result = wait_for_release(
                    "https://health.invalid",
                    expected_sha,
                    timeout_seconds=0.5,
                )

    assert result["attempt"] == 2
    assert state["calls"] == 2
    assert state["max_active"] == 1


def _write_manifest_fixture(root: Path) -> None:
    files = {
        "index.meta.json": json.dumps({
            "signature": "openai_compat:text-embedding-v4:1024",
            "dim": 1024,
            "count": 3000,
        }).encode(),
        "exemplars.jsonl": b'{"text":"look"}\n',
        "exemplars.vecs": b"vectors",
    }
    digests = {}
    for name, content in files.items():
        (root / name).write_bytes(content)
        digests[name] = hashlib.sha256(content).hexdigest()
    (root / "manifest.json").write_text(json.dumps({
        "count": 3000,
        "dim": 1024,
        "files": digests,
        "schema_version": 1,
        "signature": "openai_compat:text-embedding-v4:1024",
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_manifest_check_validates_without_rewriting():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_manifest_fixture(root)
        manifest_path = root / "manifest.json"
        original = manifest_path.read_bytes()
        command = [
            sys.executable,
            str(ROOT / "scripts" / "build_rag_manifest.py"),
            "--dir",
            str(root),
            "--check",
        ]
        valid = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        assert valid.returncode == 0, valid.stderr
        assert manifest_path.read_bytes() == original

        stale = json.loads(original)
        stale["count"] = 2999
        manifest_path.write_text(json.dumps(stale), encoding="utf-8")
        stale_bytes = manifest_path.read_bytes()
        invalid = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        assert invalid.returncode != 0
        assert manifest_path.read_bytes() == stale_bytes


def test_workflows_enforce_ci_and_exact_sha_deployment_contracts():
    ci = (ROOT / ".github" / "workflows" / "model-service-ci.yml").read_text()
    deploy = (ROOT / ".github" / "workflows" / "deploy-render.yml").read_text()
    render = (ROOT / "render.yaml").read_text()

    assert "name: Model Service CI" in ci
    assert "pull_request:" in ci
    assert "branches: [main]" in ci
    assert 'python-version: "3.12"' in ci
    assert 'for test_file in test_*.py; do python "$test_file" || exit 1; done' in ci
    assert "python scripts/build_rag_manifest.py --dir data/garments2look --check" in ci
    assert 'docker build -t stylee-model-service:${{ github.sha }} .' in ci

    assert "workflow_run:" in deploy
    assert 'workflows: ["Model Service CI"]' in deploy
    assert "github.event.workflow_run.conclusion == 'success'" in deploy
    assert "github.event.workflow_run.event == 'push'" in deploy
    assert "github.event.workflow_run.head_branch == 'main'" in deploy
    assert "github.event.workflow_run.head_repository.full_name == github.repository" in deploy
    assert "ref: ${{ github.event.workflow_run.head_sha }}" in deploy
    assert "RENDER_DEPLOY_HOOK_URL" in deploy
    assert "urllib.parse.urlencode" in deploy
    assert 'query.append(("ref", deploy_sha))' in deploy
    assert "RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}" in deploy
    assert '--expected-sha "$RELEASE_SHA"' in deploy
    assert "https://stylee-model-service.onrender.com/health" in deploy
    assert 'echo "$RENDER_DEPLOY_HOOK_URL"' not in deploy
    deploy_hook_step = deploy.index("- name: Trigger exact commit deployment")
    checkout_step = deploy.index("- uses: actions/checkout@v4")
    assert deploy_hook_step < checkout_step
    assert deploy.count("${{ secrets.RENDER_DEPLOY_HOOK_URL }}") == 1
    assert "RENDER_DEPLOY_HOOK_URL" not in deploy[checkout_step:]

    assert "autoDeployTrigger: off" in render
    assert "GitHub Action is the only automated production trigger" in render


def main():
    test_wait_for_release_returns_only_for_the_exact_sha_and_logs_safe_scalars()
    test_wait_for_release_times_out_on_sha_mismatch()
    test_wait_for_release_rejects_contract_mismatch()
    test_wait_for_release_rejects_unavailable_rag_artifact()
    test_wait_for_release_rejects_malformed_json()
    test_wait_for_release_bounds_reads_and_rechecks_deadline_after_io()
    test_wait_for_release_rejects_oversized_health_response()
    test_wait_for_release_enforces_outer_deadline_when_opener_blocks()
    test_wait_for_release_discards_late_attempt_then_retries_without_worker_overlap()
    test_manifest_check_validates_without_rewriting()
    test_workflows_enforce_ci_and_exact_sha_deployment_contracts()
    print("ok")


if __name__ == "__main__":
    main()
