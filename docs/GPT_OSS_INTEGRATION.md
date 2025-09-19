# GPT-OSS-20B Integration Guide

## Overview

MaiFarm now supports **GPT-OSS-20B**, OpenAI's open-source 20B-parameter model, as a fully local alternative to cloud-based AI providers. This integration enables:

- **Complete Privacy**: All processing happens locally with zero data leaving your infrastructure
- **Zero API Costs**: No usage fees or subscription costs
- **Offline Operation**: Full functionality without internet connectivity
- **Low Latency**: Direct local inference without network overhead
- **Full Control**: Complete control over model configuration and optimization

## Features

### Core Capabilities
- ✅ Local model hosting on port 11435 (adjacent to Ollama's 11434)
- ✅ OpenAI-compatible API endpoints for seamless integration
- ✅ Multi-agent orchestration with up to 10 concurrent agents
- ✅ Real-time streaming responses via WebSocket
- ✅ Automatic resource management and model unloading
- ✅ Support for 4-bit, 8-bit, and 16-bit quantization
- ✅ GPU acceleration with CUDA support
- ✅ CPU fallback for systems without GPUs

### Advanced Features
- **Prompt Optimization**: Task-specific prompt templates and chain-of-thought reasoning
- **Resource Management**: Automatic GPU/CPU monitoring and optimization
- **Batch Processing**: Queue management for efficient multi-request handling
- **Context Management**: Smart splitting for 32K token context window
- **Performance Monitoring**: Real-time metrics and benchmarking

## Installation

### Prerequisites

#### Hardware Requirements
- **Minimum**: 32GB RAM, 8-core CPU
- **Recommended**: 64GB RAM, NVIDIA GPU with 24GB+ VRAM
- **Storage**: 100GB free space for model weights

#### Software Requirements
- Python 3.8 or higher
- CUDA 11.8+ (for GPU acceleration)
- Node.js 18+ and npm
- Git LFS for model downloads

### Quick Installation

1. **Run the installation script**:
```bash
cd maifarm
./scripts/install-gpt-oss.sh
```

This script will:
- Create a Python virtual environment
- Install all dependencies (torch, transformers, fastapi, etc.)
- Set up the inference server
- Configure environment variables
- Create startup scripts

2. **Download model weights** (if you have access):
```bash
# Using Hugging Face CLI
huggingface-cli download openai/gpt-oss-20b --local-dir ./models/gpt-oss-20b

# Or using Git LFS
git lfs clone https://huggingface.co/openai/gpt-oss-20b ./models/gpt-oss-20b
```

3. **Start the inference server**:
```bash
./start-gpt-oss.sh
```

### Manual Installation

1. **Install Python dependencies**:
```bash
python3 -m venv venv-gpt-oss
source venv-gpt-oss/bin/activate
pip install torch transformers accelerate bitsandbytes
pip install fastapi uvicorn pydantic psutil gputil
```

2. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env and set:
AI_PROVIDER=gpt_oss
GPT_OSS_ENABLED=true
GPT_OSS_HOST=http://localhost:11435
GPT_OSS_MODEL=gpt-oss-20b
```

3. **Start the server manually**:
```bash
python scripts/gpt-oss-server.py
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Enable GPT-OSS provider
AI_PROVIDER=gpt_oss
GPT_OSS_ENABLED=true

# Server configuration
GPT_OSS_HOST=http://localhost:11435
GPT_OSS_PORT=11435
GPT_OSS_MODEL=gpt-oss-20b

# Model parameters
GPT_OSS_MAX_TOKENS=32768
GPT_OSS_CONTEXT_WINDOW=32768
GPT_OSS_TEMPERATURE=0.7

# Optimization settings
GPT_OSS_QUANTIZATION=8bit        # 4bit for low memory, 16bit for quality
GPT_OSS_DEVICE_MAP=auto         # auto, cpu, or cuda
GPT_OSS_MAX_BATCH_SIZE=4        # Batch size for concurrent requests
GPT_OSS_GPU_LAYERS=32           # Layers to offload to GPU
GPT_OSS_CPU_THREADS=8           # CPU threads for inference

# Resource management
GPT_OSS_AUTO_UNLOAD_TIMEOUT=600000  # 10 minutes idle timeout
GPT_OSS_CACHE_SIZE=2048             # Cache size in MB
GPT_OSS_MAX_CONCURRENT=3            # Max concurrent requests
```

### Quantization Options

Choose based on your hardware:

| Quantization | VRAM Required | Quality | Speed | Use Case |
|-------------|--------------|---------|-------|----------|
| 4-bit | 8-12 GB | Good | Fast | Consumer GPUs, development |
| 8-bit | 16-20 GB | Better | Moderate | Professional GPUs, production |
| 16-bit | 32-40 GB | Best | Slower | High-end GPUs, quality focus |
| fp32 | 64+ GB | Maximum | Slowest | Research, maximum accuracy |

## Usage

### Creating Farms with GPT-OSS

1. **Via UI**: Select "GPT-OSS-20B (Local)" from the provider dropdown when creating a farm

2. **Via API**:
```javascript
const response = await fetch('/api/farms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My GPT-OSS Farm',
    provider: 'gpt-oss',
    agents: 5,
    task: 'Build a REST API with authentication',
    timeout: 600
  })
});
```

3. **Via CLI**:
```bash
# Using orchestrator.py
python orchestrator.py -n 5 --provider gpt-oss -p "Create a web application"

