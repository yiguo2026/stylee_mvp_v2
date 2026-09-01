import contextlib
import hashlib
import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Event, Lock, Thread
import textwrap
import time
import urllib.parse
import urllib.request
from unittest.mock import patch

import scripts.wait_for_release as release_wait
from scripts.wait_for_release import ReleaseError, wait_for_release


ROOT = Path(__file__).resolve().parent
EXPECTED_CONTRACT_VERSION = "2026-09-01"
MISSING = object()


def _health(git_sha: str, *, contract_version=EXPECTED_CONTRACT_VERSION,
            artifact_available=True, rag_count=3000) -> dict:
    payload = {
        "status": "ok",
        "contract_version": contract_version,
        "git_sha": git_sha,
        "git_branch": "main",
        "repo_slug": "fitzw/style-model",
        "rag": {
            "artifact_available": artifact_available,
            "signature": "openai_compat:text-embedding-v4:1024",
            "dim": 1024,
        },
    }
    if rag_count is not MISSING:
        payload["rag"]["count"] = rag_count
    return payload


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


def test_wait_for_release_rejects_missing_rag_count():
    _expect_release_error(_health("a" * 40, rag_count=MISSING))


def test_wait_for_release_rejects_wrong_rag_count():
    _expect_release_error(_health("a" * 40, rag_count=2999))


def test_wait_for_release_rejects_boolean_rag_count():
    _expect_release_error(_health("a" * 40, rag_count=True))


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
    assert "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0" in ci
    assert "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97" in ci

    assert "workflow_run:" in deploy
    assert 'workflows: ["Model Service CI"]' in deploy
    assert "github.event.workflow_run.conclusion == 'success'" in deploy
    assert "github.event.workflow_run.event == 'push'" in deploy
    assert "github.event.workflow_run.head_branch == 'main'" in deploy
    assert "github.event.workflow_run.head_repository.full_name == github.repository" in deploy
    assert "github.event.workflow_run.head_sha" not in deploy
    assert "RENDER_DEPLOY_HOOK_URL" in deploy
    assert "urllib.parse.urlencode" in deploy
    assert 'query.append(("ref", deploy_sha))' in deploy
    assert '--expected-sha "$RELEASE_SHA"' in deploy
    assert "https://stylee-model-service.onrender.com/health" in deploy
    assert 'echo "$RENDER_DEPLOY_HOOK_URL"' not in deploy
    assert "concurrency:" in deploy
    assert "group: stylee-model-service-production" in deploy
    assert "cancel-in-progress: false" in deploy
    assert "timeout-minutes: 45" in deploy
    assert "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0" in deploy
    assert "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97" in deploy
    assert _top_level_permissions(ci) == {"contents": "read"}
    assert _top_level_permissions(deploy) == {"actions": "read", "contents": "read"}
    assert "https://api.github.com/repos/" in deploy
    assert "/git/ref/heads/main" in deploy
    assert "/actions/workflows/model-service-ci.yml/runs" in deploy
    assert "COORDINATOR_TIMEOUT_SECONDS" in deploy
    assert "id: coordinate" in deploy
    current_main_step = deploy.index("- name: Coordinate current tested main")
    deploy_hook_step = deploy.index("- name: Trigger exact commit deployment")
    checkout_step = deploy.index("- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0")
    assert current_main_step < deploy_hook_step < checkout_step
    assert deploy.count("${{ secrets.RENDER_DEPLOY_HOOK_URL }}") == 1
    assert "RENDER_DEPLOY_HOOK_URL" not in deploy[checkout_step:]

    wait_step = deploy.index("- name: Wait for exact production release")
    smoke_step = deploy.index("- name: Authenticated provider smoke")
    setup_step = deploy.index("- uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97")
    install_step = deploy.index("python -m pip install -r requirements.txt")
    assert checkout_step < setup_step < install_step < wait_step < smoke_step
    selected_sha = "${{ steps.coordinate.outputs.sha }}"
    assert f"DEPLOY_SHA: {selected_sha}" in deploy
    assert f"ref: {selected_sha}" in deploy
    assert f"RELEASE_SHA: {selected_sha}" in deploy
    assert deploy.count(selected_sha) == 3
    assert "python scripts/release_smoke.py" in deploy[smoke_step:]
    assert "--timeout-seconds 600" in deploy[smoke_step:]
    assert "fixtures/release-smoke/garment.png" in deploy[smoke_step:]
    assert "fixtures/release-smoke/person.jpg" in deploy[smoke_step:]
    for secret_name in (
        "STYLEE_SMOKE_SUPABASE_URL",
        "STYLEE_SMOKE_SUPABASE_ANON_KEY",
        "STYLEE_SMOKE_EMAIL",
        "STYLEE_SMOKE_PASSWORD",
    ):
        expression = "${{ secrets." + secret_name + " }}"
        assert deploy.count(expression) == 1
        assert secret_name not in deploy[:smoke_step]

    workflow_paths = sorted((ROOT / ".github" / "workflows").glob("*.y*ml"))
    assert workflow_paths
    for workflow_path in workflow_paths:
        workflow = workflow_path.read_text()
        uses_lines = [line.strip() for line in workflow.splitlines() if "uses:" in line]
        assert uses_lines
        for line in uses_lines:
            assert re.fullmatch(r"- uses: [A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}", line), line

    assert "autoDeployTrigger: off" in render
    assert "GitHub Action is the only automated production trigger" in render


