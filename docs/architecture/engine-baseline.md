# MaiFarm Engine Baseline and Capability Matrix

## 1. Claude Code (Current Production Baseline)

This section reflects how the MaiFarm backend currently works when talking to Claude Code. The goal for additional engines is to match or intentionally extend this behaviour without breaking the existing UX.

### 1.1 Message Schema
- `POST /v1/messages` payload assembled in `apps/api/src/services/unified/aiProviderService.ts:472`.
- System prompt (when present) is inserted as the first message with `role:"system"` and raw text content.
- User prompt is always sent as a single `role:"user"` message containing the concatenated plain-text prompt.
- No per-part segmentation, media attachments, or tool-call descriptors are currently sent.

### 1.2 Streaming Protocol
- Primary chat streaming endpoint `/api/chat/stream` (see `apps/api/src/api/chat.ts:17-97`).
- The response is `text/event-stream` but the body is emitted as raw text chunks (no JSON envelopes, no SSE `data:` frames).
- The dashboard client (`apps/dashboard/src/services/aiChatService.ts:87-155`) simply concatenates chunks. Any replacement engine must preserve this byte-for-byte contract unless we later rev the frontend.
- The orchestrator proxy (`apps/api/src/services/aiProxy.ts`) also emits raw token strings in `streamRequest`, currently simulated for Claude.

### 1.3 Tool / Function Calling
- No live tool calls are issued against Claude in production code today. Payload assembly has no `tools` or `tool_choice` fields; tool execution is inferred heuristically from transcript text (see `activityParser.ts`).
- Any future tool integration must therefore keep the default behaviour (no tool section) unless a request explicitly specifies tools.

### 1.4 JSON / Structured Output
- The baseline simply expects free-form text responses. Structured JSON modes are not enforced today.
- Downstream consumers rely on plain text and do not attempt schema validation.

### 1.5 Error Semantics
- Errors bubble up through `ProviderError` (`apps/api/src/services/unified/aiProviderService.ts:708`).
- Claude-specific errors are not normalised; whatever Axios throws is wrapped with message `Provider request failed: <axios message>`.
- Frontend displays generic failure messages and retries via orchestrator. We must preserve human-readable messages and retryability flags.

### 1.6 Timeouts, Retries, Limits
- Axios client is initialised with `timeout: 60000` (60s) (`initializeProviderClients`).
- No explicit retry/backoff for Claude today; higher level orchestrator sometimes retries manually.
- Default `max_tokens` is `config.maxTokens` (4096). Context window is tracked but not programmatically enforced except by trimming prompts upstream.
- Rate limiting and circuit-breaking are not active for Claude.

## 2. Capability Matrix (Target Engines)

| Engine Key | Provider | Native Tool Support | JSON / Structured Output | Streaming Support | Max Context (tokens) | Default Max Completion | Vision | Notes & Constraints |
|------------|----------|---------------------|--------------------------|-------------------|----------------------|------------------------|--------|--------------------|
| `claude-code` | Anthropic Claude 3.5 Code | Yes (Claude tool use) but unused today | Partial (requires `response_format`) | SSE/Stream supported | 200k | 4k default (configurable to 8k) | Yes | Baseline. Anthropics' API requires `anthropic-version` header, rate limits 50 req/min per key by default. |
| `openai` | OpenAI Responses API (`gpt-4.1`, `o4-mini`, etc.) | Yes (`tools` array with JSON schema) | Native `response_format` json_schema | Streaming via SSE delta | 128k for 4.1 | 4k default, extend to 16k | Yes | Paid API, per-token billing; strict rate limits; expects `Authorization: Bearer`. |
| `gpt-oss` | vLLM / llama.cpp served OSS model (e.g. Llama 3.1 70B Instruct) | None (requires emulation) | Requires prompt+stop enforced | Server sent tokens via chunked HTTP/SSE depending on serving stack | Model dependent (70B ~ 128k with vLLM) | 4k–8k typical | No | Self-hosted; need deterministic JSON/function emulation; ensure license recorded. |
| `qwen` | Qwen 2.5 via vLLM/Ollama or DashScope | Partial (native function-calling in DashScope; absent in Ollama) | Supports JSON output via parameters; may require emulation when local | Streaming SSE | 128k (vLLM) / 32k (DashScope) | 4k default | Optional (depends on model) | Local deployments may need logprobs disabled; ensure Chinese prompts sanitised. |

### 2.1 Additional Capability Flags
- `supports_tools`: {Claude: native, OpenAI: native, GPT-OSS: emulated JSON, Qwen: native-or-emulated}
- `supports_json_mode`: {Claude: yes via `response_format`, OpenAI: yes, GPT-OSS: via constrained prompt, Qwen: yes (DashScope JSON mode) / emulated locally}
- `supports_streaming`: all target engines must stream tokens; local servers might require SSE translation.
- `supports_token_counting`: Claude/OpenAI provide APIs; OSS engines require tokenizer libs (tiktoken, sentencepiece).

## 3. Open Questions / Risks
- Frontend currently treats streams as raw text; if we add tool deltas or JSON frames, the transport must remain backwards compatible.
- Tool invocation pathways are mostly mock logic today; enabling real tools may require downstream consumers to distinguish between assistant text and tool directives.
- Error normalisation is minimal; without a standard schema the UI may leak provider-specific details.

This baseline and matrix will drive the unified EngineAdapter design so that new adapters can expose capability flags while preserving current Claude behaviours as the reference implementation.
