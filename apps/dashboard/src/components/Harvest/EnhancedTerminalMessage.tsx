/**
 * Enhanced Terminal Message Component
 *
 * Renders terminal messages with intelligent syntax highlighting,
 * activity-specific icons, and progress indicators.
 */
import React from 'react';
import {
  Code,
  File,
  Terminal,
  AlertCircle,
  CheckCircle,
  Loader,
  GitBranch,
  Package,
  Search,
  Edit,
  FilePlus,
  FileText,
  Database,
  Globe,
  Activity
} from 'lucide-react';

export interface ParsedActivity {
  type: 'command' | 'file_operation' | 'tool_use' | 'thinking' | 'error' | 'progress' | 'completion';
  content: string;
  metadata: {
    files?: string[];
    tools?: string[];
    command?: string;
    errorLevel?: 'warning' | 'error' | 'critical';
    progress?: number;
    duration?: number;
    fileOperation?: {
      type: 'create' | 'edit' | 'delete' | 'read';
      path: string;
      language?: string;
    };
  };
  timestamp: Date;
  agentId: number;
  agentName: string;
  sessionName: string;
}

interface EnhancedTerminalMessageProps {
  activity: ParsedActivity;
  rawContent?: string;
  showTimestamp?: boolean;
  compact?: boolean;
}

