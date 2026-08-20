#!/usr/bin/env python3
"""Wait until production reports one exact, contract-compatible release."""
from __future__ import annotations

import argparse
import json
import queue
import threading
import time
from typing import cast
import urllib.error
import urllib.request


EXPECTED_CONTRACT_VERSION = "2026-08-18"
MAX_HEALTH_RESPONSE_BYTES = 64 * 1024
POLL_INTERVAL_SECONDS = 10.0
REQUEST_TIMEOUT_SECONDS = 10.0


class ReleaseError(RuntimeError):
    """The expected production release did not become safely available."""


def _fetch_health(request: urllib.request.Request, request_timeout: float) -> tuple[dict | None, str]:
    with urllib.request.urlopen(request, timeout=request_timeout) as response:
        if response.status != 200:
            return None, f"http status {response.status}"
        response_body = response.read(MAX_HEALTH_RESPONSE_BYTES + 1)
        if len(response_body) > MAX_HEALTH_RESPONSE_BYTES:
            raise ReleaseError("health response exceeded size limit")
        try:
            payload = json.loads(response_body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ReleaseError("health response was not valid JSON") from error
        return payload, "health response received"


def _bounded_health_attempt(
    request: urllib.request.Request,
    request_timeout: float,
    overall_deadline: float,
) -> tuple[dict | None, str]:
    """Bound one attempt while allowing a finished late worker to be retried.

    A result received after the attempt budget is discarded. The caller waits
    for that worker to finish (or for the overall deadline) before returning,
    so retries never accumulate outstanding daemon workers.
    """
    results: queue.Queue[tuple[str, object, float]] = queue.Queue(maxsize=1)
    attempt_deadline = min(overall_deadline, time.monotonic() + request_timeout)

    def run() -> None:
        try:
            result: tuple[str, object, float] = (
                "result",
                _fetch_health(request, request_timeout),
                time.monotonic(),
            )
        except Exception as error:  # Forward to the waiting caller without logging payloads.
            result = ("error", error, time.monotonic())
        results.put_nowait(result)

    threading.Thread(target=run, name="stylee-release-health", daemon=True).start()
    try:
        kind, value, completed_at = results.get(
            timeout=max(0, attempt_deadline - time.monotonic()),
        )
    except queue.Empty:
        remaining = overall_deadline - time.monotonic()
        if remaining <= 0:
            raise ReleaseError("release verification timed out during health request")
        try:
            kind, value, completed_at = results.get(timeout=remaining)
        except queue.Empty as error:
            raise ReleaseError("release verification timed out during health request") from error

    if time.monotonic() >= overall_deadline:
        raise ReleaseError("release verification timed out during health request")
    if completed_at > attempt_deadline:
        return None, "health request exceeded per-attempt limit"
    if kind == "error":
        raise cast(Exception, value)
    return cast(tuple[dict | None, str], value)


def _safe(value: object, *, limit: int = 32) -> str:
    text = str(value) if value is not None else "-"
    return "".join(character if character.isalnum() or character in "._-" else "_"
                   for character in text)[:limit] or "-"


def _progress(payload: dict) -> tuple[str, str, str, object, object]:
    status = payload.get("status")
    observed_sha = payload.get("git_sha")
    contract_version = payload.get("contract_version")
    rag = payload.get("rag")
    rag_available = rag.get("artifact_available") if isinstance(rag, dict) else None
    rag_count = rag.get("count") if isinstance(rag, dict) else None
    print(
        "release_poll "
        f"status={_safe(status)} "
        f"sha={_safe(observed_sha, limit=12)} "
        f"contract={_safe(contract_version)} "
        f"rag={_safe(rag_available)}",
        flush=True,
    )
    return str(status), str(observed_sha), str(contract_version), rag_available, rag_count


def wait_for_release(url: str, expected_sha: str, timeout_seconds: int) -> dict:
    """Return health data only for the exact expected SHA and release contract."""
    if not expected_sha:
        raise ReleaseError("expected SHA is required")
    deadline = time.monotonic() + max(0, timeout_seconds)
    last_state = "no health response"

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ReleaseError(f"release verification timed out ({last_state})")
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        request_timeout = min(REQUEST_TIMEOUT_SECONDS, remaining)
        try:
            payload, attempt_state = _bounded_health_attempt(
                request,
                request_timeout,
                deadline,
            )
            if time.monotonic() >= deadline:
                raise ReleaseError("release verification timed out after health response I/O")
            if payload is None:
                last_state = attempt_state
        except ReleaseError:
            raise
        except (OSError, urllib.error.URLError):
            payload = None
            last_state = "health request failed"

        if payload is not None:
            if not isinstance(payload, dict):
                raise ReleaseError("health response was not a JSON object")
            status, observed_sha, contract_version, rag_available, rag_count = _progress(payload)
            matches = (
                status == "ok"
                and observed_sha == expected_sha
                and contract_version == EXPECTED_CONTRACT_VERSION
                and rag_available is True
                and isinstance(rag_count, int)
                and not isinstance(rag_count, bool)
                and rag_count == 3000
            )
            if matches:
                return payload
            last_state = (
                f"status={_safe(status)} sha={_safe(observed_sha, limit=12)} "
                f"contract={_safe(contract_version)} rag={_safe(rag_available)}"
            )
        else:
            print("release_poll status=unavailable sha=- contract=- rag=-", flush=True)

        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(POLL_INTERVAL_SECONDS, remaining))


def main() -> None:
    parser = argparse.ArgumentParser(description="Wait for an exact Stylee production release")
    parser.add_argument("--url", required=True)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    args = parser.parse_args()
    try:
        wait_for_release(args.url, args.expected_sha, args.timeout_seconds)
    except ReleaseError as error:
        print(f"Release verification failed: {error}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
