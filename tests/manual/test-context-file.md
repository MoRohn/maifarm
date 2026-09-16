# Test Context File for MaiFarm

This is a test file to verify that the file attachment feature works correctly.

## Requirements
- The farm should process this markdown file
- Multi-claude agents should receive this content as context
- The agents should be able to reference this information

## Test Data
- Project: MaiFarm Test
- Version: 1.0.0
- Priority: High
- Task: Verify file upload functionality

## Expected Behavior
1. File should be uploaded successfully
2. File path should be stored in farm configuration
3. Multi-claude should read and include this file content
4. Agents should see this context in their prompts

## Sample Code Reference
```javascript
// This is sample code that agents might need to understand
function testFunction() {
  console.log("File context is working!");
  return true;
}
```

End of test file.