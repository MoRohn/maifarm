#!/usr/bin/env python3
"""
Grok Agent for MaiFarm

This agent connects to xAI's Grok API and executes prompts.
It integrates with the MaiFarm orchestration system.

Grok uses an OpenAI-compatible API format at https://api.x.ai/v1
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("[GROK] ERROR: requests library not installed. Run: pip install requests")
    sys.exit(1)


def log(message: str, level: str = "INFO") -> None:
    """Log a message with timestamp."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    output = f"[{timestamp}] [{level}] {message}"
    print(output, flush=True)


def read_prompt_file(path: str) -> str:
    """Read prompt from file."""
    with open(path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def get_api_key() -> Optional[str]:
    """Get Grok/xAI API key from environment."""
    return os.environ.get("GROK_API_KEY") or os.environ.get("XAI_API_KEY")


def check_api_health(api_key: str, timeout: int = 10) -> dict:
    """Check xAI API health by listing models."""
    try:
        response = requests.get(
            "https://api.x.ai/v1/models",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=timeout
        )
        if response.status_code == 200:
            models = response.json()
            return {"healthy": True, "models": models.get("data", [])}
        elif response.status_code == 401:
            return {"error": "Invalid API key", "healthy": False}
        else:
            return {"error": f"Status {response.status_code}", "healthy": False}
    except requests.exceptions.Timeout:
        return {"error": "Connection timed out", "healthy": False}
    except Exception as e:
        return {"error": str(e), "healthy": False}


def call_grok_api(
    api_key: str,
    prompt: str,
    agent_name: str,
    model: str = "grok-2",
    max_tokens: int = 8192,
    temperature: float = 0.7,
    timeout: int = 180
) -> dict:
    """Call the xAI Grok API using OpenAI-compatible format."""
    try:
        response = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": f"You are {agent_name}, an AI agent working in the MaiFarm multi-agent system. "
                                   "You collaborate with other agents to complete tasks efficiently. "
                                   "You have access to real-time information and can provide up-to-date responses."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False
            },
            timeout=timeout
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        return {"error": "Request timed out (Grok API)", "success": False}
    except requests.exceptions.RequestException as e:
        error_detail = str(e)
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_json = e.response.json()
                error_detail = error_json.get('error', {}).get('message', str(e))
            except:
                error_detail = e.response.text[:500] if e.response.text else str(e)
        return {"error": error_detail, "success": False}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON response from Grok API", "success": False}


def extract_code_blocks(content: str) -> list:
    """Extract code blocks from markdown-style content."""
    import re
    pattern = r'```[\w]*\n([\s\S]*?)\n```'
    matches = re.findall(pattern, content)
    return matches


def generate_fallback_response(prompt: str, agent_name: str, error: str) -> str:
    """Generate a fallback response when API is unavailable."""
    import hashlib

    summary = prompt[:200].replace('`', '').replace('\n', ' ').strip()
    if len(prompt) > 200:
        summary += "..."

    return f"""### Grok Agent Status

**Agent:** {agent_name}
**Status:** API Unavailable - Fallback Mode

### Error Details
- {error}

### Request Summary
- Prompt length: {len(prompt)} characters
- Prompt preview: {summary}

### Recommended Actions
1. Verify GROK_API_KEY or XAI_API_KEY is set correctly
2. Check API key starts with 'xai-' prefix
3. Confirm xAI API access at https://console.x.ai
4. Retry task once API connectivity is restored

### Generated By
- MaiFarm Grok Agent (fallback mode)"""


