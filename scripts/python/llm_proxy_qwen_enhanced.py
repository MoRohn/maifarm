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
            raise ValueError("OPENAI_API_KEY not configured")
            
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
            raise ValueError("OPENAI_API_KEY not configured")
            
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
            raise ValueError("OPENAI_API_KEY not configured")
            
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
            raise ValueError("ANTHROPIC_API_KEY not configured")
            
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
            raise ValueError("ANTHROPIC_API_KEY not configured")
            
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
            raise ValueError("ANTHROPIC_API_KEY not configured")
            
        # Note: Anthropic's API may not support streaming in this form; this is a placeholder
        headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])
        data = {"model": model.split('/')[-1], "prompt": prompt, "max_tokens_to_sample": kwargs.get("max_tokens", 1024)}
        with requests.post(f"{self.base_url}/complete", json=data, headers=headers) as response:
            response.raise_for_status()
            yield response.text

# Qwen Provider (via DashScope API or Local Ollama)
class QwenProvider(BaseProvider):
    """Provider for Qwen models via DashScope API or local Ollama."""
    
    def __init__(self):
        # Check for DashScope API first
        self.api_key = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        self.use_api = bool(self.api_key)
        
        if self.use_api:
            self.base_url = os.getenv("QWEN_API_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1")
            logger.info("Using Qwen via DashScope API")
        else:
            # Check for local Ollama
            self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
            if self._check_ollama():
                logger.info("Using Qwen via local Ollama")
            else:
                logger.warning("No Qwen provider configured. Set QWEN_API_KEY or install Ollama with Qwen model")
    
    def _check_ollama(self) -> bool:
        """Check if Ollama is available with Qwen model."""
        try:
            response = requests.get(f"{self.ollama_host}/api/tags", timeout=2)
            if response.status_code == 200:
                models = response.json().get("models", [])
                return any("qwen" in model.get("name", "").lower() for model in models)
        except:
            pass
        return False
    
    def completion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Synchronous call to Qwen."""
        if self.use_api:
            # Use DashScope API
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Convert to DashScope format
            data = {
                "model": "qwen-max" if "max" in model else "qwen-plus",
                "input": {
                    "messages": messages
                },
                "parameters": {
                    "max_tokens": kwargs.get("max_tokens", 4096),
                    "temperature": kwargs.get("temperature", 0.7),
                    "top_p": kwargs.get("top_p", 0.9)
                }
            }
            
            for attempt in range(3):
                try:
                    response = requests.post(
                        f"{self.base_url}/services/aigc/text-generation/generation",
                        json=data,
                        headers=headers
                    )
                    response.raise_for_status()
                    result = response.json()
                    
                    # Convert to OpenAI format
                    return {
                        "choices": [{
                            "message": {
                                "content": result["output"]["text"],
                                "role": "assistant"
                            }
                        }],
                        "usage": result.get("usage", {})
                    }
                except requests.RequestException as e:
                    logger.error(f"Qwen API attempt {attempt + 1} failed: {e}")
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        else:
            # Use local Ollama
            data = {
                "model": "qwen2.5-coder:7b",  # Default local model
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": kwargs.get("temperature", 0.7),
                    "top_p": kwargs.get("top_p", 0.9),
                    "num_predict": kwargs.get("max_tokens", 2048)
                }
            }
            
            try:
                response = requests.post(
                    f"{self.ollama_host}/api/chat",
                    json=data
                )
                response.raise_for_status()
                result = response.json()
                
                return {
                    "choices": [{
                        "message": result["message"]
                    }],
                    "usage": {
                        "total_tokens": result.get("eval_count", 0)
                    }
                }
            except requests.RequestException as e:
                logger.error(f"Ollama request failed: {e}")
                raise
    
    async def acompletion(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Asynchronous call to Qwen."""
        if self.use_api:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "qwen-max" if "max" in model else "qwen-plus",
                "input": {
                    "messages": messages
                },
                "parameters": {
                    "max_tokens": kwargs.get("max_tokens", 4096),
                    "temperature": kwargs.get("temperature", 0.7),
                    "top_p": kwargs.get("top_p", 0.9)
                }
            }
            
            async with aiohttp.ClientSession() as session:
                for attempt in range(3):
                    try:
                        async with session.post(
                            f"{self.base_url}/services/aigc/text-generation/generation",
                            json=data,
                            headers=headers
                        ) as resp:
                            resp.raise_for_status()
                            result = await resp.json()
                            
                            return {
                                "choices": [{
                                    "message": {
                                        "content": result["output"]["text"],
                                        "role": "assistant"
                                    }
                                }],
                                "usage": result.get("usage", {})
                            }
                    except aiohttp.ClientError as e:
                        logger.error(f"Qwen async attempt {attempt + 1} failed: {e}")
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2 ** attempt)
        else:
            # Use local Ollama (async)
            data = {
                "model": "qwen2.5-coder:7b",
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": kwargs.get("temperature", 0.7),
                    "top_p": kwargs.get("top_p", 0.9),
                    "num_predict": kwargs.get("max_tokens", 2048)
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.ollama_host}/api/chat", json=data) as resp:
                    resp.raise_for_status()
                    result = await resp.json()
                    
                    return {
                        "choices": [{
                            "message": result["message"]
                        }],
                        "usage": {
                            "total_tokens": result.get("eval_count", 0)
                        }
                    }
    
    def completion_stream(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """Streaming call to Qwen."""
        if self.use_api:
            # DashScope streaming
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-DashScope-SSE": "enable"
            }
            
            data = {
                "model": "qwen-max" if "max" in model else "qwen-plus",
                "input": {
                    "messages": messages
                },
                "parameters": {
                    "max_tokens": kwargs.get("max_tokens", 4096),
                    "temperature": kwargs.get("temperature", 0.7),
                    "incremental_output": True
                }
            }
            
            with requests.post(
                f"{self.base_url}/services/aigc/text-generation/generation",
                json=data,
                headers=headers,
                stream=True
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        yield line.decode("utf-8")
        else:
            # Ollama streaming
            data = {
                "model": "qwen2.5-coder:7b",
                "messages": messages,
                "stream": True
            }
            
            with requests.post(
                f"{self.ollama_host}/api/chat",
                json=data,
                stream=True
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        yield line.decode("utf-8")

# Initialize providers conditionally
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
app = FastAPI()

@app.get("/providers")
async def list_providers():
    """List available providers and their status."""
    status = {}
    for name, provider in PROVIDERS.items():
        if name == "qwen":
            qwen_prov = provider
            status[name] = {
                "available": True,
                "use_api": qwen_prov.use_api,
                "api_configured": bool(qwen_prov.api_key),
                "ollama_available": qwen_prov._check_ollama() if not qwen_prov.use_api else False
            }
        elif name == "openai":
            status[name] = {
                "available": True,
                "api_configured": bool(provider.api_key)
            }
        elif name == "anthropic":
            status[name] = {
                "available": True,
                "api_configured": bool(provider.api_key)
            }
    return {"providers": status}

@app.post("/chat/completions")
async def chat_completions(request: Dict[str, Any]):
    """Handle chat completion requests via the proxy."""
    try:
        model = request.get("model", "qwen/qwen2.5-coder")
        messages = request.get("messages", [])
        
        # Extract other parameters
        kwargs = {k: v for k, v in request.items() if k not in ["model", "messages"]}
        
        response = await acompletion(model, messages, **kwargs)
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM Interface with Qwen Support")
    parser.add_argument("--proxy", action="store_true", help="Start the proxy server on port 8001")
    parser.add_argument("--port", type=int, default=8001, help="Port for proxy server (default: 8001)")
    args = parser.parse_args()
    
    if args.proxy:
        import uvicorn
        print(f"Starting LLM proxy server on port {args.port}")
        print(f"Available providers: {list(PROVIDERS.keys())}")
        uvicorn.run(app, host="0.0.0.0", port=args.port)
    else:
        # Example usage
        print("Testing LLM providers...")
        messages = [{"role": "user", "content": "Hello, write a simple Python hello world function."}]
        
        # Test Qwen if available
        if "qwen" in PROVIDERS:
            try:
                print("\nTesting Qwen provider...")
                response = completion("qwen/qwen2.5-coder", messages)
                print("Qwen Response:", response["choices"][0]["message"]["content"][:200] + "...")
            except Exception as e:
                print(f"Qwen Error: {e}")
        
        # Test other providers if needed
        for provider_name in ["openai", "anthropic"]:
            if provider_name in PROVIDERS:
                try:
                    print(f"\nTesting {provider_name} provider...")
                    model = f"{provider_name}/gpt-4" if provider_name == "openai" else f"{provider_name}/claude-3"
                    response = completion(model, messages)
                    print(f"{provider_name.title()} Response:", response["choices"][0]["message"]["content"][:200] + "...")
                except Exception as e:
                    print(f"{provider_name.title()} Error: {e}")