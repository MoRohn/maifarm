#!/bin/bash

# ============================================================================
# GPT-OSS Model Setup Script
#
# Automated setup for GPT-OSS local AI models
# Supports vLLM (GPU) and llama-cpp-python (CPU/Apple Silicon)
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}GPT-OSS Model Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================================================
# Detect system and capabilities
# ============================================================================

OS_TYPE=$(uname -s)
ARCH=$(uname -m)

echo -e "${BLUE}System Detection:${NC}"
echo "  OS: $OS_TYPE"
echo "  Architecture: $ARCH"

# Check for NVIDIA GPU
HAS_NVIDIA=false
if command -v nvidia-smi &> /dev/null; then
    HAS_NVIDIA=true
    echo -e "  GPU: ${GREEN}NVIDIA detected ✓${NC}"
    nvidia-smi --query-gpu=name --format=csv,noheader | head -1
else
    echo "  GPU: No NVIDIA GPU detected"
fi

# Check for Apple Silicon
IS_APPLE_SILICON=false
if [[ "$OS_TYPE" == "Darwin" && "$ARCH" == "arm64" ]]; then
    IS_APPLE_SILICON=true
    echo -e "  Apple Silicon: ${GREEN}Detected ✓${NC}"
fi

echo ""

# ============================================================================
# Recommend backend
# ============================================================================

echo -e "${BLUE}Recommended Backend:${NC}"

if [ "$HAS_NVIDIA" = true ]; then
    RECOMMENDED="vllm"
    echo -e "  ${GREEN}vLLM (GPU-accelerated)${NC} - Best performance"
    echo "  Uses NVIDIA CUDA for fast inference"
elif [ "$IS_APPLE_SILICON" = true ]; then
    RECOMMENDED="llama-cpp"
    echo -e "  ${GREEN}llama-cpp-python (Metal-accelerated)${NC}"
    echo "  Uses Apple Metal for hardware acceleration"
else
    RECOMMENDED="llama-cpp"
    echo -e "  ${YELLOW}llama-cpp-python (CPU)${NC}"
    echo "  CPU-only inference (slower but works everywhere)"
fi

echo ""

# ============================================================================
# User choice
# ============================================================================

echo -e "${BLUE}Select Backend:${NC}"
echo "  1) vLLM (NVIDIA GPU required)"
echo "  2) llama-cpp-python (CPU/Apple Silicon)"
echo "  3) Auto-detect (recommended)"
echo ""
read -p "Enter choice [1-3] (default: 3): " BACKEND_CHOICE

case "$BACKEND_CHOICE" in
    1)
        BACKEND="vllm"
        ;;
    2)
        BACKEND="llama-cpp"
        ;;
    *)
        BACKEND="auto"
        ;;
esac

echo -e "${GREEN}Selected: $BACKEND${NC}"
echo ""

# ============================================================================
# Install Python dependencies
# ============================================================================

echo -e "${BLUE}Installing Python Dependencies...${NC}"

# Base dependencies
pip install --quiet --upgrade pip
pip install --quiet fastapi==0.104.1 uvicorn==0.24.0 pydantic==2.5.0

if [ "$BACKEND" = "vllm" ] || [ "$BACKEND" = "auto" ]; then
    if [ "$HAS_NVIDIA" = true ]; then
        echo "Installing vLLM (GPU)..."
        pip install --quiet vllm
        echo -e "${GREEN}✓ vLLM installed${NC}"
    fi
fi

if [ "$BACKEND" = "llama-cpp" ] || [ "$BACKEND" = "auto" ]; then
    echo "Installing llama-cpp-python..."

    if [ "$IS_APPLE_SILICON" = true ]; then
        echo "  (with Metal acceleration)"
        CMAKE_ARGS="-DLLAMA_METAL=on" pip install --quiet llama-cpp-python[server]
    elif [ "$HAS_NVIDIA" = true ]; then
        echo "  (with CUDA acceleration)"
        CMAKE_ARGS="-DLLAMA_CUDA=on" pip install --quiet llama-cpp-python[server]
    else
        echo "  (CPU-only)"
        pip install --quiet llama-cpp-python[server]
    fi

    echo -e "${GREEN}✓ llama-cpp-python installed${NC}"
fi

echo ""

# ============================================================================
# Model selection and download
# ============================================================================

echo -e "${BLUE}Model Selection:${NC}"
echo ""

if [ "$BACKEND" = "vllm" ] || ([ "$BACKEND" = "auto" ] && [ "$HAS_NVIDIA" = true ]); then
    echo "For vLLM, models are downloaded automatically from Hugging Face."
    echo ""
    echo -e "${YELLOW}Recommended Models:${NC}"
    echo "  1) openai/gpt-oss-20b (21B params, shipped default)"
    echo "  2) openai/gpt-oss-120b (117B params, extreme hardware)"
    echo "  3) Custom Hugging Face model"
    echo ""
    read -p "Enter model name (default: openai/gpt-oss-20b): " MODEL_NAME

    if [ -z "$MODEL_NAME" ]; then
        MODEL_NAME="openai/gpt-oss-20b"
    fi

    echo -e "${GREEN}Model will be downloaded on first use: $MODEL_NAME${NC}"

    # Update .env.development
    if grep -q "^GPT_OSS_MODEL=" .env.development 2>/dev/null; then
        sed -i.bak "s|^GPT_OSS_MODEL=.*|GPT_OSS_MODEL=$MODEL_NAME|" .env.development
    else
        echo "GPT_OSS_MODEL=$MODEL_NAME" >> .env.development
    fi

    if grep -q "^GPT_OSS_BACKEND=" .env.development 2>/dev/null; then
        sed -i.bak "s|^GPT_OSS_BACKEND=.*|GPT_OSS_BACKEND=vllm|" .env.development
    else
        echo "GPT_OSS_BACKEND=vllm" >> .env.development
    fi

    rm -f .env.development.bak

