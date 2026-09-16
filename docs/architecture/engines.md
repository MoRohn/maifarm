# MaiFarm Engine Operations Guide

This guide explains how MaiFarm ships with production-ready engine profiles and how to validate that each AI engine is ready before launch.

## 1. Preloaded Engine Profiles

MaiFarm includes a default `config/engines.yaml` that defines four engines:

| Key         | Provider   | Model (default)                     | Local/Remote | Notes |
|-------------|------------|--------------------------------------|--------------|-------|
| claude-code | Anthropic  | claude-3-5-sonnet-20241022          | Remote       | Requires `ANTHROPIC_API_KEY`. |
| openai      | OpenAI     | gpt-4.1-mini                        | Remote       | Requires `OPENAI_API_KEY` (and optional `OPENAI_ORG_ID`). |
| gpt-oss     | vLLM       | meta-llama/Meta-Llama-3.1-70B-Instruct | Local        | Expects vLLM server at `http://localhost:8000/v1`. |
| qwen        | vLLM       | qwen2.5-72b-instruct                | Local        | Expects vLLM server at `http://localhost:8001/v1`. |

Each entry lists alternative models so operators can swap models without code changes. Local engines require the model weights to be installed in the vLLM runtime.

## 2. Setup Wizard Diagnostics (API)

`EngineSetupWizard` (see `apps/api/src/services/engineSetupWizard.ts`) provides runtime diagnostics that:

- Verify API keys for paid providers are present.
- Ping configured base URLs for local engines (`GET /models`).
- Check that the default model is available and suggest installation commands if not.
- Surface warnings for outdated versions or unreachable endpoints.

Run the wizard in a Node REPL or attach it to an admin route:

```ts
import { engineSetupWizard } from '@/services/engineSetupWizard';

const report = await engineSetupWizard.runDiagnostics();
console.log(report.status, report.items);
```

## 3. Local Engine Best Practices

1. **Install vLLM** for local models and expose OpenAI-compatible endpoints:
   ```bash
   pip install vllm
   python -m vllm.entrypoints.openai.api_server \
     --host 0.0.0.0 --port 8000 \
     --model meta-llama/Meta-Llama-3.1-70B-Instruct
   ```
2. Repeat for Qwen on port `8001` using the desired model path.
3. Update `engines.yaml` if your host/port differ.
4. Restart MaiFarm (or hot-reload config) so the engine runtime refreshes settings.

## 4. Upgrading Models Safely

- Add the new model to the `models` array under the engine key and set `default: true` when ready.
- Use the wizard to confirm availability before pointing production traffic at the new model.
- Keep the old model in the list to support rollbacks and the fallback chain.

## 5. Observability

Engine metrics (latency, tokens, cost, circuit state) are tracked by `EngineRuntime`. Expose them via your Prometheus exporter or log sink to monitor readiness after upgrades.

This setup keeps MaiFarm deploy-ready for both managed APIs and self-hosted inference with minimal operator steps.
