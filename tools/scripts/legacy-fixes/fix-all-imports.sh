#!/bin/bash

echo "🔧 Restoring all imports to use @/ aliases..."

# Function to fix imports in a file
fix_imports() {
    local file="$1"
    
    # Create a temporary file
    local temp_file="${file}.tmp"
    
    # Read the file and fix imports
    sed -E \
        -e "s|from '\.\.\/\.\.\/\.\.\/components/|from '@/components/|g" \
        -e "s|from '\.\.\/\.\.\/\.\.\/services/|from '@/services/|g" \
        -e "s|from '\.\.\/\.\.\/\.\.\/hooks/|from '@/hooks/|g" \
        -e "s|from '\.\.\/\.\.\/\.\.\/types/|from '@/types/|g" \
        -e "s|from '\.\.\/\.\.\/\.\.\/utils/|from '@/utils/|g" \
        -e "s|from '\.\.\/\.\.\/\.\.\/store/|from '@/store/|g" \
        -e "s|from '\.\.\/\.\.\/components/|from '@/components/|g" \
        -e "s|from '\.\.\/\.\.\/services/|from '@/services/|g" \
        -e "s|from '\.\.\/\.\.\/hooks/|from '@/hooks/|g" \
        -e "s|from '\.\.\/\.\.\/types/|from '@/types/|g" \
        -e "s|from '\.\.\/\.\.\/utils/|from '@/utils/|g" \
        -e "s|from '\.\.\/\.\.\/store/|from '@/store/|g" \
        -e "s|from '\.\.\/components/|from '@/components/|g" \
        -e "s|from '\.\.\/services/|from '@/services/|g" \
        -e "s|from '\.\.\/hooks/|from '@/hooks/|g" \
        -e "s|from '\.\.\/types/|from '@/types/|g" \
        -e "s|from '\.\.\/utils/|from '@/utils/|g" \
        -e "s|from '\.\.\/store/|from '@/store/|g" \
        -e "s|from '\.\.\/types'|from '@/types'|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/components/|from \"@/components/|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/services/|from \"@/services/|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/hooks/|from \"@/hooks/|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/types/|from \"@/types/|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/utils/|from \"@/utils/|g" \
        -e "s|from \"\.\.\/\.\.\/\.\.\/store/|from \"@/store/|g" \
        -e "s|from \"\.\.\/\.\.\/components/|from \"@/components/|g" \
        -e "s|from \"\.\.\/\.\.\/services/|from \"@/services/|g" \
        -e "s|from \"\.\.\/\.\.\/hooks/|from \"@/hooks/|g" \
        -e "s|from \"\.\.\/\.\.\/types/|from \"@/types/|g" \
        -e "s|from \"\.\.\/\.\.\/utils/|from \"@/utils/|g" \
        -e "s|from \"\.\.\/\.\.\/store/|from \"@/store/|g" \
        -e "s|from \"\.\.\/components/|from \"@/components/|g" \
        -e "s|from \"\.\.\/services/|from \"@/services/|g" \
        -e "s|from \"\.\.\/hooks/|from \"@/hooks/|g" \
        -e "s|from \"\.\.\/types/|from \"@/types/|g" \
        -e "s|from \"\.\.\/utils/|from \"@/utils/|g" \
        -e "s|from \"\.\.\/store/|from \"@/store/|g" \
        -e "s|from \"\.\.\/types\"|from \"@/types\"|g" \
        "$file" > "$temp_file"
    
    # Move temp file to original
    mv "$temp_file" "$file"
}

# Export the function so it can be used in subshells
export -f fix_imports

# Process all TypeScript and TSX files
echo "📁 Processing src/**/*.ts files..."
find src -type f -name "*.ts" -exec bash -c 'fix_imports "$0"' {} \;

echo "📁 Processing src/**/*.tsx files..."
find src -type f -name "*.tsx" -exec bash -c 'fix_imports "$0"' {} \;

echo "✅ Import restoration complete!"

# Show a summary of what was changed
echo ""
echo "📊 Summary of changes:"
echo "- Restored @/ alias imports for better maintainability"
echo "- Fixed nested component imports"
echo "- Fixed service subdirectory imports"
echo "- Standardized all import paths"

echo ""
echo "🔍 Verifying build..."
npm run build 2>&1 | tail -5

echo ""
echo "✨ All imports have been restored to use @/ aliases!"