elif [ "$BACKEND" = "llama-cpp" ]; then
    echo "For llama-cpp, you need GGUF format models."
    echo ""
    echo -e "${YELLOW}Popular GPT-OSS GGUF Builds:${NC}"
    echo "  1) OpenAI GPT-OSS 20B Q4_K_M (9.5GB)"
    echo "  2) OpenAI GPT-OSS 12B Q4_K_M (6.2GB)"
    echo "  3) OpenAI GPT-OSS 8B Q4_K_M (4.4GB)"
    echo ""
    echo "Would you like to download a model now?"
    read -p "Enter choice [1-3] or 'n' to skip: " MODEL_CHOICE

    case "$MODEL_CHOICE" in
        1)
            MODEL_URL="https://huggingface.co/openai/gpt-oss-20b-gguf/resolve/main/gpt-oss-20b.Q4_K_M.gguf"
            MODEL_NAME="gpt-oss-20b.Q4_K_M.gguf"
            ;;
        2)
            MODEL_URL="https://huggingface.co/openai/gpt-oss-12b-gguf/resolve/main/gpt-oss-12b.Q4_K_M.gguf"
            MODEL_NAME="gpt-oss-12b.Q4_K_M.gguf"
            ;;
        3)
            MODEL_URL="https://huggingface.co/openai/gpt-oss-8b-gguf/resolve/main/gpt-oss-8b.Q4_K_M.gguf"
            MODEL_NAME="gpt-oss-8b.Q4_K_M.gguf"
            ;;
        *)
            echo "Skipping model download."
            echo "You can download models manually from: https://huggingface.co/models?search=gguf"
            exit 0
            ;;
    esac

    # Create models directory
    MODELS_DIR="$HOME/.maifarm/gpt-oss/models"
    mkdir -p "$MODELS_DIR"

    MODEL_PATH="$MODELS_DIR/$MODEL_NAME"

    if [ -f "$MODEL_PATH" ]; then
        echo -e "${GREEN}Model already downloaded: $MODEL_PATH${NC}"
    else
        echo "Downloading $MODEL_NAME..."
        echo "This may take several minutes depending on your connection..."

        curl -L --progress-bar "$MODEL_URL" -o "$MODEL_PATH"

        echo -e "${GREEN}✓ Model downloaded: $MODEL_PATH${NC}"
    fi

    # Update .env.development
    if grep -q "^GPT_OSS_MODEL_PATH=" .env.development 2>/dev/null; then
        sed -i.bak "s|^GPT_OSS_MODEL_PATH=.*|GPT_OSS_MODEL_PATH=$MODEL_PATH|" .env.development
    else
        echo "GPT_OSS_MODEL_PATH=$MODEL_PATH" >> .env.development
    fi

    if grep -q "^GPT_OSS_BACKEND=" .env.development 2>/dev/null; then
        sed -i.bak "s|^GPT_OSS_BACKEND=.*|GPT_OSS_BACKEND=llama-cpp|" .env.development
    else
        echo "GPT_OSS_BACKEND=llama-cpp" >> .env.development
    fi

    rm -f .env.development.bak
fi

echo ""

# ============================================================================
# Test setup
# ============================================================================

echo -e "${BLUE}Testing GPT-OSS Server...${NC}"

# Start server in background
python3 apps/api/src/engines/gpt-oss-server.py &
SERVER_PID=$!

echo "  Started server (PID: $SERVER_PID)"
echo "  Waiting for initialization..."

# Wait for server to be ready
MAX_ATTEMPTS=30
for i in $(seq 1 $MAX_ATTEMPTS); do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Server is healthy!${NC}"
        break
    fi

    if [ $i -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}  ✗ Server failed to start${NC}"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi

    sleep 2
done

# Get health status
HEALTH=$(curl -s http://localhost:8000/health)
echo "  $HEALTH"

# Kill server
kill $SERVER_PID 2>/dev/null
echo "  Stopped server"

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ GPT-OSS Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"

if [ "$BACKEND" = "vllm" ]; then
    echo "  Backend: vLLM (GPU)"
    echo "  Model: $MODEL_NAME"
    echo "  (Model will download on first use)"
elif [ "$BACKEND" = "llama-cpp" ]; then
    echo "  Backend: llama-cpp-python"
    echo "  Model: $MODEL_PATH"
else
    echo "  Backend: Auto-detect"
    echo "  Will use vLLM if available, otherwise llama-cpp"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Start MaiFarm: npm run dev"
echo "  2. Go to Settings → AI Engine Setup"
echo "  3. Activate GPT-OSS"
echo "  4. Create a farm and select GPT-OSS as provider"
echo ""
echo -e "${BLUE}Manual Start (for testing):${NC}"
echo "  python3 apps/api/src/engines/gpt-oss-server.py"
echo ""
echo -e "${GREEN}Enjoy your free, local AI! 🚀${NC}"
