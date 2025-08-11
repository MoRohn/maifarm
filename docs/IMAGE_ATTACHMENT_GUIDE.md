# Image Attachment Guide for MaiFarm

## Overview
MaiFarm supports attaching images and files to farms during creation. These attachments are automatically made available to AI agents, allowing them to analyze images, process documents, and incorporate external context into their work.

## How It Works

### 1. Upload Process
When creating a farm through the dashboard:
1. Use the **FileUpload** component in the farm creation modal
2. Drag and drop or click to select files (images, documents, etc.)
3. Files are uploaded along with the farm configuration

### 2. Server Processing
The server handles attachments by:
1. Receiving files via multipart/form-data
2. Storing files temporarily in the `uploads/farm-context` directory
3. Copying files to the farm's isolated workspace at `maibarn/workspaces/active/{farmId}/attachments/`
4. Recording file paths in the farm configuration

### 3. Agent Access
Agents receive attachment information through:
1. **Enhanced Prompt**: File paths are automatically added to the agent's initial prompt
2. **Workspace Access**: Files are available in the farm's workspace `attachments/` directory
3. **Context Awareness**: Agents are instructed to analyze and incorporate attached files

## Supported File Types
- **Images**: PNG, JPG, JPEG, GIF, WebP, SVG
- **Documents**: PDF, TXT, MD, JSON, YAML
- **Code**: JS, TS, PY, JAVA, C, CPP, etc.
- **Data**: CSV, XML, JSON

## File Size Limits
- Maximum file size: 10MB per file
- Maximum files per farm: 10 files
- Total upload limit: 100MB

## Implementation Details

### Frontend (FarmCreator.tsx)
```typescript
const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

// Include FileUpload component
<FileUpload onFilesChange={setAttachedFiles} />

// Send files with farm creation
if (attachedFiles.length > 0) {
  const formData = new FormData();
  formData.append('farmData', JSON.stringify(farmData));
  attachedFiles.forEach(file => {
    formData.append('files', file);
  });
  await farmService.createFarmWithFiles(formData);
}
```

### Backend (server/api/farms.ts)
```typescript
// Multer middleware handles file uploads
router.post('/', upload.array('files'), async (req, res) => {
  // Process uploaded files
  const contextFiles = req.files.map(file => ({
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype
  }));
  
  // Store in farm config
  const farm = await farmManager.createFarm({
    ...farmData,
    config: {
      ...config,
      attachedFiles: contextFiles
    }
  });
});
```

### Farm Manager (server/services/farmManager.ts)
```typescript
// Copy attachments to workspace
if (attachedFiles.length > 0) {
  const attachmentsDir = path.join(workspaceInfo.path, 'attachments');
  await fs.mkdir(attachmentsDir, { recursive: true });
  
  for (const file of attachedFiles) {
    const destPath = path.join(attachmentsDir, file.originalName);
    await fs.copyFile(file.path, destPath);
  }
  
  // Add paths to config for agent reference
  config.attachmentPaths = copiedFiles;
}
```

### Agent Coordination (server/services/claudeCodeManager.ts)
```typescript
// Include attachments in agent prompt
if (attachmentPaths && attachmentPaths.length > 0) {
  const attachmentInfo = attachmentPaths.map(path => 
    `- ${path.split('/').pop()}: ${path}`
  ).join('\n');
  
  enhancedPrompt = `${prompt}

## Attached Files
The following files have been provided as context:
${attachmentInfo}

Please analyze these files and incorporate their content into your work.`;
}
```

## Testing

Run the test script to verify the image attachment workflow:

```bash
npm run test:image-attachment
# or
node tests/test-image-attachment.js
```

The test script will:
1. Create a test image
2. Create a farm with the attached image
3. Verify the image is copied to the workspace
4. Start the farm and check agent access

## Best Practices

1. **File Naming**: Use descriptive file names that agents can understand
2. **Image Quality**: Ensure images are clear and relevant to the task
3. **Context**: Include instructions in the prompt about how to use attached files
4. **Security**: Files are isolated to the farm workspace and cannot access the main codebase

## Troubleshooting

### Common Issues

1. **Files not appearing in workspace**
   - Check server logs for copy errors
   - Verify `maibarn/workspaces/active/{farmId}/attachments/` directory exists
   - Ensure file permissions allow copying

2. **Agents not recognizing attachments**
   - Verify attachment paths are included in the prompt
   - Check that agents have read access to the workspace
   - Review agent logs for file access errors

3. **Upload failures**
   - Check file size limits (10MB per file)
   - Verify server has write permissions to `uploads/` directory
   - Check network connectivity and timeout settings

## Security Considerations

- Files are isolated to the farm's workspace in `maibarn/`
- Uploaded files cannot access or modify the main MaiFarm codebase
- File types are validated on upload
- Path traversal attacks are prevented through path validation

## Future Enhancements

- [ ] Support for larger files via chunked uploads
- [ ] Image preview in farm creation modal
- [ ] Automatic image optimization and resizing
- [ ] OCR support for text extraction from images
- [ ] Integration with cloud storage services
- [ ] Real-time progress indicators for file processing