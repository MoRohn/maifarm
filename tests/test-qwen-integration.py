#!/usr/bin/env python3
"""
Test script for Qwen3-Coder 480B integration with MaiFarm
Tests the LLM proxy, API integration, and multi-agent orchestration
"""

import os
import sys
import json
import time
import subprocess
import requests
import asyncio
from pathlib import Path
from typing import Dict, Any, List

# Color codes for output
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
RESET = '\033[0m'
BOLD = '\033[1m'

def print_status(message: str, status: str = "info"):
    """Print colored status messages"""
    if status == "success":
        print(f"{GREEN}✓{RESET} {message}")
    elif status == "warning":
        print(f"{YELLOW}⚠{RESET} {message}")
    elif status == "error":
        print(f"{RED}✗{RESET} {message}")
    else:
        print(f"  {message}")

def check_environment():
    """Check environment configuration for Qwen"""
    print(f"\n{BOLD}=== Environment Configuration ==={RESET}")
    
    required_vars = {
        "QWEN_API_KEY": "DashScope API key for Qwen3-Coder",
        "QWEN_API_ENDPOINT": "DashScope API endpoint",
        "QWEN_MODEL": "Qwen model name (e.g., qwen-coder-480b)",
        "LLM_PROXY_URL": "LLM proxy server URL",
        "USE_LLM_PROXY": "Whether to use LLM proxy"
    }
    
    all_configured = True
    for var, description in required_vars.items():
        value = os.getenv(var, "")
        if value:
            # Mask API key for security
            if "KEY" in var:
                display_value = value[:10] + "..." if len(value) > 10 else "***"
            else:
                display_value = value
            print_status(f"{var}: {display_value}", "success")
        else:
            print_status(f"{var}: Not configured ({description})", "warning")
            if var in ["QWEN_API_KEY"]:
                all_configured = False
    
    return all_configured

