#!/bin/bash
set -e

echo "=========================================="
echo "MaiFarm: Qwen → Llama Migration Script"
echo "=========================================="
echo ""
echo "This script will replace all Qwen references with Llama across the codebase."
echo "Backup recommendation: Commit your changes before running this script."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter for changes
total_changes=0

# Function to perform case-sensitive replacement
replace_in_file() {
    local file=$1
    local search=$2
    local replace=$3
    local description=$4

    if grep -q "$search" "$file" 2>/dev/null; then
        sed -i '' "s/$search/$replace/g" "$file"
        echo -e "${GREEN}✓${NC} Updated: $file ($description)"
        ((total_changes++))
    fi
}

# Function to replace in all TypeScript/TypeScript React files
replace_in_ts_files() {
    local search=$1
    local replace=$2
    local description=$3

    echo -e "\n${BLUE}Replacing '$search' → '$replace' in TypeScript files...${NC}"

    # Find all .ts and .tsx files
    find apps -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" | while read file; do
        replace_in_file "$file" "$search" "$replace" "$description"
    done
}

# Function to replace in environment files
replace_in_env_files() {
    local search=$1
    local replace=$2
    local description=$3

    echo -e "\n${BLUE}Replacing '$search' → '$replace' in environment files...${NC}"

    for file in .env.example .env.development .env.production; do
        if [ -f "$file" ]; then
            replace_in_file "$file" "$search" "$replace" "$description"
        fi
    done
}

# Function to replace in Python files
replace_in_py_files() {
    local search=$1
    local replace=$2
    local description=$3

    echo -e "\n${BLUE}Replacing '$search' → '$replace' in Python files...${NC}"

    find apps scripts -type f -name "*.py" ! -path "*/node_modules/*" | while read file; do
        replace_in_file "$file" "$search" "$replace" "$description"
    done
}

echo "Starting migration..."
echo ""

# ============================================================================
# Phase 1: Enum and Type Updates
# ============================================================================
echo -e "${YELLOW}Phase 1: Enum and Type Updates${NC}"

replace_in_ts_files "AIProvider\.QWEN" "AIProvider.LLAMA" "Enum reference"
replace_in_ts_files "= 'qwen'" "= 'llama'" "Enum value"
replace_in_ts_files ": 'qwen'" ": 'llama'" "Type literal"

# ============================================================================
# Phase 2: Environment Variable Names
# ============================================================================
echo -e "\n${YELLOW}Phase 2: Environment Variable Names${NC}"

# TypeScript/JavaScript
replace_in_ts_files "QWEN_ENABLED" "LLAMA_ENABLED" "Enabled flag"
replace_in_ts_files "QWEN_API_ENDPOINT" "LLAMA_API_ENDPOINT" "API endpoint"
replace_in_ts_files "QWEN_MODEL" "LLAMA_MODEL" "Model name"
replace_in_ts_files "QWEN_MAX_TOKENS" "LLAMA_MAX_TOKENS" "Max tokens"
replace_in_ts_files "QWEN_TEMPERATURE" "LLAMA_TEMPERATURE" "Temperature"
replace_in_ts_files "QWEN_CONTEXT_WINDOW" "LLAMA_CONTEXT_WINDOW" "Context window"

# Environment files
replace_in_env_files "QWEN_ENABLED" "LLAMA_ENABLED" "Enabled flag"
replace_in_env_files "QWEN_API_ENDPOINT" "LLAMA_API_ENDPOINT" "API endpoint"
replace_in_env_files "QWEN_MODEL" "LLAMA_MODEL" "Model name"
replace_in_env_files "QWEN_MAX_TOKENS" "LLAMA_MAX_TOKENS" "Max tokens"
replace_in_env_files "QWEN_TEMPERATURE" "LLAMA_TEMPERATURE" "Temperature"
replace_in_env_files "QWEN_CONTEXT_WINDOW" "LLAMA_CONTEXT_WINDOW" "Context window"

# Python files
replace_in_py_files "QWEN_ENABLED" "LLAMA_ENABLED" "Enabled flag"
replace_in_py_files "QWEN_API_ENDPOINT" "LLAMA_API_ENDPOINT" "API endpoint"
replace_in_py_files "QWEN_MODEL" "LLAMA_MODEL" "Model name"