def _top_level_permissions(workflow):
    lines = workflow.splitlines()
    start = lines.index("permissions:") + 1
    permissions = {}
    for line in lines[start:]:
        if not line.startswith("  "):
            break
        name, value = line.strip().split(":", 1)
        permissions[name] = value.strip()
    assert permissions
    assert all(value == "read" for value in permissions.values())
    return permissions


def _workflow_step_python(step_name):
    deploy = (ROOT / ".github" / "workflows" / "deploy-render.yml").read_text()
    step_start = deploy.index(f"- name: {step_name}")
    heredoc = deploy.index("python - <<'PY'", step_start)
    source_start = deploy.index("\n", heredoc) + 1
    source_end = deploy.index("\n          PY", source_start)
    return textwrap.dedent(deploy[source_start:source_end])


class _CoordinatorResponse:
    status = 200
    headers = {}

    def __init__(self, payload):
        self.body = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def read(self, limit=None):
        assert limit is None or len(self.body) <= limit
        return self.body


def _run_coordinator(ref_shas, workflow_runs):
    source = _workflow_step_python("Coordinate current tested main")
    calls = []

    def opener(request, timeout):
        assert timeout > 0
        calls.append(request.full_url)
        parsed = urllib.parse.urlsplit(request.full_url)
        if parsed.path.endswith("/git/ref/heads/main"):
            return _CoordinatorResponse({"object": {"sha": ref_shas.pop(0)}})
        if parsed.path.endswith("/actions/workflows/model-service-ci.yml/runs"):
            return _CoordinatorResponse({"workflow_runs": workflow_runs.pop(0)})
        raise AssertionError(request.full_url)

    with TemporaryDirectory() as directory:
        output_path = Path(directory) / "github-output"
        environment = {
            "GH_TOKEN": "github-token-must-not-log",
            "REPOSITORY": "fitzw/style-model",
            "GITHUB_OUTPUT": str(output_path),
            "COORDINATOR_TIMEOUT_SECONDS": "1",
            "COORDINATOR_POLL_SECONDS": "0",
        }
        stdout = io.StringIO()
        with patch.dict(os.environ, environment, clear=False):
            with patch.object(urllib.request, "urlopen", opener):
                with contextlib.redirect_stdout(stdout):
                    exec(compile(source, "deploy-render-coordinator", "exec"), {"__name__": "__main__"})
        output = output_path.read_text() if output_path.exists() else ""
    return output, stdout.getvalue(), calls


def _ci_run(sha, *, status, conclusion):
    return {
        "name": "Model Service CI",
        "head_sha": sha,
        "head_branch": "main",
        "event": "push",
        "status": status,
        "conclusion": conclusion,
        "head_repository": {"full_name": "fitzw/style-model"},
    }


def test_coordinator_switches_to_new_current_main_and_emits_only_tested_sha():
    first_sha = "a" * 40
    current_sha = "b" * 40
    output, logs, calls = _run_coordinator(
        [first_sha, current_sha, current_sha],
        [
            [_ci_run(first_sha, status="in_progress", conclusion=None)],
            [_ci_run(current_sha, status="completed", conclusion="success")],
        ],
    )
    assert output == f"sha={current_sha}\n"
    assert first_sha not in logs and current_sha not in logs
    assert "github-token-must-not-log" not in logs
    assert sum("/git/ref/heads/main" in call for call in calls) == 3
    assert sum("/actions/workflows/model-service-ci.yml/runs" in call for call in calls) == 2


def test_coordinator_rejects_failed_current_main_ci_without_output():
    current_sha = "c" * 40
    stderr = io.StringIO()
    with contextlib.redirect_stderr(stderr):
        try:
            _run_coordinator(
                [current_sha],
                [[_ci_run(current_sha, status="completed", conclusion="failure")]],
            )
            assert False, "failed current-main CI must stop before Render"
        except SystemExit as error:
            assert error.code == 1
    assert current_sha not in stderr.getvalue()
    assert "github-token-must-not-log" not in stderr.getvalue()


def main():
    test_wait_for_release_returns_only_for_the_exact_sha_and_logs_safe_scalars()
    test_wait_for_release_times_out_on_sha_mismatch()
    test_wait_for_release_rejects_contract_mismatch()
    test_wait_for_release_rejects_unavailable_rag_artifact()
    test_wait_for_release_rejects_missing_rag_count()
    test_wait_for_release_rejects_wrong_rag_count()
    test_wait_for_release_rejects_boolean_rag_count()
    test_wait_for_release_rejects_malformed_json()
    test_wait_for_release_bounds_reads_and_rechecks_deadline_after_io()
    test_wait_for_release_rejects_oversized_health_response()
    test_wait_for_release_enforces_outer_deadline_when_opener_blocks()
    test_wait_for_release_discards_late_attempt_then_retries_without_worker_overlap()
    test_manifest_check_validates_without_rewriting()
    test_workflows_enforce_ci_and_exact_sha_deployment_contracts()
    test_coordinator_switches_to_new_current_main_and_emits_only_tested_sha()
    test_coordinator_rejects_failed_current_main_ci_without_output()
    print("ok")


if __name__ == "__main__":
    main()
