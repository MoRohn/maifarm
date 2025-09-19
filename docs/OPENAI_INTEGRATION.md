# OpenAI GPT-4 Integration Guide for MaiFarm

## Overview
MaiFarm now supports OpenAI GPT-4 as an alternative to Claude Code for AI agent orchestration. This integration provides access to GPT-4, GPT-4 Turbo, and GPT-4o models with support for both standard OpenAI API and Azure OpenAI Service.

## Features
- ✅ Full OpenAI GPT-4 model family support (GPT-4, GPT-4 Turbo, GPT-4o)
- ✅ Azure OpenAI Service compatibility
- ✅ Large context windows (up to 128K tokens for GPT-4 Turbo)
- ✅ Automatic model validation and selection
- ✅ LLM proxy integration for enhanced capabilities
- ✅ Cost tracking and budget controls
- ✅ Rate limiting and retry logic
- ✅ Privacy and security features

## Configuration

### Step 1: Obtain API Key

#### Option A: OpenAI Platform
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

#### Option B: Azure OpenAI Service
1. Visit https://portal.azure.com
2. Create an Azure OpenAI resource
3. Get your endpoint and API key from the resource

### Step 2: Configure Environment Variables

Add the following to your `.env.development` or `.env.production` file:

```bash
# Basic OpenAI Configuration
OPENAI_ENABLED=true
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_API_ENDPOINT=https://api.openai.com/v1
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4096
OPENAI_TEMPERATURE=0.7
OPENAI_ORG_ID=org-your-org-id  # Optional

# For Azure OpenAI Service
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-azure-key
AZURE_API_VERSION=2024-02-15-preview
AZURE_DEPLOYMENT_NAME=your-deployment-name

# Advanced Configuration
OPENAI_MAX_CONTEXT=128000
OPENAI_RPM=60                  # Requests per minute
OPENAI_TPM=90000               # Tokens per minute
OPENAI_CONCURRENT=10           # Max concurrent requests
OPENAI_DAILY_BUDGET=100        # Daily spend limit in USD
OPENAI_MONTHLY_BUDGET=2000     # Monthly spend limit in USD

# LLM Proxy (for enhanced integration)
USE_LLM_PROXY=true
LLM_PROXY_URL=http://localhost:8001
```

### Step 3: Test Connection

Run the connectivity test script:

```bash
npm run test:openai
# or
node scripts/test-openai-connection.js
```

This will verify:
- API key validity
- Model availability
- Chat completion functionality
- Token limits and capabilities

## API Endpoints

### Provider Status
```http
GET /api/openai/status
```
Returns the current OpenAI configuration and availability status.

### Validate Connection
```http
POST /api/openai/validate
{
  "apiKey": "sk-...",
  "model": "gpt-4-turbo-preview"
}
```
Validates OpenAI API connectivity and returns available models.

### Test API
```http
POST /api/openai/test
```
Tests the OpenAI API with a simple request.

### Get Available Models
```http
GET /api/openai/models
```
Returns a list of available GPT models.

### Configure Provider
```http
POST /api/openai/configure
{
  "apiKey": "sk-...",
  "model": "gpt-4-turbo-preview",
  "maxTokens": 8192,
  "temperature": 0.7
}
```
Updates OpenAI configuration dynamically.

## Using OpenAI in Farms

### Creating a Farm with OpenAI

