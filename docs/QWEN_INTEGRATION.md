# Qwen3-Coder Integration Guide

## Overview

MaiFarm now supports **Qwen3-Coder 480B**, Alibaba's state-of-the-art Mixture-of-Experts coding model, as an alternative to Claude Code for AI agent orchestration. Qwen3-Coder offers:

- **480B total parameters** with 35B active parameters
- **256K context window** (extendable to 1M tokens)
- **Free API access** via DashScope
- **Local deployment** via Ollama
- Performance comparable to Claude Sonnet 4

## Quick Start

### Option 1: Using Qwen API (Recommended for 480B model)

1. **Configure environment**:
   ```bash
   export AI_PROVIDER=qwen
   ```
   Provide your DashScope credentials directly to the proxy or service layer you manage; MaiFarm no longer reads dedicated Qwen API keys from the environment.

2. **Start the LLM proxy server**:
   ```bash
   npm run proxy:start
   # or
   ./scripts/start-llm-proxy.sh
   ```

3. **Create a farm with Qwen**:
   - Go to the MaiFarm dashboard
   - Click "Create Farm"
   - Select "Qwen3-Coder" as the AI Engine
   - Configure your agents and start

### Option 2: Using Local Qwen Model (via Ollama)

1. **Install Ollama** from [ollama.ai](https://ollama.ai)

2. **Pull a Qwen model**:
   ```bash
   # For 7B model (runs on most hardware)
   ollama pull qwen2.5-coder:7b
   
   # For 32B model (requires more RAM)
   ollama pull qwen2.5-coder:32b
   ```

3. **Configure environment**:
   ```bash
   export AI_PROVIDER=qwen
   export QWEN_USE_LOCAL=true
   export OLLAMA_MODEL=qwen2.5-coder:7b
   ```

4. **Start Ollama** (if not already running):
   ```bash
   ollama serve
   ```

5. **Create farms** as usual - MaiFarm will automatically use the local model

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | Set to `qwen` to use Qwen | `claude` |
| `QWEN_MODEL` | Model to use | `qwen-coder-480b` |
| `QWEN_USE_LOCAL` | Use local Ollama model | `false` |
| `OLLAMA_MODEL` | Local model name | `qwen2.5-coder:7b` |
| `USE_LLM_PROXY` | Enable LLM proxy | `false` |
| `LLM_PROXY_URL` | Proxy server URL | `http://localhost:8001` |

### Model Options

#### API Models (via DashScope)
- `qwen-coder-480b` - Full 480B MoE model (recommended)
- `qwen-max` - General-purpose model
- `qwen-plus` - Balanced model
- `qwen-turbo` - Fast, lightweight model

#### Local Models (via Ollama)
- `qwen2.5-coder:7b` - Smallest, fastest (8GB RAM)
- `qwen2.5-coder:14b` - Balanced (16GB RAM)
- `qwen2.5-coder:32b` - Most capable local (32GB RAM)

## Using Multi-Agent Qwen Orchestration

### Command Line

```bash
# Launch 5 Qwen agents for a task
python multi_qwen.py -n 5 -p "Refactor the authentication system" --api

# Use local model for cost-free operation
python multi_qwen.py -n 3 -p "Fix TypeScript errors" --local

# Use proxy for unified interface
python multi_qwen.py -n 4 --prompt-file task.yaml --proxy
```

### Programmatic Usage

```typescript
// server/services/farmService.ts
const farm = await farmService.createFarm({
  name: "Qwen-Powered Farm",
  description: "Using Qwen3-Coder for development",
  provider: "qwen",  // <-- Specify Qwen as provider
  config: {
    maxAgents: 5,
    timeout: 300000,
    collaborative: true
  }
});
```

## Feature Comparison

| Feature | Claude Code | Qwen3-Coder |
|---------|------------|-------------|
| **Context Window** | 200K | 256K-1M |
| **API Cost** | Paid | Free |
| **Local Deployment** | No | Yes (via Ollama) |
| **Multi-Agent Support** | Full | Full |
| **Code Generation** | Excellent | Excellent |
| **Languages Supported** | All major | All major + more |
| **Response Speed** | Fast | Fast (varies by deployment) |
| **Offline Mode** | No | Yes (local models) |

## Best Practices

### When to Use Qwen3-Coder

✅ **Ideal for:**
- Long-context tasks (>200K tokens)
- Cost-sensitive projects (free API)
- Offline/air-gapped environments (local models)
- Multi-language projects
- Large-scale refactoring

### When to Use Claude Code

✅ **Ideal for:**
- Mission-critical production code
- Complex architectural decisions
- When you need proven reliability
- Tasks requiring nuanced understanding

## Troubleshooting

### Common Issues

#### 1. "Local model not found"
```bash
# Install the model first
ollama pull qwen2.5-coder:7b

# Verify it's installed
ollama list | grep qwen
```

#### 2. "LLM Proxy not reachable"
```bash
# Start the proxy server
./scripts/start-llm-proxy.sh

# Check if it's running
curl http://localhost:8001/providers
```

#### 4. "Context length exceeded"
- For tasks >256K tokens, break them into smaller chunks
- Use the `bundle-steps` option for better task distribution
- Consider using collaborative mode for large projects

### Performance Optimization

1. **For API usage:**
   - Use the LLM proxy to batch requests
   - Enable caching in the proxy configuration
   - Set appropriate `max_tokens` limits

2. **For local models:**
   - Use GPU acceleration if available
   - Choose model size based on available RAM
   - Enable model quantization for faster inference

3. **For multi-agent farms:**
   - Use collaborative mode for complex tasks
   - Stagger agent launches to avoid overload
   - Monitor resource usage with `htop` or Activity Monitor

## API Integration

### Using the Proxy Server

The LLM proxy provides a unified interface for all providers:

```python
# Start the proxy
python llm_proxy.py --proxy --port 8001

# Use it in your code
import requests

response = requests.post(
    "http://localhost:8001/chat/completions",
    json={
        "model": "qwen/qwen-coder-480b",
        "messages": [
            {"role": "user", "content": "Write a Python function"}
        ]
    }
)
```

### Direct API Usage

```python
import requests

headers = {
    "Authorization": "Bearer <your dashscope token>",
    "Content-Type": "application/json"
}

response = requests.post(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    headers=headers,
    json={
        "model": "qwen-coder-480b",
        "input": {"messages": messages},
        "parameters": {
            "result_format": "message",
            "temperature": 0.7,
            "max_tokens": 4096
        }
    }
)
```

## Advanced Configuration

### Custom Model Parameters

Edit `.env.development`:

```bash
# Fine-tune Qwen behavior
QWEN_TEMPERATURE=0.8        # Higher = more creative
QWEN_MAX_TOKENS=8192        # Maximum response length
QWEN_TOP_P=0.95            # Nucleus sampling
QWEN_TOP_K=50              # Top-K sampling
QWEN_STOP_SEQUENCES=["```"] # Stop generation at these sequences
```

### Multi-Provider Setup

Run both Claude and Qwen farms simultaneously:

```bash
# Terminal 1: Claude farm
AI_PROVIDER=claude python orchestrator.py -n 3 -p "Frontend tasks"

# Terminal 2: Qwen farm
AI_PROVIDER=qwen python multi_qwen.py -n 3 -p "Backend tasks"
```

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Local Models**: Be aware of model file sizes (7B = ~4GB, 32B = ~20GB)
3. **Network**: The LLM proxy binds to `0.0.0.0` by default - restrict in production
4. **Rate Limiting**: Qwen API has rate limits - implement backoff strategies

## Support and Resources

- **Qwen Documentation**: [DashScope Docs](https://dashscope.aliyun.com/docs)
- **Model Details**: [Qwen GitHub](https://github.com/QwenLM/Qwen)
- **MaiFarm Issues**: [GitHub Issues](https://github.com/yourusername/maifarm/issues)
- **Community**: Join our Discord for Qwen-specific discussions

## Conclusion

Qwen3-Coder integration brings powerful, cost-effective AI capabilities to MaiFarm. Whether you choose the free API for the full 480B model or run smaller models locally, you can now leverage state-of-the-art AI for your development workflows without breaking the bank.
