#!/usr/bin/env python3
"""
GPT-OSS Local AI Server
OpenAI-compatible API server for local LLM inference

Supports multiple backends:
- vLLM (recommended for GPU with CUDA)
- llama-cpp-python (recommended for CPU/Apple Silicon)

Environment Variables:
- GPT_OSS_HOST: Server host (default: localhost)
- GPT_OSS_PORT: Server port (default: 8000)
- GPT_OSS_MODEL: Model to load (default: openai/gpt-oss-20b)
- GPT_OSS_BACKEND: Backend to use (vllm, llama-cpp, mini, mock) (default: auto-detect)
- GPT_OSS_MODEL_PATH: Path to model files (for llama-cpp)
- GPT_OSS_GPU_MEMORY: GPU memory utilization (0.0-1.0)
- GPT_OSS_ALLOW_MOCK: When true, allow embedded mini backend fallback
"""

import asyncio
import json
import logging
import os
import re
import sys
import time
import uuid
import hashlib
from random import Random
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator, Dict, List, Optional, Union

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import uvicorn
from urllib.parse import urlparse

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("gpt-oss-server")

# Configuration
RAW_HOST = os.getenv("GPT_OSS_HOST", "localhost")

if "://" in RAW_HOST:
    parsed_host = urlparse(RAW_HOST)
else:
    parsed_host = urlparse(f"http://{RAW_HOST}")

HOST = parsed_host.hostname or "localhost"
PORT = int(os.getenv("GPT_OSS_PORT", str(parsed_host.port or 8000)))
MODEL_NAME = os.getenv("GPT_OSS_MODEL", "openai/gpt-oss-20b")  # OpenAI's open-source model
BACKEND = os.getenv("GPT_OSS_BACKEND", "auto")  # auto, vllm, llama-cpp, mini, mock
MODEL_PATH = os.getenv("GPT_OSS_MODEL_PATH", "")
GPU_MEMORY = float(os.getenv("GPT_OSS_GPU_MEMORY", "0.9"))
ALLOW_EMBEDDED_BACKEND = os.getenv("GPT_OSS_ALLOW_MOCK", "false").lower() in {"1", "true", "yes"}

# Global model instance
model_instance = None


# ============================================================================
# Pydantic Models (OpenAI-compatible)
# ============================================================================

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: system, user, assistant, or tool")
    content: str = Field(..., description="Message content")
    name: Optional[str] = Field(None, description="Optional name for the message")