1. **Via API:**
```javascript
POST /api/farms
{
  "name": "My OpenAI Farm",
  "provider": "openai",
  "model": "gpt-4-turbo-preview",
  "agentCount": 3,
  "config": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

2. **Via UI:**
- Navigate to the Farm Creator
- Select "OpenAI GPT-4" from the provider dropdown
- Choose your model (GPT-4, GPT-4 Turbo, or GPT-4o)
- Configure agent count and parameters
- Click "Create Farm"

### Quick Tasks with OpenAI

```javascript
POST /api/tasks/quick
{
  "provider": "openai",
  "prompt": "Refactor this TypeScript function to use async/await",
  "model": "gpt-4-turbo-preview",
  "temperature": 0.5
}
```

## LLM Proxy Integration

The LLM proxy provides enhanced capabilities by routing requests through a unified interface:

### Starting the Proxy
```bash
npm run proxy:start
```

### Benefits:
- Unified API for multiple providers
- Request/response caching
- Automatic retry logic
- Token counting and optimization
- Streaming support

### Using the Proxy:
```javascript
// Automatically used when USE_LLM_PROXY=true
const response = await fetch('http://localhost:8001/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'openai/gpt-4-turbo-preview',
    messages: [
      { role: 'user', content: 'Your prompt here' }
    ]
  })
});
```

## Model Capabilities

| Model | Context Window | Vision | Function Calling | Best For |
|-------|---------------|--------|-----------------|----------|
| GPT-4 | 8,192 tokens | ❌ | ✅ | Complex reasoning |
| GPT-4-32k | 32,768 tokens | ❌ | ✅ | Long documents |
| GPT-4 Turbo | 128,000 tokens | ❌ | ✅ | Large codebases |
| GPT-4o | 128,000 tokens | ✅ | ✅ | Multimodal tasks |
| GPT-3.5 Turbo | 16,385 tokens | ❌ | ✅ | Fast responses |

## Cost Management

### Token Usage Tracking
- Automatic token counting for all requests
- Cost calculation based on model pricing
- Database storage of usage metrics

### Budget Controls
```bash
OPENAI_DAILY_BUDGET=100      # Daily limit in USD
OPENAI_MONTHLY_BUDGET=2000   # Monthly limit in USD
OPENAI_TASK_BUDGET=10        # Per-task limit in USD
OPENAI_BUDGET_WARNING=0.8    # Warning at 80% of budget
OPENAI_AUTO_SHUTDOWN=true    # Stop when budget exceeded
```

### Viewing Costs
```http
GET /api/cost-tracking/openai
```

## Privacy & Security

### Data Protection
- Optional request anonymization
- Configurable data retention policies
- Encryption for sensitive data
- Audit logging for compliance

### Configuration:
```bash
OPENAI_ANONYMIZE=true
OPENAI_PRIVACY_PATTERNS=password,secret,key,token
OPENAI_ENCRYPT=true
OPENAI_RETENTION_DAYS=30
OPENAI_AUDIT_LOG=true
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized Error**
   - Verify your API key is correct
   - Check if the key has been revoked
   - Ensure proper environment variable is set

2. **404 Model Not Found**
   - Verify you have access to the specified model
   - Check your OpenAI account tier
   - Try using a different model

3. **Rate Limiting (429 Error)**
   - Reduce concurrent requests
   - Implement exponential backoff
   - Check your account's rate limits

4. **Timeout Errors**
   - Increase OPENAI_TIMEOUT value
   - Reduce max_tokens for faster responses
   - Check network connectivity

### Debug Mode
Enable detailed logging:
```bash
DEBUG=openai:* npm run dev
```

### Health Check
```bash
curl http://localhost:4567/api/openai/status
```

## Migration from Claude

### Code Changes Required
1. Update provider in farm configurations
2. Adjust prompt formats if needed
3. Update token limits based on model
4. Review temperature settings

### Feature Parity
- ✅ Multi-agent orchestration
- ✅ Task execution
- ✅ Harvest collection
- ✅ WebSocket updates
- ✅ Cost tracking
- ⚠️ Some Claude-specific features may need adaptation

## Best Practices

1. **Model Selection**
   - Use GPT-4 Turbo for large context needs
   - Use GPT-4o for vision tasks
   - Use GPT-3.5 Turbo for fast, simple tasks

2. **Prompt Engineering**
   - Be specific and clear
   - Use system messages effectively
   - Leverage few-shot examples

3. **Cost Optimization**
   - Set appropriate max_tokens
   - Use temperature 0 for deterministic outputs
   - Implement caching for repeated queries

4. **Error Handling**
   - Always implement retry logic
   - Handle rate limits gracefully
   - Log errors for debugging

## Support

For issues or questions:
1. Check the test script: `npm run test:openai`
2. Review logs: `tail -f logs/openai.log`
3. Check API status: https://status.openai.com
4. File an issue: https://github.com/your-org/maifarm/issues