import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { AlertCircle, CheckCircle, Info, Zap } from 'lucide-react';
import { YamlValidationResult, ValidationError, ValidationWarning } from '../../types/yaml';
import { yamlValidator } from '../../services/yamlValidator';
import { debounce } from 'lodash';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidation?: (result: YamlValidationResult) => void;
  height?: string;
  readOnly?: boolean;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({
  value,
  onChange,
  onValidation,
  height = '500px',
  readOnly = false
}) => {
  const [validation, setValidation] = useState<YamlValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateYaml = useCallback(async (content: string) => {
    setIsValidating(true);
    try {
      const result = await yamlValidator.validate(content);
      setValidation(result);
      onValidation?.(result);
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  }, [onValidation]);

  const debouncedValidate = useCallback(
    debounce((content: string) => {
      validateYaml(content);
    }, 500),
    [validateYaml]
  );

  useEffect(() => {
    if (value) {
      debouncedValidate(value);
    }
  }, [value, debouncedValidate]);

  const handleEditorChange = (newValue: string | undefined) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  };

  const editorOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on' as const,
    renderWhitespace: 'selection' as const,
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    formatOnType: true,
    automaticLayout: true,
    readOnly
  };

  const getMarkers = () => {
    if (!validation) return [];

    const markers: any[] = [];

    validation.errors.forEach((error: ValidationError) => {
      if (error.line) {
        markers.push({
          startLineNumber: error.line,
          startColumn: error.column || 1,
          endLineNumber: error.line,
          endColumn: error.column ? error.column + 1 : 1000,
          message: error.message,
          severity: 8 // Error
        });
      }
    });

    validation.warnings.forEach((warning: ValidationWarning) => {
      if (warning.line) {
        markers.push({
          startLineNumber: warning.line,
          startColumn: warning.column || 1,
          endLineNumber: warning.line,
          endColumn: warning.column ? warning.column + 1 : 1000,
          message: warning.message,
          severity: 4 // Warning
        });
      }
    });

    return markers;
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    // Configure YAML language
    monaco.languages.setMonarchTokensProvider('yaml', {
      tokenizer: {
        root: [
          [/^(\s*)(-\s+)?(\w+)(:)/, ['', 'keyword', 'type', 'delimiter']],
          [/:\s*$/, 'delimiter'],
          [/\$\{\{[\w.]+\}\}/, 'variable'],
          [/#.*$/, 'comment'],
          [/".*?"/, 'string'],
          [/'.*?'/, 'string'],
          [/\b(true|false|null)\b/, 'keyword'],
          [/\b\d+\b/, 'number'],
          [/[[\]{}()]/, 'delimiter']
        ]
      }
    });

    // Set markers for errors and warnings
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'yaml-validator', getMarkers());
    }
  };

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        {isValidating && (
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-md">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Validating...</span>
          </div>
        )}
        {!isValidating && validation && (
          <div className="flex items-center gap-2">
            {validation.isValid ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-md">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-700 dark:text-green-300">Valid</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-100 dark:bg-red-900 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm text-red-700 dark:text-red-300">
                  {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900 rounded-md">
                <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {validation.suggestions.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-md">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  {validation.suggestions.length} suggestion{validation.suggestions.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <Editor
        height={height}
        defaultLanguage="yaml"
        value={value}
        onChange={handleEditorChange}
        options={editorOptions}
        onMount={handleEditorMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }
      />

      {validation && !validation.isValid && (
        <div className="mt-4 space-y-2">
          {validation.errors.map((error, index) => (
            <div
              key={`error-${error.path || index}-${index}`}
              className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800"
            >
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {error.path && <span className="font-mono">{error.path}: </span>}
                  {error.message}
                </p>
                {error.line && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Line {error.line}{error.column && `, Column ${error.column}`}
                  </p>
                )}
              </div>
            </div>
          ))}

          {validation.warnings.map((warning, index) => (
            <div
              key={`warning-${warning.path || index}-${index}`}
              className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-200 dark:border-yellow-800"
            >
              <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {warning.path && <span className="font-mono">{warning.path}: </span>}
                  {warning.message}
                </p>
                {warning.line && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Line {warning.line}{warning.column && `, Column ${warning.column}`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {validation && validation.suggestions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Optimization Suggestions
          </h4>
          <div className="space-y-2">
            {validation.suggestions.map((suggestion, index) => (
              <div
                key={`suggestion-${suggestion.type}-${index}`}
                className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800"
              >
                <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      suggestion.type === 'security' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                      suggestion.type === 'performance' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      suggestion.type === 'cost' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    }`}>
                      {suggestion.type}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      suggestion.impact === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                      suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {suggestion.impact} impact
                    </span>
                    {suggestion.autoFixAvailable && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        Auto-fix available
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    {suggestion.message}
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    {suggestion.suggestion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};