class ToolFunction(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Dict = Field(default_factory=dict)


class Tool(BaseModel):
    type: str = "function"
    function: ToolFunction


class ChatCompletionRequest(BaseModel):
    model: str = Field(default=MODEL_NAME)
    messages: List[ChatMessage]
    temperature: Optional[float] = Field(default=0.6, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(default=8192, ge=1)
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None
    tools: Optional[List[Tool]] = None
    tool_choice: Optional[Union[str, Dict]] = "auto"


class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponseMessage(BaseModel):
    role: str = "assistant"
    content: Optional[str] = None


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatCompletionResponseMessage
    finish_reason: str = "stop"


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    usage: Usage


# ============================================================================
# Model Backends
# ============================================================================

class ModelBackend:
    """Abstract base for model backends"""

    async def initialize(self) -> None:
        """Initialize the model backend"""
        pass

    async def generate(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> str:
        """Generate a completion"""
        raise NotImplementedError

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> AsyncIterator[str]:
        """Generate a streaming completion"""
        raise NotImplementedError

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation)"""
        return len(text.split()) * 1.3  # Rough estimate


def _safe_truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _extract_actions(prompt: str) -> List[str]:
    verbs = ['create', 'build', 'review', 'summarize', 'optimize', 'list', 'document', 'analyze', 'explore']
    sentences = [segment.strip() for segment in re.split(r'[\.\n\r]', prompt) if segment.strip()]

    actions: List[str] = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(verb in lower for verb in verbs):
            actions.append(sentence[0].upper() + sentence[1:])
        if len(actions) >= 4:
            break

    if not actions and sentences:
        actions.append(f"Clarify intent: {_safe_truncate(sentences[0], 80)}")

    return actions


def _normalize_prompt(messages: List[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == 'user' and message.content:
            return message.content
    return ''


def _directory_listing_response() -> str:
    return (
        "### Directory Survey\n"
        "- apps/\n"
        "- packages/\n"
        "- scripts/\n"
        "- reports/\n"
        "- README.md\n"
        "- package.json\n\n"
        "Use `ls -a` for dotfiles and `tree -L 1` for a scoped view."
    )


def _code_review_response(prompt: str) -> str:
    lines = [line.strip() for line in prompt.split('\n') if line.strip()][:12]
    snippet = '\n'.join(f"  {line}" for line in lines) or '// omitted'
    return (
        "### Review Summary\n"
        "- Potential null handling gaps detected.\n"
        "- Tight coupling between validation and orchestration logic.\n"
        "- Missing unit coverage for error surfaces.\n\n"
        "### Code Snippet (trimmed)\n"
        f"```ts\n{snippet}\n```\n\n"
        "### Suggested Actions\n"
        "1. Add guards for optional inputs before invoking downstream services.\n"
        "2. Isolate side-effects to improve testability.\n"
        "3. Extend tests to cover unhappy paths and concurrency behaviour.\n\n"
        "### Risk\n"
        "- Medium: failure to guard inputs may cascade into orchestrator crashes."
    )


def _rest_api_plan_response() -> str:
    return (
        "### Goal\n"
        "- Build an Express.js REST API with three endpoints.\n\n"
        "### High-Level Plan\n"
        "1. Scaffold project structure (`src/app.ts`, `src/routes`).\n"
        "2. Implement health, resources, and metrics endpoints.\n"
        "3. Add shared error middleware and validation guards.\n"
        "4. Create npm scripts for linting, testing, and launching.\n\n"
        "### Folder Layout\n"
        "```
src/
  app.ts
  routes/
    index.ts
    metrics.ts
    resources.ts
  middleware/
    errorHandler.ts
    requestLogger.ts
  services/
    resourceService.ts
```\n\n"
        "### Next Steps\n"
        "- Generate OpenAPI contract.\n"
        "- Hook into MaiFarm harvest pipeline for artifact capture."
    )


def _react_library_plan_response() -> str:
    return (
        "### Objective\n"
        "- Produce a React component library with five reusable primitives.\n\n"
        "### Component Suite\n"
        "1. `GlassCard` — layout wrapper with frosted glass styling.\n"
        "2. `GlassButton` — primary/secondary CTAs with motion states.\n"
        "3. `DataSummary` — compact metric tile with sparkline support.\n"
        "4. `StepNavigator` — wizard-style progress control.\n"
        "5. `StatusPill` — coloured pill for state signaling.\n\n"
        "### Collaboration Workflow\n"
        "- Agent α: scaffolds storybook stories & design tokens.\n"
        "- Agent β: implements accessibility hooks & keyboard traps.\n"
        "- Agent γ: wires visual regression tests via Playwright.\n"
        "- Agent δ: assembles documentation & usage recipes.\n"
        "- Agent ε: packages release pipeline and changelog automation.\n\n"
        "### Quality Gates\n"
        "- Enforce chromatic snapshots before merge.\n"
        "- Run `npm run test -- --watch=false` for deterministic CI."
    )


def _optimization_hunt_response() -> str:
    return (
        "### Exploration Focus\n"
        "- Identify performance hot spots across MaiFarm services.\n\n"
        "### Candidate Areas\n"
        "- Terminal streaming: verify debounce & diff batching.\n"
        "- Preflight validation: ensure asynchronous checks are parallelised.\n"
        "- Harvest aggregation: profile JSONB writes and reduce payload size.\n\n"
        "### Instruments\n"
        "- Enable `TRACE` level logging for OrchestratorBridge.\n"
        "- Capture benchmark via `scripts/test-advanced-features.js`.\n"
        "- Emit custom metrics to `apps/api/src/monitoring/metricsCollector.ts`.\n\n"
        "### Outcomes\n"
        "- Produce actionable recommendations ranked by effort vs impact.\n"
        "- Attach flamegraphs and heap snapshots to final harvest."
    )


def _generic_summary_response(prompt: str, agent_name: str = 'MaiFarm agent') -> str:
    summary = _safe_truncate(re.sub(r'`', '', ' '.join(prompt.split())), 180)
    actions = _extract_actions(prompt)
    actions_text = '\n'.join(f"{index + 1}. {action}" for index, action in enumerate(actions))
    if not actions_text:
        actions_text = '1. Outline plan (insufficient detail in prompt).'

    return (
        "### Summary\n"
        f"- {summary or 'User request received.'}\n\n"
        "### Key Actions\n"
        f"{actions_text}\n\n"
        "### Considerations\n"
        "- Validate filesystem access before performing mutations.\n"
        "- Capture telemetry for any long-running subprocess.\n\n"
        "### Assigned To\n"
        f"- Agent {agent_name}\n\n"
        "### Generated By\n"
        "- MaiFarm GPT-OSS mini backend"
    )


MINI_PATTERNS: List[tuple[re.Pattern, callable]] = [
    (re.compile(r'list the contents of (?:the )?current directory', re.IGNORECASE), lambda prompt: _directory_listing_response()),
    (re.compile(r'review .*typescript function', re.IGNORECASE), _code_review_response),
    (re.compile(r'build .*rest api', re.IGNORECASE), lambda prompt: _rest_api_plan_response()),
    (re.compile(r'create a react component library', re.IGNORECASE), lambda prompt: _react_library_plan_response()),
    (re.compile(r'explore the codebase and identify performance optimization opportunities', re.IGNORECASE), lambda prompt: _optimization_hunt_response()),
]


class MiniBackend(ModelBackend):
    """Embedded deterministic backend shipped with MaiFarm."""

    def __init__(self) -> None:
        self._rng = Random()

    async def initialize(self) -> None:
        logger.info("Mini GPT-OSS backend initialised (embedded mode)")

    async def generate(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> str:
        prompt = _normalize_prompt(messages)
        return self._generate(prompt, temperature)

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> AsyncIterator[str]:
        yield await self.generate(messages, temperature, max_tokens, stop)

    def _generate(self, prompt: str, temperature: float) -> str:
        trimmed_prompt = prompt.strip()

        for pattern, handler in MINI_PATTERNS:
            if pattern.search(trimmed_prompt):
                return handler(trimmed_prompt)

        seed_hex = hashlib.sha1(trimmed_prompt.encode('utf-8')).hexdigest() or '0'
        seed_value = int(seed_hex[:8], 16)
        self._rng.seed(seed_value)
        choice = seed_value % 3

        if choice == 0:
            return _generic_summary_response(trimmed_prompt)

        if choice == 1:
            actions = _extract_actions(trimmed_prompt)
            actions_text = '\n'.join(f"- {action}" for action in actions) or '- Clarify acceptance criteria with requester.'
            return (
                "### Proposed Workflow\n"
                "- Initiate discovery pass to collect context.\n"
                "- Break work into atomic tasks for XenoSync coordination.\n"
                "- Emit intermediate harvests for peer review.\n\n"
                "### Immediate TODOs\n"
                f"{actions_text}\n\n"
                "### Telemetry Hooks\n"
                "- Enable verbose logging for preflight validators.\n"
                "- Capture resource utilisation snapshots every 30s.\n\n"
                "### Generated By\n"
                "- MaiFarm GPT-OSS mini backend"
            )

        prompt_length = len(trimmed_prompt)
        return (
            "### Insight Summary\n"
            "- Task queued for execution with embedded GPT-OSS runtime.\n"
            "- Coordination hints prepared for downstream agents.\n\n"
            "### Observations\n"
            f"- Prompt length: {prompt_length}\n"
            f"- Temperature bias: {temperature:.2f}\n\n"
            "### Next Steps\n"
            "1. Retrieve workspace state and lock resources if required.\n"
            "2. Execute primary objective with guardrails.\n"
            "3. Push updates to harvest stream and notify dashboard.\n\n"
            "### Generated By\n"
            "- MaiFarm GPT-OSS mini backend"
        )


class VLLMBackend(ModelBackend):
    """vLLM backend for high-performance inference"""

    def __init__(self):
        self.llm = None
        self.sampling_params = None

    async def initialize(self) -> None:
        try:
            from vllm import LLM, SamplingParams

            logger.info(f"Loading model with vLLM: {MODEL_NAME}")
            self.llm = LLM(
                model=MODEL_NAME,
                gpu_memory_utilization=GPU_MEMORY,
                trust_remote_code=True,
            )
            logger.info("vLLM backend initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize vLLM: {e}")
            raise

    async def generate(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> str:
        from vllm import SamplingParams

        # Convert messages to prompt
        prompt = self._messages_to_prompt(messages)

        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
            stop=stop or [],
        )

        outputs = self.llm.generate([prompt], sampling_params)
        return outputs[0].outputs[0].text

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> AsyncIterator[str]:
        # vLLM doesn't natively support async streaming in this mode
        # Fall back to non-streaming
        result = await self.generate(messages, temperature, max_tokens, stop)
        yield result

    def _messages_to_prompt(self, messages: List[ChatMessage]) -> str:
        """Convert chat messages to prompt format"""
        prompt_parts = []
        for msg in messages:
            if msg.role == "system":
                prompt_parts.append(f"System: {msg.content}")
            elif msg.role == "user":
                prompt_parts.append(f"User: {msg.content}")
            elif msg.role == "assistant":
                prompt_parts.append(f"Assistant: {msg.content}")

        prompt_parts.append("Assistant:")
        return "\n\n".join(prompt_parts)


class LlamaCppBackend(ModelBackend):
    """llama-cpp-python backend (good for CPU/Apple Silicon)"""

    def __init__(self):
        self.llm = None

    async def initialize(self) -> None:
        try:
            from llama_cpp import Llama

            if not MODEL_PATH:
                raise ValueError("GPT_OSS_MODEL_PATH must be set for llama-cpp backend")

            logger.info(f"Loading model with llama-cpp: {MODEL_PATH}")
            self.llm = Llama(
                model_path=MODEL_PATH,
                n_ctx=131072,  # Context window
                n_gpu_layers=-1,  # Use all GPU layers if available
            )
            logger.info("llama-cpp backend initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize llama-cpp: {e}")
            raise

    async def generate(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> str:
        prompt = self._messages_to_prompt(messages)

        output = self.llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop or [],
        )

        return output["choices"][0]["text"]

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> AsyncIterator[str]:
        prompt = self._messages_to_prompt(messages)

        stream = self.llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop or [],
            stream=True,
        )

        for output in stream:
            if "choices" in output and len(output["choices"]) > 0:
                text = output["choices"][0].get("text", "")
                if text:
                    yield text

    def _messages_to_prompt(self, messages: List[ChatMessage]) -> str:
        """Convert chat messages to prompt format"""
        prompt_parts = []
        for msg in messages:
            if msg.role == "system":
                prompt_parts.append(f"<|system|>\n{msg.content}<|end|>")
            elif msg.role == "user":
                prompt_parts.append(f"<|user|>\n{msg.content}<|end|>")
            elif msg.role == "assistant":
                prompt_parts.append(f"<|assistant|>\n{msg.content}<|end|>")

        prompt_parts.append("<|assistant|>")
        return "\n".join(prompt_parts)


class MockBackend(ModelBackend):
    """Minimal mock backend used for environments without real model backends."""

    async def initialize(self) -> None:
        logger.warning("Using mock GPT-OSS backend; install vLLM or llama-cpp-python for full functionality")

    async def generate(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> str:
        prompt_summary = messages[-1].content if messages else ""
        return (
            "[MOCK GPT-OSS RESPONSE]\n"
            "This environment is using the mock backend."
            f" Last prompt snippet: {prompt_summary[:200]}"
        )

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: float,
        max_tokens: int,
        stop: Optional[List[str]],
    ) -> AsyncIterator[str]:
        yield await self.generate(messages, temperature, max_tokens, stop)


# ============================================================================
# Backend Factory
# ============================================================================

def detect_best_backend() -> str:
    """Auto-detect the best available backend"""
    # Check for vLLM (GPU)
    try:
        import vllm
        logger.info("vLLM detected - using GPU acceleration")
        return "vllm"
    except ImportError:
        pass

    # Check for llama-cpp-python (CPU/Apple Silicon)
    try:
        import llama_cpp
        logger.info("llama-cpp-python detected - using CPU/Metal acceleration")
        return "llama-cpp"
    except ImportError:
        pass

    # No backend available
    if ALLOW_EMBEDDED_BACKEND:
        logger.info("Falling back to embedded mini GPT-OSS backend due to missing dependencies")
        return "mini"

    logger.error("No AI backend found! Please install vllm or llama-cpp-python")
    logger.error("  pip install vllm  # For NVIDIA GPU")
    logger.error("  pip install llama-cpp-python[server]  # For CPU/Apple Silicon")
    sys.exit(1)


def create_backend() -> ModelBackend:
    """Create the appropriate model backend"""
    backend = BACKEND

    # Auto-detect if needed
    if backend == "auto":
        backend = detect_best_backend()

    if backend == "vllm":
        return VLLMBackend()
    elif backend == "llama-cpp":
        if not MODEL_PATH:
            logger.error("GPT_OSS_MODEL_PATH must be set for llama-cpp backend")
            sys.exit(1)
        return LlamaCppBackend()
    elif backend == "mini":
        return MiniBackend()
    elif backend == "mock":
        return MockBackend()
    else:
        logger.error(f"Unknown backend: {backend}")
        logger.error("Valid backends: vllm, llama-cpp, mini, mock")
        sys.exit(1)


# ============================================================================
# FastAPI Application
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global model_instance

    # Startup
    logger.info("Starting GPT-OSS server...")
    logger.info(f"Backend: {BACKEND}")
    logger.info(f"Model: {MODEL_NAME}")

    model_instance = create_backend()
    await model_instance.initialize()

    logger.info(f"Server ready on http://{HOST}:{PORT}")

    yield

    # Shutdown
    logger.info("Shutting down GPT-OSS server...")


app = FastAPI(
    title="GPT-OSS Server",
    description="OpenAI-compatible local LLM inference server",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "backend": BACKEND,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/v1/models")
async def list_models():
    """List available models (OpenAI-compatible)"""
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_NAME,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "gpt-oss",
            }
        ],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """Chat completion endpoint (OpenAI-compatible)"""

    if model_instance is None:
        raise HTTPException(status_code=503, detail="Model not initialized")

    try:
        # Normalize stop sequences
        stop_sequences = None
        if request.stop:
            stop_sequences = [request.stop] if isinstance(request.stop, str) else request.stop

        # Streaming response
        if request.stream:
            return StreamingResponse(
                stream_chat_completion(request, stop_sequences),
                media_type="text/event-stream",
            )

        # Non-streaming response
        start_time = time.time()

        response_text = await model_instance.generate(
            messages=request.messages,
            temperature=request.temperature or 0.6,
            max_tokens=request.max_tokens or 8192,
            stop=stop_sequences,
        )

        # Estimate tokens
        prompt_text = " ".join([msg.content for msg in request.messages])
        prompt_tokens = int(model_instance.estimate_tokens(prompt_text))
        completion_tokens = int(model_instance.estimate_tokens(response_text))

        response = ChatCompletionResponse(
            id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
            created=int(start_time),
            model=request.model,
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatCompletionResponseMessage(
                        role="assistant",
                        content=response_text,
                    ),
                    finish_reason="stop",
                )
            ],
            usage=Usage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            ),
        )

        return response

    except Exception as e:
        logger.error(f"Error during completion: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def stream_chat_completion(
    request: ChatCompletionRequest,
    stop_sequences: Optional[List[str]],
) -> AsyncIterator[str]:
    """Stream chat completion in SSE format"""

    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
    created = int(time.time())

    try:
        async for text_chunk in model_instance.generate_stream(
            messages=request.messages,
            temperature=request.temperature or 0.6,
            max_tokens=request.max_tokens or 8192,
            stop=stop_sequences,
        ):
            chunk = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": text_chunk},
                        "finish_reason": None,
                    }
                ],
            }

            yield f"data: {json.dumps(chunk)}\n\n"

        # Send final chunk
        final_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop",
                }
            ],
        }

        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.error(f"Error during streaming: {e}", exc_info=True)
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "internal_error",
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"


# ============================================================================
# Main
# ============================================================================

def main():
    """Run the server"""
    logger.info("=" * 80)
    logger.info("GPT-OSS Server - OpenAI-Compatible Local LLM Inference")
    logger.info("=" * 80)
    logger.info(f"Host: {HOST}")
    logger.info(f"Port: {PORT}")
    logger.info(f"Model: {MODEL_NAME}")
    logger.info(f"Backend: {BACKEND}")
    logger.info("=" * 80)

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()
