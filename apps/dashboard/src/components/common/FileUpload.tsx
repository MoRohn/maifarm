import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CloudArrowUpIcon, 
  DocumentIcon, 
  XMarkIcon,
  PhotoIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

interface FileUploadProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeInMB?: number;
  acceptedTypes?: string[];
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFilesChange,
  maxFiles = 10,
  maxSizeInMB = 10,
  acceptedTypes = ['*'],
  className
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return PhotoIcon;
    if (type.includes('code') || type.includes('javascript') || type.includes('python')) return CodeBracketIcon;
    if (type.includes('text') || type.includes('document')) return DocumentTextIcon;
    return DocumentIcon;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    // Check file size
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      return `File "${file.name}" exceeds maximum size of ${maxSizeInMB}MB`;
    }

    // Check file type if specific types are required
    if (acceptedTypes[0] !== '*' && !acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const baseType = type.slice(0, -2);
        return file.type.startsWith(baseType);
      }
      return file.type === type || file.name.endsWith(type);
    })) {
      return `File type "${file.type}" is not accepted`;
    }

    return null;
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    setError(null);
    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    // Check max files limit
    if (uploadedFiles.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    Array.from(files).forEach(file => {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
      } else {
        // Check for duplicates
        const isDuplicate = uploadedFiles.some(f => 
          f.name === file.name && f.size === file.size
        );
        
        if (!isDuplicate) {
          const uploadedFile: UploadedFile = {
            id: `${Date.now()}-${Math.random()}`,
            file,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream'
          };

          // Generate preview for images
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setUploadedFiles(prev => 
                prev.map(f => f.id === uploadedFile.id 
                  ? { ...f, preview: reader.result as string }
                  : f
                )
              );
            };
            reader.readAsDataURL(file);
          }

          newFiles.push(uploadedFile);
        }
      }
    });

    if (errors.length > 0) {
      setError(errors.join(', '));
    }

    if (newFiles.length > 0) {
      const updatedFiles = [...uploadedFiles, ...newFiles];
      setUploadedFiles(updatedFiles);
      onFilesChange(updatedFiles.map(f => f.file));
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeFile = (id: string) => {
    const updatedFiles = uploadedFiles.filter(f => f.id !== id);
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles.map(f => f.file));
  };

  const clearAll = () => {
    setUploadedFiles([]);
    onFilesChange([]);
    setError(null);
  };

  return (
    <div className={clsx('w-full', className)}>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          'relative border-2 border-dashed rounded-lg p-6 transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500',
          'hover:bg-gray-50 dark:hover:bg-gray-800'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          accept={acceptedTypes.join(',')}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <CloudArrowUpIcon className={clsx(
            'w-12 h-12 transition-colors',
            isDragging 
              ? 'text-purple-600 dark:text-purple-400' 
              : 'text-gray-400 dark:text-gray-500'
          )} />
          
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragging ? 'Drop files here' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {acceptedTypes[0] === '*' 
                ? `Any file type • Max ${maxSizeInMB}MB per file`
                : `${acceptedTypes.join(', ')} • Max ${maxSizeInMB}MB per file`
              }
            </p>
            {maxFiles > 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Up to {maxFiles} files • {uploadedFiles.length}/{maxFiles} uploaded
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Attached Files ({uploadedFiles.length})
            </h4>
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>

          <AnimatePresence>
            {uploadedFiles.map(file => {
              const FileIcon = getFileIcon(file.type);
              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center space-x-3">
                    {file.preview ? (
                      <img 
                        src={file.preview} 
                        alt={file.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <FileIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                    )}
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-xs">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <XMarkIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-3 flex items-start space-x-2">
        <PaperClipIcon className="w-4 h-4 text-gray-400 mt-0.5" />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Attach files to provide additional context for your AI agents. 
          Files will be analyzed and used to enhance the agents' understanding of your task.
        </p>
      </div>
    </div>
  );
};

export default FileUpload;