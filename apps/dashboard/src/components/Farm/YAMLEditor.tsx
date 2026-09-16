import React from 'react';
import Editor from '@monaco-editor/react';
import { clsx } from 'clsx';

interface YAMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  height?: string;
}

export const YAMLEditor: React.FC<YAMLEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  className,
  height = '400px'
}) => {
  return (
    <div className={clsx('rounded-apple overflow-hidden border border-gray-300 dark:border-gray-600', className)}>
      <Editor
        height={height}
        defaultLanguage="yaml"
        value={value}
        onChange={(val) => onChange(val || '')}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'SF Mono, Monaco, Consolas, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          formatOnPaste: true,
          formatOnType: true,
          renderWhitespace: 'selection',
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true
          }
        }}
      />
    </div>
  );
};