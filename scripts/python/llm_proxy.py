import os
import logging
import asyncio
import requests
import aiohttp
import time
import json
from abc import ABC, abstractmethod
from typing import List, Dict, Any, AsyncGenerator
from fastapi import FastAPI, HTTPException
import argparse

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Base Provider Class
class BaseProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous completion method."""
        pass
    
    @abstractmethod
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous completion method."""
        pass
    
    @abstractmethod
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming completion method."""
        pass

# OpenAI Provider
class OpenAIProvider(BaseProvider):
    """Provider for OpenAI API."""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = "https://api.openai.com/v1"
        if not self.api_key:
            logger.warning("OPENAI_API_KEY environment variable is not set")
    
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous call to OpenAI API."""
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        data = {"model": model.split('/')[-1], "messages": messages, **kwargs}
        for attempt in range(3):  # Retry logic
            try:
                response = requests.post(f"{self.base_url}/chat/completions", json=data, headers=headers)
                response.raise_for_status()
                return response.json()
            except requests.RequestException as e:
                logger.error(f"OpenAI attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)  # Exponential backoff
    
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous call to OpenAI API."""
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        data = {"model": model.split('/')[-1], "messages": messages, **kwargs}
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):
                try:
                    async with session.post(f"{self.base_url}/chat/completions", json=data, headers=headers) as resp:
                        resp.raise_for_status()
                        return await resp.json()
                except aiohttp.ClientError as e:
                    logger.error(f"OpenAI async attempt {attempt + 1} failed: {e}")
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
    
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming call to OpenAI API."""
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        data = {"model": model.split('/')[-1], "messages": messages, "stream": True, **kwargs}
        with requests.post(f"{self.base_url}/chat/completions", json=data, headers=headers, stream=True) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    yield line.decode("utf-8")

# Anthropic Provider
class AnthropicProvider(BaseProvider):
    """Provider for Anthropic API."""
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1"
        if not self.api_key:
            logger.warning("ANTHROPIC_API_KEY environment variable is not set")
    
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous call to Anthropic API (simplified)."""
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        # Convert OpenAI-style messages to Anthropic format (simplified)
        prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])
        data = {"model": model.split('/')[-1], "prompt": prompt, "max_tokens_to_sample": kwargs.get("max_tokens", 1024)}
        for attempt in range(3):
            try:
                response = requests.post(f"{self.base_url}/complete", json=data, headers=headers)
                response.raise_for_status()
                raw = response.json()
                return {
                    "choices": [{"message": {"content": raw["completion"], "role": "assistant"}}],
                    "usage": {"completion_tokens": len(raw["completion"].split())}
                }
            except requests.RequestException as e:
                logger.error(f"Anthropic attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous call to Anthropic API."""
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])
        data = {"model": model.split('/')[-1], "prompt": prompt, "max_tokens_to_sample": kwargs.get("max_tokens", 1024)}
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):
                try:
                    async with session.post(f"{self.base_url}/complete", json=data, headers=headers) as resp:
                        resp.raise_for_status()
                        raw = await resp.json()
                        return {
                            "choices": [{"message": {"content": raw["completion"], "role": "assistant"}}],
                            "usage": {"completion_tokens": len(raw["completion"].split())}
                        }
                except aiohttp.ClientError as e:
                    logger.error(f"Anthropic async attempt {attempt + 1} failed: {e}")
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
    
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming call to Anthropic API (placeholder)."""
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        # Note: Anthropic's API may not support streaming in this form; this is a placeholder
        headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])
        data = {"model": model.split('/')[-1], "prompt": prompt, "max_tokens_to_sample": kwargs.get("max_tokens", 1024)}
        with requests.post(f"{self.base_url}/complete", json=data, headers=headers) as response:
            response.raise_for_status()
            yield response.text

# Qwen Provider
class QwenProvider(BaseProvider):
    """Provider for Qwen API (DashScope)."""
    
    def __init__(self):
        self.api_key = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        self.base_url = os.getenv("QWEN_API_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1")
        self.model = os.getenv("QWEN_MODEL", "qwen-coder-480b")
        if not self.api_key:
            logger.warning("QWEN_API_KEY/DASHSCOPE_API_KEY not set - Qwen provider will not be available")
    
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous call to Qwen API."""
        if not self.api_key:
            raise ValueError("QWEN_API_KEY or DASHSCOPE_API_KEY environment variable is not set")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Use the configured model or the one passed in
        model_name = model.split('/')[-1] if '/' in model else self.model
        
        data = {
            "model": model_name,
            "input": {"messages": messages},
            "parameters": {
                "result_format": "message",
                "temperature": kwargs.get("temperature", 0.7),
                "max_tokens": kwargs.get("max_tokens", 4096),
                "top_p": kwargs.get("top_p", 0.9),
                "top_k": kwargs.get("top_k", 50),
                "stop": kwargs.get("stop", [])
            }
        }
        
        url = f"{self.base_url}/services/aigc/text-generation/generation"
        
        for attempt in range(3):  # Retry logic
            try:
                response = requests.post(url, json=data, headers=headers)
                response.raise_for_status()
                result = response.json()
                
                # Convert Qwen response to OpenAI format for compatibility
                if "output" in result and "choices" in result["output"]:
                    return {
                        "choices": [{
                            "message": result["output"]["choices"][0]["message"],
                            "finish_reason": result["output"]["choices"][0].get("finish_reason", "stop")
                        }],
                        "usage": result.get("usage", {})
                    }
                elif "output" in result and "text" in result["output"]:
                    return {
                        "choices": [{
                            "message": {"content": result["output"]["text"], "role": "assistant"}
                        }],
                        "usage": result.get("usage", {})
                    }
                else:
                    raise ValueError(f"Unexpected Qwen response format: {result}")
                    
            except requests.RequestException as e:
                logger.error(f"Qwen attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)  # Exponential backoff
    
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous call to Qwen API."""
        if not self.api_key:
            raise ValueError("QWEN_API_KEY or DASHSCOPE_API_KEY environment variable is not set")
            
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        model_name = model.split('/')[-1] if '/' in model else self.model
        
        data = {
            "model": model_name,
            "input": {"messages": messages},
            "parameters": {
                "result_format": "message",
                "temperature": kwargs.get("temperature", 0.7),
                "max_tokens": kwargs.get("max_tokens", 4096),
                "top_p": kwargs.get("top_p", 0.9),
                "top_k": kwargs.get("top_k", 50),
                "stop": kwargs.get("stop", [])
            }
        }
        
        url = f"{self.base_url}/services/aigc/text-generation/generation"
        
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):
                try:
                    async with session.post(url, json=data, headers=headers) as resp:
                        resp.raise_for_status()
                        result = await resp.json()
                        
                        # Convert response format
                        if "output" in result and "choices" in result["output"]:
                            return {
                                "choices": [{
                                    "message": result["output"]["choices"][0]["message"],
                                    "finish_reason": result["output"]["choices"][0].get("finish_reason", "stop")
                                }],
                                "usage": result.get("usage", {})
                            }
                        elif "output" in result and "text" in result["output"]:
                            return {
                                "choices": [{
                                    "message": {"content": result["output"]["text"], "role": "assistant"}
                                }],
                                "usage": result.get("usage", {})
                            }
                        else:
                            raise ValueError(f"Unexpected Qwen response format: {result}")
                            
                except aiohttp.ClientError as e:
                    logger.error(f"Qwen async attempt {attempt + 1} failed: {e}")
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
    
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming call to Qwen API."""
        if not self.api_key:
            raise ValueError("QWEN_API_KEY or DASHSCOPE_API_KEY environment variable is not set")
            
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-SSE": "enable"  # Enable SSE for streaming
        }
        
        model_name = model.split('/')[-1] if '/' in model else self.model
        
        data = {
            "model": model_name,
            "input": {"messages": messages},
            "parameters": {
                "result_format": "message",
                "temperature": kwargs.get("temperature", 0.7),
                "max_tokens": kwargs.get("max_tokens", 4096),
                "incremental_output": True  # Enable incremental output
            }
        }
        
        url = f"{self.base_url}/services/aigc/text-generation/generation"
        
        with requests.post(url, json=data, headers=headers, stream=True) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    yield line.decode("utf-8")