export const EnhancedTerminalMessage: React.FC<EnhancedTerminalMessageProps> = ({
  activity,
  rawContent,
  showTimestamp = false,
  compact = false
}) => {
  /**
   * Get icon based on tool type
   */
  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'read':
        return <FileText className="w-4 h-4" />;
      case 'write':
        return <FilePlus className="w-4 h-4" />;
      case 'edit':
        return <Edit className="w-4 h-4" />;
      case 'bash':
        return <Terminal className="w-4 h-4" />;
      case 'grep':
      case 'glob':
        return <Search className="w-4 h-4" />;
      case 'git':
        return <GitBranch className="w-4 h-4" />;
      case 'npm':
        return <Package className="w-4 h-4" />;
      case 'websearch':
      case 'webfetch':
        return <Globe className="w-4 h-4" />;
      case 'task':
        return <Activity className="w-4 h-4" />;
      default:
        return <Code className="w-4 h-4" />;
    }
  };

  /**
   * Get color classes based on activity type and metadata
   */
  const getColorClasses = () => {
    switch (activity.type) {
      case 'error':
        if (activity.metadata.errorLevel === 'critical') return 'text-red-500 bg-red-500/10';
        if (activity.metadata.errorLevel === 'warning') return 'text-yellow-500 bg-yellow-500/10';
        return 'text-orange-500 bg-orange-500/10';
      case 'tool_use':
        return 'text-blue-400 bg-blue-500/10';
      case 'file_operation':
        return 'text-green-400 bg-green-500/10';
      case 'command':
        return 'text-cyan-400 bg-cyan-500/10';
      case 'progress':
        return 'text-purple-400 bg-purple-500/10';
      case 'completion':
        return 'text-green-500 bg-green-500/10';
      case 'thinking':
        return 'text-gray-400 bg-gray-700/50';
      default:
        return 'text-gray-300';
    }
  };

  /**
   * Format file path for display
   */
  const formatFilePath = (path: string) => {
    // Shorten long paths
    if (path.length > 50) {
      const parts = path.split('/');
      if (parts.length > 3) {
        return `.../${parts.slice(-3).join('/')}`;
      }
    }
    return path;
  };

  /**
   * Render syntax-highlighted command
   */
  const renderCommand = (command: string) => {
    // Highlight command parts
    const parts = command.split(/\s+/);
    const mainCommand = parts[0];
    const args = parts.slice(1);

    // Special highlighting for common commands
    const commandColors: Record<string, string> = {
      'npm': 'text-red-400',
      'git': 'text-orange-400',
      'cd': 'text-blue-400',
      'ls': 'text-green-400',
      'cat': 'text-yellow-400',
      'echo': 'text-purple-400',
      'mkdir': 'text-cyan-400',
      'rm': 'text-red-400',
      'cp': 'text-blue-400',
      'mv': 'text-green-400',
      'grep': 'text-yellow-400',
      'sed': 'text-purple-400',
      'awk': 'text-cyan-400',
      'curl': 'text-orange-400',
      'wget': 'text-orange-400',
      'python': 'text-blue-400',
      'node': 'text-green-400',
      'tsx': 'text-blue-400',
      'tsc': 'text-blue-400'
    };

    const commandColor = commandColors[mainCommand] || 'text-cyan-400';

    return (
      <div className="font-mono text-sm">
        <span className={commandColor}>{mainCommand}</span>
        {args.length > 0 && (
          <span className="text-gray-400"> {args.join(' ')}</span>
        )}
      </div>
    );
  };

  /**
   * Main render by activity type
   */
  const renderByType = () => {
    switch (activity.type) {
      case 'tool_use':
        const tool = activity.metadata.tools?.[0] || 'unknown';
        const files = activity.metadata.files || [];

        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <div className="flex-shrink-0 mt-0.5">{getToolIcon(tool)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                Tool: {tool.charAt(0).toUpperCase() + tool.slice(1)}
              </div>
              {files.length > 0 && (
                <div className="text-xs mt-1 space-y-0.5">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center space-x-1">
                      <File className="w-3 h-3" />
                      <span className="font-mono truncate">{formatFilePath(file)}</span>
                      {activity.metadata.fileOperation && (
                        <span className="text-xs px-1 py-0.5 bg-black/30 rounded">
                          {activity.metadata.fileOperation.type}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activity.metadata.command && (
                <div className="mt-1 p-1 bg-black/30 rounded">
                  {renderCommand(activity.metadata.command)}
                </div>
              )}
            </div>
          </div>
        );

      case 'file_operation':
        const fileOp = activity.metadata.fileOperation;
        if (!fileOp) return null;

        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <FilePlus className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                File {fileOp.type === 'create' ? 'Created' :
                     fileOp.type === 'edit' ? 'Modified' :
                     fileOp.type === 'delete' ? 'Deleted' : 'Read'}
              </div>
              <div className="font-mono text-xs mt-1">
                {formatFilePath(fileOp.path)}
              </div>
              {fileOp.language && (
                <span className="text-xs px-2 py-0.5 bg-black/30 rounded mt-1 inline-block">
                  {fileOp.language}
                </span>
              )}
            </div>
          </div>
        );

      case 'command':
        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <Terminal className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              {renderCommand(activity.metadata.command || activity.content)}
            </div>
          </div>
        );

      case 'error':
        const ErrorIcon = activity.metadata.errorLevel === 'critical'
          ? AlertCircle
          : AlertCircle;

        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <ErrorIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {activity.metadata.errorLevel === 'critical' ? 'Critical Error' :
                 activity.metadata.errorLevel === 'warning' ? 'Warning' : 'Error'}
              </div>
              <div className="text-sm mt-1 font-mono whitespace-pre-wrap">
                {activity.content}
              </div>
            </div>
          </div>
        );

      case 'progress':
        const progress = activity.metadata.progress ?? 0;

        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <Loader className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" />
            <div className="flex-1">
              <div className="text-sm">{activity.content}</div>
              {progress > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'completion':
        return (
          <div className={`flex items-start space-x-2 p-2 rounded ${getColorClasses()}`}>
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Completed</div>
              <div className="text-sm mt-1">{activity.content}</div>
            </div>
          </div>
        );

      case 'thinking':
      default:
        // For thinking and default, show raw content if available, otherwise activity content
        const displayContent = rawContent || activity.content;

        // Skip very short or repetitive content
        if (displayContent.length < 5 || displayContent.match(/^[.\s-_=]+$/)) {
          return null;
        }

        return (
          <div className={`text-sm p-1 ${getColorClasses()} whitespace-pre-wrap font-mono`}>
            {displayContent}
          </div>
        );
    }
  };

  const content = renderByType();

  // Don't render null content
  if (!content) return null;

  return (
    <div className={`terminal-message ${compact ? 'py-0.5' : 'py-1'}`}>
      {showTimestamp && (
        <span className="text-xs text-gray-500 mr-2">
          {new Date(activity.timestamp).toLocaleTimeString()}
        </span>
      )}
      {content}
    </div>
  );
};

export default EnhancedTerminalMessage;