# ============================================================================
# Phase 3: Model Names and Descriptions
# ============================================================================
echo -e "\n${YELLOW}Phase 3: Model Names and Descriptions${NC}"

replace_in_ts_files "qwen2\.5-coder:7b" "meta-llama/Meta-Llama-3.1-8B-Instruct" "Model ID"
replace_in_ts_files "'qwen2\.5-coder:7b-instruct'" "'meta-llama/Meta-Llama-3.1-8B-Instruct'" "Model ID with quotes"
replace_in_ts_files "qwen2\.5-coder:7b-instruct" "meta-llama/Meta-Llama-3.1-8B-Instruct" "Model ID variant"

# ============================================================================
# Phase 4: Provider String References
# ============================================================================
echo -e "\n${YELLOW}Phase 4: Provider String References${NC}"

replace_in_ts_files "provider: 'qwen'" "provider: 'llama'" "Provider literal"
replace_in_ts_files "provider === 'qwen'" "provider === 'llama'" "Provider comparison"
replace_in_ts_files "'gpt-oss', 'qwen'" "'gpt-oss', 'llama'" "Provider array"
replace_in_ts_files "\"qwen\"" "\"llama\"" "Provider string"

# ============================================================================
# Phase 5: Function and Variable Names
# ============================================================================
echo -e "\n${YELLOW}Phase 5: Function and Variable Names${NC}"

replace_in_ts_files "qwenConfig" "llamaConfig" "Config variable"
replace_in_ts_files "QwenSetup" "LlamaSetup" "Component/class name"
replace_in_ts_files "launchQwen" "launchLlama" "Function name"
replace_in_ts_files "getQwen" "getLlama" "Getter function"

# ============================================================================
# Phase 6: UI Text and Labels
# ============================================================================
echo -e "\n${YELLOW}Phase 6: UI Text and Labels${NC}"

replace_in_ts_files "Qwen" "Llama" "UI text"
replace_in_ts_files "qwen" "llama" "Lowercase text"

# ============================================================================
# Phase 7: File and Directory Names
# ============================================================================
echo -e "\n${YELLOW}Phase 7: File and Directory Names${NC}"

# Find files with 'qwen' in the name
echo "Checking for files with 'qwen' in filename..."
find apps scripts -type f \( -name "*qwen*" -o -name "*Qwen*" \) ! -path "*/node_modules/*" ! -path "*/dist/*" | while read old_file; do
    new_file=$(echo "$old_file" | sed 's/qwen/llama/g' | sed 's/Qwen/Llama/g')
    if [ "$old_file" != "$new_file" ]; then
        echo -e "${GREEN}✓${NC} Renaming: $old_file → $new_file"
        mv "$old_file" "$new_file"
        ((total_changes++))
    fi
done

# ============================================================================
# Phase 8: Comments and Documentation
# ============================================================================
echo -e "\n${YELLOW}Phase 8: Comments and Documentation${NC}"

# Update comments in TypeScript files
find apps -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" | while read file; do
    if grep -q "Qwen\|qwen" "$file" 2>/dev/null; then
        sed -i '' "s/Qwen/Llama/g" "$file"
        sed -i '' "s/qwen/llama/g" "$file"
        echo -e "${GREEN}✓${NC} Updated comments: $file"
        ((total_changes++))
    fi
done

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "=========================================="
echo -e "${GREEN}Migration Complete!${NC}"
echo "=========================================="
echo ""
echo "Total changes made: $total_changes"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review changes: git diff"
echo "2. Test TypeScript compilation: npm run typecheck"
echo "3. Test application: npm run dev"
echo "4. Update .env.development with Llama-specific values"
echo "5. Commit changes: git add -A && git commit -m 'feat: Replace Qwen with Llama 3.1 8B'"
echo ""
echo -e "${YELLOW}Important Configuration:${NC}"
echo "Update your .env.development file:"
echo "  LLAMA_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct"
echo "  LLAMA_API_ENDPOINT=http://localhost:8001/v1"
echo "  LLAMA_TEMPERATURE=0.7"
echo "  LLAMA_MAX_TOKENS=8192"
echo "  LLAMA_CONTEXT_WINDOW=128000"
echo ""