def execute_agent(
    prompt: str,
    agent_name: str,
    model: str = "grok-2",
    workspace_dir: Optional[str] = None
) -> None:
    """Execute the Grok agent with the given prompt."""

    log(f"[GROK] Agent {agent_name} starting...")
    log(f"[GROK] Connecting to xAI API at https://api.x.ai/v1...")

    # Get API key
    api_key = get_api_key()
    if not api_key:
        log("[GROK] ERROR: No API key found. Set GROK_API_KEY or XAI_API_KEY", "ERROR")
        log("[GROK] Get your API key at https://console.x.ai", "ERROR")
        result = generate_fallback_response(prompt, agent_name, "No API key configured")
        print(result, flush=True)
        # Enter idle mode even on error
        log("[GROK] Agent entering idle monitoring mode (API key missing)...")
        while True:
            time.sleep(60)
            log("[GROK] Waiting for API key configuration...")
        return

    # Validate API key format
    if not api_key.startswith('xai-') and not api_key.startswith('grok-'):
        log(f"[GROK] Warning: API key format may be invalid (expected xai- or grok- prefix)", "WARN")

    # Check API health
    log("[GROK] Checking xAI API connectivity...")
    health = check_api_health(api_key)
    if not health.get("healthy"):
        log(f"[GROK] API health check failed: {health.get('error')}", "ERROR")
        result = generate_fallback_response(prompt, agent_name, health.get('error', 'Unknown error'))
        print(result, flush=True)
        log("[GROK] Agent entering idle monitoring mode (API unavailable)...")
        while True:
            time.sleep(60)
            log("[GROK] API unavailable, waiting...")
        return

    # Log available models
    models = health.get("models", [])
    if models:
        model_names = [m.get("id", "unknown") for m in models[:5]]
        log(f"[GROK] Available models: {', '.join(model_names)}")

    log(f"[GROK] Using model: {model}")
    log(f"[GROK] Ready to process tasks with {model}")

    # Log prompt summary
    prompt_preview = prompt[:200] + "..." if len(prompt) > 200 else prompt
    log(f"[GROK] Received prompt: {prompt_preview}")

    # Call Grok API
    log("[GROK] Sending request to Grok API...")
    start_time = time.time()

    response = call_grok_api(
        api_key=api_key,
        prompt=prompt,
        agent_name=agent_name,
        model=model,
        max_tokens=8192,
        temperature=0.7
    )

    elapsed = time.time() - start_time
    log(f"[GROK] Response received in {elapsed:.2f}s")

    result = None

    # Handle error
    if response.get("error"):
        log(f"[GROK] API Error: {response['error']}", "ERROR")
        result = generate_fallback_response(prompt, agent_name, response['error'])
    else:
        # Extract response from API
        try:
            result = response.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Log usage if available
            usage = response.get("usage", {})
            if usage:
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                total_tokens = usage.get("total_tokens", 0)
                log(f"[GROK] Token usage: prompt={prompt_tokens}, completion={completion_tokens}, total={total_tokens}")

        except Exception as e:
            log(f"[GROK] Error extracting response: {e}", "ERROR")
            result = generate_fallback_response(prompt, agent_name, str(e))

    # Display result
    if result:
        log("[GROK] === Response Start ===")
        print(result, flush=True)
        log("[GROK] === Response End ===")

        # Extract code blocks and save if workspace is available
        code_blocks = extract_code_blocks(result)
        if code_blocks and workspace_dir:
            workspace = Path(workspace_dir)
            for i, code in enumerate(code_blocks):
                filename = workspace / f"grok_output_{i}.txt"
                try:
                    filename.write_text(code, encoding='utf-8')
                    log(f"[GROK] Created file: {filename}")
                except Exception as e:
                    log(f"[GROK] Failed to write file: {e}", "WARN")

        log("[GROK] Task completed successfully")
    else:
        log("[GROK] Empty response received", "WARN")

    # Keep agent running for monitoring
    log("[GROK] Agent entering idle monitoring mode...")
    idle_count = 0
    while True:
        time.sleep(30)
        idle_count += 1
        if idle_count % 2 == 0:  # Log every minute
            log(f"[GROK] Agent idle ({idle_count * 30}s elapsed)")


def main():
    parser = argparse.ArgumentParser(description="Grok Agent for MaiFarm")
    parser.add_argument("--prompt", help="Inline prompt text")
    parser.add_argument("--prompt-file", type=Path, help="Path to prompt file")
    parser.add_argument("--model", default=os.environ.get("GROK_MODEL", "grok-2"),
                        help="Grok model to use (grok-2 or grok-2-mini)")
    parser.add_argument("--agent-name", default=os.environ.get("AGENT_NAME", "Grok Agent"),
                        help="Agent name")
    parser.add_argument("--workspace", default=os.environ.get("WORKSPACE_DIR"),
                        help="Workspace directory for output files")

    args = parser.parse_args()

    # Get prompt
    prompt = None
    if args.prompt:
        prompt = args.prompt
    elif args.prompt_file:
        if args.prompt_file.exists():
            prompt = read_prompt_file(str(args.prompt_file))
        else:
            log(f"[GROK] Prompt file not found: {args.prompt_file}", "ERROR")
            sys.exit(1)
    elif os.environ.get("AGENT_PROMPT"):
        prompt = os.environ["AGENT_PROMPT"]
    else:
        log("[GROK] No prompt provided. Use --prompt, --prompt-file, or AGENT_PROMPT env var", "ERROR")
        sys.exit(1)

    # Execute agent
    try:
        execute_agent(
            prompt=prompt,
            agent_name=args.agent_name,
            model=args.model,
            workspace_dir=args.workspace
        )
    except KeyboardInterrupt:
        log("[GROK] Agent interrupted by user")
        sys.exit(0)
    except Exception as e:
        log(f"[GROK] Agent error: {e}", "ERROR")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