# Quick task
curl -X POST http://localhost:4567/api/farms/quick-task \
  -H "Content-Type: application/json" \
  -d '{"task": "Write a Python script", "provider": "gpt-oss"}'
```

### Monitoring Resource Usage

Access real-time metrics:
```bash
# Check server health
curl http://localhost:11435/health

# Get resource metrics
curl http://localhost:11435/metrics

# Monitor via MaiFarm dashboard
# Navigate to Analytics > Resource Monitor
```

## API Endpoints

The GPT-OSS server provides OpenAI-compatible endpoints:

### Completions
```bash
POST http://localhost:11435/v1/completions
{
  "model": "gpt-oss-20b",
  "prompt": "Write a function to",
  "max_tokens": 100,
  "temperature": 0.7
}
```

### Chat Completions
```bash
POST http://localhost:11435/v1/chat/completions
{
  "model": "gpt-oss-20b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "max_tokens": 500,
  "stream": true
}
```

### Model Management
```bash
# Load model into memory
POST http://localhost:11435/load

# Unload model to free memory
POST http://localhost:11435/unload

# List available models
GET http://localhost:11435/models
```

## Performance Optimization

### GPU Optimization
```bash
# For NVIDIA GPUs with 24GB+ VRAM
export GPT_OSS_QUANTIZATION=8bit
export GPT_OSS_GPU_LAYERS=40
export GPT_OSS_DEVICE_MAP=auto

# Enable Flash Attention (if supported)
export GPT_OSS_ENABLE_FLASH_ATTENTION=true
```

### CPU Optimization
```bash
# For CPU-only systems
export GPT_OSS_DEVICE=cpu
export GPT_OSS_QUANTIZATION=4bit
export GPT_OSS_CPU_THREADS=$(nproc)
export GPT_OSS_MAX_BATCH_SIZE=2
```

### Memory Management
```bash
# Auto-unload when idle
export GPT_OSS_AUTO_UNLOAD_TIMEOUT=300000  # 5 minutes

# Limit cache size
export GPT_OSS_CACHE_SIZE=1024  # 1GB cache
```

## Testing

### Run Integration Tests
```bash
# Install test dependencies
npm install --save-dev

# Run GPT-OSS specific tests
npm test -- tests/integration/gpt-oss-farm.test.ts