def test_llm_proxy():
    """Test LLM proxy server"""
    print(f"\n{BOLD}=== Testing LLM Proxy ==={RESET}")
    
    proxy_url = os.getenv("LLM_PROXY_URL", "http://localhost:8001")
    
    # Check if proxy is running
    try:
        response = requests.get(f"{proxy_url}/providers", timeout=5)
        if response.ok:
            providers = response.json().get("providers", [])
            print_status(f"LLM Proxy is running at {proxy_url}", "success")
            print_status(f"Available providers: {', '.join(providers)}", "info")
            
            if "qwen" in providers:
                print_status("Qwen provider is available", "success")
                return True
            else:
                print_status("Qwen provider not available in proxy", "warning")
                return False
        else:
            print_status(f"LLM Proxy returned error: {response.status_code}", "error")
            return False
    except requests.exceptions.RequestException as e:
        print_status(f"LLM Proxy not accessible: {e}", "error")
        print_status("Starting LLM proxy server...", "info")
        
        # Try to start the proxy
        try:
            subprocess.Popen(
                ["python", "llm_proxy.py", "--proxy"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            time.sleep(3)  # Wait for proxy to start
            
            # Try again
            response = requests.get(f"{proxy_url}/providers", timeout=5)
            if response.ok:
                print_status("LLM Proxy started successfully", "success")
                return True
        except Exception as start_error:
            print_status(f"Failed to start LLM proxy: {start_error}", "error")
            return False
    
    return False

def test_qwen_api():
    """Test direct Qwen API via proxy"""
    print(f"\n{BOLD}=== Testing Qwen3-Coder API ==={RESET}")
    
    proxy_url = os.getenv("LLM_PROXY_URL", "http://localhost:8001")
    
    test_messages = [
        {"role": "user", "content": "Write a simple Python function to calculate factorial"}
    ]
    
    request_data = {
        "model": "qwen/qwen-coder-480b",
        "messages": test_messages,
        "max_tokens": 200,
        "temperature": 0.7
    }
    
    try:
        print_status("Sending test request to Qwen3-Coder...", "info")
        response = requests.post(
            f"{proxy_url}/chat/completions",
            json=request_data,
            timeout=30
        )
        
        if response.ok:
            result = response.json()
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"]
                print_status("Qwen3-Coder responded successfully", "success")
                print_status(f"Response preview: {content[:100]}...", "info")
                
                # Check if response contains code
                if "def" in content or "function" in content:
                    print_status("Response contains code as expected", "success")
                return True
            else:
                print_status("Unexpected response format", "error")
                print(json.dumps(result, indent=2))
                return False
        else:
            print_status(f"API request failed: {response.status_code}", "error")
            print_status(f"Error: {response.text}", "error")
            return False
            
    except requests.exceptions.RequestException as e:
        print_status(f"API request failed: {e}", "error")
        return False

def test_ollama_local():
    """Test local Ollama Qwen models"""
    print(f"\n{BOLD}=== Testing Local Ollama Qwen Models ==={RESET}")
    
    # Check if Ollama is installed
    ollama_check = subprocess.run(
        "which ollama",
        shell=True,
        capture_output=True,
        text=True
    )
    
    if ollama_check.returncode != 0:
        print_status("Ollama not installed", "warning")
        print_status("Install from: https://ollama.ai", "info")
        return False
    
    print_status("Ollama is installed", "success")
    
    # Check for Qwen models
    list_result = subprocess.run(
        "ollama list | grep -i qwen",
        shell=True,
        capture_output=True,
        text=True
    )
    
    if list_result.returncode == 0 and list_result.stdout:
        models = list_result.stdout.strip().split('\n')
        print_status(f"Found {len(models)} Qwen model(s):", "success")
        for model in models:
            print_status(f"  - {model.split()[0]}", "info")
        return True
    else:
        print_status("No Qwen models found locally", "warning")
        print_status("Pull a model with: ollama pull qwen2.5-coder:7b", "info")
        return False

def test_multi_agent():
    """Test multi-agent orchestration with Qwen"""
    print(f"\n{BOLD}=== Testing Multi-Agent Orchestration ==={RESET}")
    
    # Check if orchestrator.py exists
    if not Path("orchestrator.py").exists():
        print_status("orchestrator.py not found", "error")
        return False
    
    print_status("orchestrator.py found", "success")
    
    # Test with a simple prompt
    test_command = [
        "python", "multi_claude.py",
        "-n", "2",
        "-p", "Test: Write a simple hello world function",
        "--provider", "qwen",
        "--debug"
    ]
    
    print_status("Testing multi-agent launch with Qwen provider...", "info")
    print_status(f"Command: {' '.join(test_command)}", "info")
    
    try:
        # Run for a short time to test
        process = subprocess.Popen(
            test_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Wait for 10 seconds
        time.sleep(10)
        
        # Check if process is still running
        if process.poll() is None:
            print_status("Multi-agent orchestration started successfully", "success")
            
            # Terminate the test
            process.terminate()
            time.sleep(2)
            
            # Clean up tmux session
            subprocess.run(
                "tmux kill-session -t claude_agents",
                shell=True,
                capture_output=True
            )
            
            return True
        else:
            stdout, stderr = process.communicate()
            print_status("Multi-agent orchestration failed to start", "error")
            if stderr:
                print_status(f"Error: {stderr[:200]}", "error")
            return False
            
    except Exception as e:
        print_status(f"Failed to test multi-agent: {e}", "error")
        return False

def main():
    """Run all tests"""
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}MaiFarm Qwen3-Coder 480B Integration Test Suite{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    
    results = {}
    
    # Check environment
    results["environment"] = check_environment()
    
    # Test LLM proxy
    results["llm_proxy"] = test_llm_proxy()
    
    # Test Qwen API if proxy is available
    if results["llm_proxy"]:
        results["qwen_api"] = test_qwen_api()
    else:
        print_status("Skipping Qwen API test (proxy not available)", "warning")
        results["qwen_api"] = False
    
    # Test local Ollama
    results["ollama"] = test_ollama_local()
    
    # Test multi-agent if any provider is available
    if results["llm_proxy"] or results["ollama"]:
        results["multi_agent"] = test_multi_agent()
    else:
        print_status("Skipping multi-agent test (no providers available)", "warning")
        results["multi_agent"] = False
    
    # Summary
    print(f"\n{BOLD}=== Test Results Summary ==={RESET}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test, result in results.items():
        status = "success" if result else "error"
        test_name = test.replace("_", " ").title()
        print_status(f"{test_name}: {'PASSED' if result else 'FAILED'}", status)
    
    print(f"\n{BOLD}Overall: {passed}/{total} tests passed{RESET}")
    
    if passed == total:
        print_status("All tests passed! Qwen3-Coder integration is ready.", "success")
        return 0
    elif passed > 0:
        print_status("Some tests passed. Partial functionality available.", "warning")
        return 1
    else:
        print_status("All tests failed. Please check configuration.", "error")
        return 2

if __name__ == "__main__":
    sys.exit(main())