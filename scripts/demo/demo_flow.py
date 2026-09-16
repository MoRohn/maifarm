#!/usr/bin/env python3
"""Demonstration script: tmux session + agent run streaming."""
from __future__ import annotations

import asyncio
import importlib.util
import os
import signal
import subprocess
import sys
from contextlib import suppress
from typing import Any, Optional, cast

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


async def create_tmux_session(client: httpx.AsyncClient) -> str:
    response = await client.post(api_url("/tmux/session"), json={"name": "demo"})
    response.raise_for_status()
    payload = cast(dict[str, Any], response.json())
    return cast(str, payload["session_id"])


async def create_pane(client: httpx.AsyncClient, session_id: str, command: str) -> str:
    response = await client.post(
        api_url("/tmux/pane"),
        json={"session_id": session_id, "command": command},
    )
    response.raise_for_status()
    payload = cast(dict[str, Any], response.json())
    return cast(str, payload["pane_id"])


async def run_agent(client: httpx.AsyncClient, session_id: str, pane_id: Optional[str]) -> str:
    payload = {
        "session_id": session_id,
        "prompt": "Demonstrating MaiFarm orchestrator streaming output.",
        "tmux_pane_id": pane_id,
    }
    response = await client.post(api_url("/agents/run"), json=payload)
    response.raise_for_status()
    response_payload = cast(dict[str, Any], response.json())
    return cast(str, response_payload["run_id"])


async def wait_for_ready(client: httpx.AsyncClient, timeout: float = 20.0) -> None:
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


async def main() -> None:
    try:
        server_proc = await ensure_server()
    except RuntimeError as exc:
        print(f"Skipping demo: {exc}")
        return
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await wait_for_ready(client)
            session_id = await create_tmux_session(client)
            pane_id = await create_pane(client, session_id, "yes 'Harvest stream demo' | head -n 5")
            run_id = await run_agent(client, session_id, pane_id)
            print(f"Session {session_id}, pane {pane_id}, run {run_id}")
            print("Open dashboard to observe streaming events.")
            await asyncio.sleep(5)
    finally:
        if server_proc is not None:
            _terminate_process(server_proc)


if __name__ == "__main__":
    asyncio.run(main())
