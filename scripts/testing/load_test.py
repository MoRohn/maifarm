#!/usr/bin/env python3
"""Synthetic load generator for MaiFarm orchestrator."""
import argparse
import asyncio
import importlib.util
import os
import random
import signal
import subprocess
import sys
import time
from contextlib import suppress
from typing import List, Optional, cast

import httpx

API_HOST = os.environ.get("MAIFARM_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("MAIFARM_PORT", "8000"))
API_PORT = DEFAULT_PORT


def _resolve_uvicorn_app() -> str:
    try:
        if importlib.util.find_spec("maifarm.apps.orchestrator.main") is not None:
            return "maifarm.apps.orchestrator.main:app"
    except ModuleNotFoundError:
        pass
    return "apps.orchestrator.main:app"


def api_root() -> str:
    return f"http://{API_HOST}:{API_PORT}"


def api_url(path: str) -> str:
    return f"{api_root()}{path}"


def build_payload(idx: int) -> dict[str, str]:
    session_id = f"session-{idx % 5}"
    prompt = f"load test prompt #{idx}"
    return {"session_id": session_id, "prompt": prompt, "agent_id": f"agent-{idx % 3}"}


async def run_agent(client: httpx.AsyncClient, idx: int, stats: dict) -> None:
    start = time.perf_counter()
    try:
        payload = build_payload(idx)
        response = await client.post(api_url("/agents/run"), json=payload)
        response.raise_for_status()
        latency = time.perf_counter() - start
        stats["success"] += 1
        stats["latencies"].append(latency)
    except Exception as e:
        stats["errors"] += 1
        stats["error_types"][type(e).__name__] = stats["error_types"].get(type(e).__name__, 0) + 1


async def wait_for_ready(client: httpx.AsyncClient, timeout: float = 45.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout
    delay = 0.5
    while asyncio.get_event_loop().time() < deadline:
        try:
            response = await client.get(api_url("/healthz"))
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        await asyncio.sleep(delay)
        delay = min(delay * 1.5, 2.0)
    raise RuntimeError("Orchestrator did not become ready within timeout")


def _launch_server(port: int, env: dict[str, str]) -> subprocess.Popen[bytes]:
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        _resolve_uvicorn_app(),
        "--host",
        API_HOST,
        "--port",
        str(port),
    ]
    return subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        env=env,
    )


def _terminate_process(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    with suppress(ProcessLookupError):
        proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        with suppress(ProcessLookupError):
            proc.kill()


async def ensure_server() -> Optional[subprocess.Popen[bytes]]:
    async with httpx.AsyncClient(timeout=2) as client:
        try:
            response = await client.get(api_url("/healthz"))
            if response.status_code == 200:
                return None
        except httpx.HTTPError:
            pass

    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    if not existing:
        env["PYTHONPATH"] = "."
    elif "." not in existing.split(os.pathsep):
        env["PYTHONPATH"] = os.pathsep.join([existing, "."])

    global API_PORT
    last_error = ""
    proc: Optional[subprocess.Popen[bytes]] = None

    for port in (DEFAULT_PORT, DEFAULT_PORT + 1, 0):
        if proc is not None and proc.poll() is None:
            _terminate_process(proc)

        candidate_port = port if port != 0 else DEFAULT_PORT + 2
        proc = _launch_server(candidate_port, env)
        API_PORT = candidate_port

        async with httpx.AsyncClient(timeout=2) as client:
            try:
                await wait_for_ready(client)
                if proc.poll() is not None:
                    stderr = proc.stderr.read().decode(errors="ignore") if proc.stderr else ""
                    last_error = stderr.strip()
                    continue
                return proc
            except RuntimeError:
                stderr = proc.stderr.read().decode(errors="ignore") if proc.stderr else ""
                last_error = stderr.strip()

    if proc is not None and proc.poll() is None:
        _terminate_process(proc)
    raise RuntimeError(f"Failed to start orchestrator subprocess: {last_error}")


async def run_load_test(clients: int, rate: int, seconds: int) -> dict:
    stats = {
        "success": 0,
        "errors": 0,
        "latencies": [],
        "error_types": {},
    }

    start_time = time.time()
    async with httpx.AsyncClient(timeout=150) as client:
        tasks: List[asyncio.Task] = []
        idx = 0
        while time.time() - start_time < seconds:
            batch_size = min(clients, rate)
            for _ in range(batch_size):
                tasks.append(asyncio.create_task(run_agent(client, idx, stats)))
                idx += 1
            if len(tasks) >= clients:
                await asyncio.gather(*tasks, return_exceptions=True)
                tasks.clear()
            await asyncio.sleep(1.0 / rate)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    return stats


async def main(clients: int, rate: int, seconds: int) -> None:
    # Warn if parameters exceed realistic limits for subprocess-based testing
    if clients > 10 or rate > 5:
        print("WARNING: High load parameters may cause timeouts in subprocess mode.")
        print(f"         Recommended: --clients ≤10 --rate ≤5")
        print(f"         Requested: --clients {clients} --rate {rate}")
        print()

    try:
        server_proc = await ensure_server()
    except RuntimeError as exc:
        print(f"Failed to start server: {exc}")
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await wait_for_ready(client)

        print(f"Running load test: {clients} concurrent clients, {rate} req/s, {seconds}s duration")
        stats = await run_load_test(clients, rate, seconds)

        # Calculate metrics
        total = stats["success"] + stats["errors"]
        success_rate = (stats["success"] / total * 100) if total > 0 else 0
        latencies = sorted(stats["latencies"])
        p50 = latencies[int(len(latencies) * 0.5)] if latencies else 0
        p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
        p99 = latencies[int(len(latencies) * 0.99)] if latencies else 0

        print(f"\nResults:")
        print(f"  Total requests: {total}")
        print(f"  Success: {stats['success']} ({success_rate:.1f}%)")
        print(f"  Errors: {stats['errors']}")
        print(f"  Latency p50: {p50*1000:.1f}ms")
        print(f"  Latency p95: {p95*1000:.1f}ms")
        print(f"  Latency p99: {p99*1000:.1f}ms")
        if stats["error_types"]:
            print(f"  Error types: {stats['error_types']}")
    finally:
        if server_proc is not None:
            _terminate_process(server_proc)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MaiFarm orchestrator load generator")
    parser.add_argument("--clients", type=int, default=10, help="Max concurrent clients")
    parser.add_argument("--rate", type=int, default=10, help="Requests per second")
    parser.add_argument("--seconds", type=int, default=10, help="Test duration in seconds")
    args = parser.parse_args()
    asyncio.run(main(args.clients, args.rate, args.seconds))
