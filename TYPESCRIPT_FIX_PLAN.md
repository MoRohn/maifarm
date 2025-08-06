# TypeScript Error Fix Plan

## Error Summary
Total Errors: **626**

### Error Distribution by Type:
- **TS2339** (177): Property does not exist on type
- **TS18048** (130): Value is possibly 'undefined'
- **TS2322** (68): Type is not assignable
- **TS2345** (63): Argument type mismatch
- **TS2353** (39): Object literal unknown properties
- **TS2769** (24): No overload matches call
- **TS2561** (22): Object is possibly 'undefined'
- **TS7006** (21): Parameter implicitly has 'any' type
- **TS7053** (13): Element implicitly has 'any' type
- Other errors (75): Various type issues

## Grouped Solutions

### Group 1: Type Definition Updates (240 errors)
**Error Types:** TS2339, TS2353
**Root Cause:** Missing or incorrect type definitions

#### Files to Update:
1. **Types Files** (`src/types/*.ts`)
   - Add missing properties to interfaces
   - Update type definitions to match actual usage
   
2. **Affected Components:**
   - `src/types/settings.ts` - Add missing properties (colors, animations, cacheEnabled, mfaEnabled)
   - `src/types/seed.ts` - Add 'config' property to SeedCreateInput
   - `src/types/farm.ts` - Add 'tasks' and 'health' properties
   - `src/types/agent.ts` - Fix AgentResources structure
   - `src/types/goWild.ts` - Add discoveries, totalTasks, completedTasks to GoWildSession

#### Solution Template:
```typescript
// Before
interface Settings {
  theme: string;
}

// After
interface Settings {
  theme: string;
  colors?: ColorConfig;
  animations?: AnimationConfig;
  cacheEnabled?: boolean;
}
```

### Group 2: Null/Undefined Checks (152 errors)
**Error Types:** TS18048, TS2561, TS18046
**Root Cause:** Missing null/undefined checks

#### Common Patterns:
1. **Optional chaining**
   ```typescript
   // Before
   alert.duration
   // After
   alert.duration ?? DEFAULT_DURATION
   ```

2. **Guard clauses**
   ```typescript
   // Before
   integration.metadata.someValue
   // After
   if (!integration.metadata) return;
   integration.metadata.someValue
   ```

#### Files to Fix:
- `src/services/alertService.ts`
- `src/services/apiIntegration.ts`
- `src/services/explorationSnapshot.ts`

### Group 3: Type Casting & Conversions (131 errors)
**Error Types:** TS2322, TS2345
**Root Cause:** Incorrect type assignments

#### Common Issues:
1. **Number to String conversions**
   ```typescript
   // Before
   id: Date.now()
   // After
   id: Date.now().toString()
   ```

2. **Date type issues**
   ```typescript
   // Before
   timestamp: "2024-01-01"
   // After
   timestamp: new Date("2024-01-01")
   ```

3. **Enum/Union type mismatches**
   ```typescript
   // Before
   visibility: "public" | "private" | "team"
   // After - if type expects only "private"
   visibility: "private" as const
   ```

#### Files to Fix:
- `src/services/agentService.ts` - Number to string conversions
- `src/hooks/useOrchestration.ts` - Date type issues
- `src/components/Harvest/SaveSeedModal.tsx` - Union type issues

### Group 4: Function Signature Mismatches (32 errors)
**Error Types:** TS2769, TS2554
**Root Cause:** Incorrect function arguments

#### Common Issues:
1. **Missing arguments**
   ```typescript
   // Before
   someFunction(arg1)
   // After
   someFunction(arg1, defaultArg2)
   ```

2. **Overload resolution**
   ```typescript
   // Before
   new Date(value) // where value might be boolean
   // After
   new Date(typeof value === 'boolean' ? Date.now() : value)
   ```

#### Files to Fix:
- `src/services/alertManager.ts`
- `src/services/backup/backupService.ts`
- `src/services/explorationEngine.ts`
- `src/hooks/useOrchestration.ts`

### Group 5: IndexedDB Store Names (45 errors)
**Error Types:** TS2345 (specific to IndexedDB)
**Root Cause:** Using invalid store names

