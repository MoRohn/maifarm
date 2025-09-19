# Farm Launch Error Handling Fix

## Problem
The Farm launch process was showing misleading "Farm launch timed out" errors after 30 seconds, even when the actual issue was:
- Missing API keys
- YAML generation failures  
- Server connection issues
- Configuration problems

## Solution Implemented

### 1. Better Error Diagnostics
- **Removed misleading timeout messages** - timeout is now only used as a 90-second failsafe for true network issues
- **Added specific error detection** for different failure scenarios:
  - API key missing
  - Server not running (ECONNREFUSED)
  - YAML generation failures
  - HTTP status codes (404, 500)
  - Network connectivity issues

### 2. Improved User Feedback
- **Progress messages** show what's happening:
  - "Generating farm configuration for [provider] provider..."
  - "Creating your farm..."
- **Specific error messages** that tell users exactly what went wrong:
  - "No API key configured for claude. Please add your API key in Settings > API Keys"
  - "Cannot connect to the server. Please ensure the server is running on port 4567"
  - "Server error during configuration generation. Please check server logs"

### 3. Enhanced Logging
Added console logging throughout the process to help with debugging:
```javascript
console.log('[FarmChatWizard] Starting YAML generation for provider:', provider);
console.log('[FarmChatWizard] YAML generation response received:', yamlResponse.status);
console.log('[FarmChatWizard] Creating farm with name:', farmName);
```

### 4. Proper Error State Management
- Set `hasCompleted = true` flag in all error paths to prevent timeout from firing
- Extended error toast duration to 6 seconds for better readability
- Clear timeout properly in finally block

## Files Modified
- `/src/components/Farm/FarmChatWizard.tsx`

## Key Changes

### Before:
- Generic 30-second timeout with misleading "Farm launch timed out" message
- No differentiation between timeout and other errors
- Poor error diagnostics

### After:
- 90-second failsafe only for true network timeouts
- Specific error messages for each failure type
- Progress indicators showing current operation
- Console logging for debugging
- Proper error state management

## Testing Scenarios
1. **Missing API Key**: Shows "No API key configured for [provider]"
2. **Server Not Running**: Shows "Cannot connect to the server"
3. **YAML Generation Failure**: Shows specific error from server
4. **Network Timeout**: Only shows timeout message after 90 seconds of no response
5. **Server Errors**: Shows appropriate HTTP status error messages

## Benefits
- Users now know exactly what went wrong
- No more confusion about "timeout" when it's actually a different issue
- Easier debugging with console logs
- Better user experience with progress indicators
- Actionable error messages that tell users how to fix the problem