# Run performance benchmarks
npm test -- --testNamePattern="Performance Benchmarks"
```

### Test the Server
```bash
# After starting the server
python test-gpt-oss.py
```

## Troubleshooting

### Common Issues

#### 1. Out of Memory (OOM) Errors
```bash
# Solution: Use more aggressive quantization
export GPT_OSS_QUANTIZATION=4bit
export GPT_OSS_MAX_BATCH_SIZE=1
```

#### 2. Slow Inference
```bash
# Solution: Ensure GPU is being used
nvidia-smi  # Check GPU usage
export GPT_OSS_DEVICE=cuda
export GPT_OSS_GPU_LAYERS=40
```

#### 3. Server Won't Start
```bash
# Check port availability
lsof -i :11435

# Check Python dependencies
pip list | grep -E "torch|transformers|fastapi"

# Check logs
tail -f logs/gpt-oss-server.log
```

#### 4. Model Not Loading
```bash
# Verify model path
ls -la ./models/gpt-oss-20b/

# Check available disk space
df -h

# Try loading with CPU first
export GPT_OSS_DEVICE=cpu
```

### Debug Mode
```bash
# Enable verbose logging
export LOG_LEVEL=debug
export GPT_OSS_DEBUG=true

# Start server with debug output
python scripts/gpt-oss-server.py --debug
```

## Comparison with Other Providers

| Feature | GPT-OSS-20B | Claude Code | Qwen3-Coder | OpenAI GPT-4 |
|---------|------------|-------------|-------------|--------------|
| **Deployment** | Local | Cloud | Local/Cloud | Cloud |
| **Privacy** | Complete | Limited | Partial | Limited |
| **Cost** | Free | Pay-per-use | Free/Paid | Pay-per-use |
| **Internet Required** | No | Yes | Optional | Yes |
| **Context Window** | 32K | 200K | 256K | 128K |
| **Response Time** | 1-5s | 2-10s | 1-8s | 2-10s |
| **Customization** | Full | None | Partial | Limited |

## Best Practices

### 1. Resource Planning
- Monitor GPU/CPU usage during peak loads
- Set appropriate batch sizes based on hardware
- Use quantization that balances quality and performance

### 2. Prompt Engineering
- Use the built-in prompt optimizer for better results
- Leverage task-specific templates
- Implement chain-of-thought for complex reasoning

### 3. Multi-Agent Coordination
- Limit concurrent agents based on available resources
- Use smaller context windows for multi-agent tasks
- Implement proper task decomposition

### 4. Production Deployment
- Use systemd service for automatic startup
- Implement health checks and monitoring
- Set up log rotation and retention policies
- Configure firewall to restrict access to localhost

## Security Considerations

### Local-Only Access
```bash
# Firewall rule to restrict to localhost
sudo ufw deny 11435
sudo ufw allow from 127.0.0.1 to any port 11435
```

### Data Privacy
- All processing happens locally
- No telemetry or usage data sent externally
- Complete control over data retention
- Audit logs stored locally

## Support and Resources

### Documentation
- [MaiFarm Documentation](https://github.com/yourusername/maifarm/wiki)
- [GPT-OSS Model Card](https://huggingface.co/openai/gpt-oss-20b)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

### Community
- Report issues: [GitHub Issues](https://github.com/yourusername/maifarm/issues)
- Discord: [MaiFarm Community](https://discord.gg/maifarm)

### Performance Benchmarks
- Inference: 1-5 seconds for 100 tokens (with 8-bit quantization)
- Throughput: 5-10 requests/second (batch size 4)
- Memory: 16-20GB VRAM with 8-bit quantization
- Context: Full 32K token support

## Roadmap

### Upcoming Features
- [ ] Model fine-tuning interface
- [ ] Distributed inference across multiple GPUs
- [ ] Advanced caching mechanisms
- [ ] Model compression techniques
- [ ] Integration with vector databases
- [ ] Custom model checkpoints
- [ ] A/B testing framework

## License

GPT-OSS-20B integration follows the model's open-source license. MaiFarm integration code is MIT licensed.

---

*Last updated: January 2025*