#### Issue:
Using store names like "backups", "cachedData", "snapshots" that don't exist in IndexedDB schema

#### Solution:
1. Update IndexedDB schema to include missing stores
2. Or map to existing stores:
   ```typescript
   // Before
   db.getStore("backups")
   // After
   db.getStore("settings") // or add "backups" to schema
   ```

#### Files to Fix:
- `src/services/backupService.ts`
- `src/services/explorationSnapshot.ts`

### Group 6: Dynamic Property Access (34 errors)
**Error Types:** TS7053, TS7006
**Root Cause:** Using dynamic keys without proper typing

#### Solution Pattern:
```typescript
// Before
const value = object[dynamicKey];

// After
const value = object[dynamicKey as keyof typeof object];
// Or
const value = (object as Record<string, any>)[dynamicKey];
```

#### Files to Fix:
- `src/services/explorationEngine.ts`
- `src/services/creativityAnalyzer.ts`

### Group 7: Missing Type Declarations (1 error)
**Error Type:** TS7016
**Root Cause:** Missing @types package

#### Solution:
```bash
npm install --save-dev @types/crypto-js
```

### Group 8: Complex Type Issues (remaining errors)
**Various error types**
**Root Cause:** Complex type inheritance and interface extension issues

#### Files Requiring Manual Review:
- `src/store/userStore.ts` - Complex state update typing
- `src/types/orchestration.ts` - Interface extension conflicts
- `src/services/encryption.ts` - Crypto API typing
- `src/services/workflowEngine.ts` - WebSocket message typing

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
1. Install missing type packages
2. Fix number to string conversions
3. Add null checks with optional chaining
4. Fix store name constants

**Estimated fixes: ~200 errors**

### Phase 2: Type Definitions (2-3 hours)
1. Update all interface definitions in `src/types/`
2. Add missing properties to existing types
3. Create new type definitions where needed

**Estimated fixes: ~240 errors**

### Phase 3: Function Signatures (1-2 hours)
1. Fix function argument mismatches
2. Add default parameters where needed
3. Update overloaded function calls

**Estimated fixes: ~50 errors**

### Phase 4: Complex Refactoring (2-3 hours)
1. Refactor dynamic property access
2. Fix complex type inheritance issues
3. Update store schemas
4. Handle edge cases

**Estimated fixes: ~136 errors**

## Priority Order

### Critical (Fix First):
1. `src/services/agentService.ts` - Core functionality
2. `src/services/farmService.ts` - Core functionality
3. `src/hooks/useOrchestration.ts` - Core hook
4. `src/store/*` - State management

### High Priority:
1. `src/services/websocket.ts` - Real-time features
2. `src/services/alertService.ts` - User notifications
3. `src/components/Dashboard/*` - Main UI

### Medium Priority:
1. `src/services/backup/*` - Backup functionality
2. `src/services/encryption/*` - Security features
3. `src/services/analytics/*` - Analytics

### Low Priority:
1. `src/services/exploration*` - Advanced features
2. `src/services/creativity*` - AI features
3. Test files and utilities

## Automated Fix Scripts

### Script 1: Add Optional Chaining
```bash
# Find and add optional chaining for common patterns
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/\.duration/?.duration ?? 5000/g'
```

### Script 2: Fix Number to String
```bash
# Convert Date.now() to string where used as ID
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/id: Date\.now()/id: Date.now().toString()/g'
```

### Script 3: Add Type Assertions
```bash
# Add type assertions for dynamic keys
# This requires more careful review, so manual fixes are recommended
```

## Testing Strategy

After each phase:
1. Run `npm run typecheck` to verify fixes
2. Run `npm run build` to ensure compilation
3. Run `npm test` to ensure no behavioral changes
4. Test critical paths in the application

## Success Metrics

- **Phase 1 Complete:** Error count < 450
- **Phase 2 Complete:** Error count < 250  
- **Phase 3 Complete:** Error count < 150
- **Phase 4 Complete:** Error count = 0

## Notes

1. Some errors may cascade - fixing type definitions often resolves multiple downstream errors
2. Consider enabling `strict` mode gradually after fixing current errors
3. Add ESLint rules to prevent similar issues in the future
4. Document any intentional type assertions or workarounds