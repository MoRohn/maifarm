#!/bin/bash

# Fix all @/ imports to use relative imports
echo "Fixing all @/ imports to relative imports..."

# Find all TypeScript/TSX files and replace @/ imports
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|from '@/components/|from '../components/|g" \
  -e "s|from '@/services/|from '../services/|g" \
  -e "s|from '@/hooks/|from '../hooks/|g" \
  -e "s|from '@/types/|from '../types/|g" \
  -e "s|from '@/utils/|from '../utils/|g" \
  -e "s|from '@/store/|from '../store/|g" \
  -e "s|from '@/types'|from '../types'|g" \
  -e "s|from '@/|from '../|g" \
  {} \;

# Fix components that are deeper nested (need ../../)
find src/components -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|from '\.\./components/|from '../../components/|g" \
  -e "s|from '\.\./services/|from '../../services/|g" \
  -e "s|from '\.\./hooks/|from '../../hooks/|g" \
  -e "s|from '\.\./types/|from '../../types/|g" \
  -e "s|from '\.\./utils/|from '../../utils/|g" \
  -e "s|from '\.\./store/|from '../../store/|g" \
  -e "s|from '\.\./types'|from '../../types'|g" \
  {} \;

# Fix components that are even deeper nested (need ../../../)
find src/components -type d -mindepth 1 -exec sh -c '
  for dir; do
    find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "" \
      -e "s|from \"../../components/|from \"../../../components/|g" \
      -e "s|from \"../../services/|from \"../../../services/|g" \
      -e "s|from \"../../hooks/|from \"../../../hooks/|g" \
      -e "s|from \"../../types/|from \"../../../types/|g" \
      -e "s|from \"../../utils/|from \"../../../utils/|g" \
      -e "s|from \"../../store/|from \"../../../store/|g" \
      -e "s|from \"../../types\"|from \"../../../types\"|g" \
      {} \;
  done
' sh {} \;

echo "Import fixes complete!"