# Ollama Provider for local Qwen models
class OllamaProvider(BaseProvider):
    """Provider for local Ollama models including Qwen."""
    
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")
        
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous call to Ollama API."""
        url = f"{self.base_url}/api/chat"
        
        # Use default model if not specified
        model_name = model.split('/')[-1] if '/' in model else self.default_model
        
        data = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", 0.7),
                "num_predict": kwargs.get("max_tokens", 4096),
                "top_p": kwargs.get("top_p", 0.9),
                "top_k": kwargs.get("top_k", 50),
                "stop": kwargs.get("stop", [])
            }
        }
        
        for attempt in range(3):
            try:
                response = requests.post(url, json=data)
                response.raise_for_status()
                result = response.json()
                
                # Convert Ollama response to OpenAI format
                return {
                    "choices": [{
                        "message": result.get("message", {"content": "", "role": "assistant"}),
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": result.get("prompt_eval_count", 0),
                        "completion_tokens": result.get("eval_count", 0),
                        "total_tokens": result.get("prompt_eval_count", 0) + result.get("eval_count", 0)
                    }
                }
            except requests.RequestException as e:
                logger.error(f"Ollama attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous call to Ollama API."""
        url = f"{self.base_url}/api/chat"
        
        model_name = model.split('/')[-1] if '/' in model else self.default_model
        
        data = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", 0.7),
                "num_predict": kwargs.get("max_tokens", 4096),
                "top_p": kwargs.get("top_p", 0.9),
                "top_k": kwargs.get("top_k", 50),
                "stop": kwargs.get("stop", [])
            }
        }
        
        async with aiohttp.ClientSession() as session:
            for attempt in range(3):
                try:
                    async with session.post(url, json=data) as resp:
                        resp.raise_for_status()
                        result = await resp.json()
                        
                        return {
                            "choices": [{
                                "message": result.get("message", {"content": "", "role": "assistant"}),
                                "finish_reason": "stop"
                            }],
                            "usage": {
                                "prompt_tokens": result.get("prompt_eval_count", 0),
                                "completion_tokens": result.get("eval_count", 0),
                                "total_tokens": result.get("prompt_eval_count", 0) + result.get("eval_count", 0)
                            }
                        }
                except aiohttp.ClientError as e:
                    logger.error(f"Ollama async attempt {attempt + 1} failed: {e}")
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
    
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming call to Ollama API."""
        url = f"{self.base_url}/api/chat"
        
        model_name = model.split('/')[-1] if '/' in model else self.default_model
        
        data = {
            "model": model_name,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": kwargs.get("temperature", 0.7),
                "num_predict": kwargs.get("max_tokens", 4096)
            }
        }
        
        with requests.post(url, json=data, stream=True) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    yield line.decode("utf-8")

# Provider Registry - Initialize providers conditionally
PROVIDERS = {}

try:
    PROVIDERS["openai"] = OpenAIProvider()
except Exception as e:
    logger.warning(f"OpenAI provider not available: {e}")

try:
    PROVIDERS["anthropic"] = AnthropicProvider()
except Exception as e:
    logger.warning(f"Anthropic provider not available: {e}")

try:
    PROVIDERS["qwen"] = QwenProvider()
except Exception as e:
    logger.warning(f"Qwen provider not available: {e}")

try:
    PROVIDERS["ollama"] = OllamaProvider()
except Exception as e:
    logger.warning(f"Ollama provider not available: {e}")

def get_provider(model: str) -> BaseProvider:
    """Retrieve provider based on model prefix."""
    provider_name = model.split('/')[0]
    provider = PROVIDERS.get(provider_name)
    if not provider:
        raise ValueError(f"Provider for model {model} not found. Available providers: {list(PROVIDERS.keys())}")
    return provider

# Unified Interface Functions
def completion(model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
    """Unified synchronous completion function."""
    provider = get_provider(model)
    return provider.completion(model, messages, **kwargs)

async def acompletion(model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
    """Unified asynchronous completion function."""
    provider = get_provider(model)
    return await provider.acompletion(model, messages, **kwargs)

def completion_stream(model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
    """Unified streaming completion function."""
    provider = get_provider(model)
    return provider.completion_stream(model, messages, **kwargs)

# Optional Proxy Server with FastAPI
# To use the proxy server, install FastAPI and Uvicorn:
# pip install fastapi uvicorn
app = FastAPI(title="LLM Proxy", version="1.0.0")

@app.get("/providers")
async def list_providers():
    """List available providers and their status."""
    return {
        "providers": list(PROVIDERS.keys()),
        "status": "ready"
    }

@app.post("/chat/completions")
async def chat_completions(request: Dict[str, Any]):
    """Handle chat completion requests via the proxy."""
    try:
        model = request.get("model", "qwen/qwen-coder-480b")
        messages = request.get("messages", [])
        kwargs = {k: v for k, v in request.items() if k not in ["model", "messages"]}
        
        response = await acompletion(model, messages, **kwargs)
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in chat completions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
async def v1_chat_completions(request: Dict[str, Any]):
    """OpenAI-compatible endpoint."""
    return await chat_completions(request)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM Interface Script")
    parser.add_argument("--proxy", action="store_true", help="Start the proxy server on port 8001")
    parser.add_argument("--port", type=int, default=8001, help="Port for the proxy server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host for the proxy server")
    args = parser.parse_args()
    
    if args.proxy:
        import uvicorn
        logger.info(f"Starting LLM Proxy server on {args.host}:{args.port}")
        logger.info(f"Available providers: {list(PROVIDERS.keys())}")
        uvicorn.run(app, host=args.host, port=args.port)
    else:
        # Example usage
        print("LLM Proxy - Example Usage")
        print(f"Available providers: {list(PROVIDERS.keys())}")
        
        messages = [{"role": "user", "content": "Hello, how are you?"}]
        
        # Test Qwen if available
        if "qwen" in PROVIDERS:
            try:
                print("\nTesting Qwen provider...")
                response = completion("qwen/qwen-coder-480b", messages)
                print("Qwen Response:", response["choices"][0]["message"]["content"])
            except Exception as e:
                print(f"Qwen test failed: {e}")
        
        # Test Ollama if available
        if "ollama" in PROVIDERS:
            try:
                print("\nTesting Ollama provider...")
                response = completion("ollama/qwen2.5-coder:7b", messages)
                print("Ollama Response:", response["choices"][0]["message"]["content"])
            except Exception as e:
                print(f"Ollama test failed: {e}")