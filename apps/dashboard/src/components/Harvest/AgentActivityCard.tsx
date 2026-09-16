import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * Agent activity interfaces (matching server-side types)
 */
interface ParsedActivity {
  type: 'command' | 'file_operation' | 'tool_use' | 'thinking' | 'error' | 'progress' | 'completion';
  content: string;
  metadata: {
    files?: string[];
    tools?: string[];
    command?: string;
    errorLevel?: 'warning' | 'error' | 'critical';
    progress?: number;
    duration?: number;
  };
  timestamp: Date;
  agentId: number;
  sessionName: string;
}

interface AgentActivity {
  agentId: number;
  agentName: string;
  sessionName: string;
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'error';
  currentTask: {
    type: 'file_edit' | 'command' | 'search' | 'analysis' | 'coordination' | 'tool_use';
    description: string;
    progress?: number;
    startTime: Date;
  } | null;
  recentActions: ParsedActivity[];
  metrics: {
    filesModified: number;
    commandsRun: number;
    toolsUsed: number;
    errorsEncountered: number;
    tasksCompleted: number;
  };
  lastUpdate: Date;
}

interface AgentActivityCardProps {
  activity: AgentActivity;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showTerminal?: () => void;
  compact?: boolean;
}

/**
 * Get status badge variant and color
 */
function getStatusConfig(status: AgentActivity['status']) {
  switch (status) {
    case 'idle':
      return { variant: 'secondary' as const, color: 'bg-gray-500', icon: '⏸️' };
    case 'thinking':
      return { variant: 'default' as const, color: 'bg-blue-500', icon: '🤔' };
    case 'executing':
      return { variant: 'default' as const, color: 'bg-green-500', icon: '⚡' };
    case 'waiting':
      return { variant: 'secondary' as const, color: 'bg-yellow-500', icon: '⏳' };
    case 'completed':
      return { variant: 'default' as const, color: 'bg-green-600', icon: '✅' };
    case 'error':
      return { variant: 'destructive' as const, color: 'bg-red-500', icon: '❌' };
    default:
      return { variant: 'secondary' as const, color: 'bg-gray-500', icon: '❓' };
  }
}

/**
 * Get activity type icon
 */
function getActivityIcon(type: ParsedActivity['type']): string {
  switch (type) {
    case 'command':
      return '⚡';
    case 'file_operation':
    case 'tool_use':
      return '📝';
    case 'thinking':
      return '💭';
    case 'error':
      return '❌';
    case 'progress':
      return '📊';
    case 'completion':
      return '✅';
    default:
      return '📄';
  }
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

/**
 * Truncate long text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Agent Activity Card Component
 */
export const AgentActivityCard: React.FC<AgentActivityCardProps> = ({
  activity,
  isExpanded = false,
  onToggleExpand,
  showTerminal,
  compact = false
}) => {
  const [showActions, setShowActions] = useState(false);
  const statusConfig = getStatusConfig(activity.status);

  // Calculate time since last update
  const timeSinceUpdate = formatRelativeTime(activity.lastUpdate);

  return (
    <Card className="w-full transition-all duration-200 hover:shadow-md border-l-4 border-l-blue-500">
      <CardHeader className={`pb-2 ${compact ? 'py-3' : 'py-4'}`}>
        <div className="flex items-center justify-between">
          {/* Agent Header */}
          <div className="flex items-center gap-3">
            {/* Status Indicator */}
            <div className={`w-3 h-3 rounded-full ${statusConfig.color} animate-pulse`} />
            
            {/* Agent Name & ID */}
            <div>
              <h3 className={`font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
                {activity.agentName}
              </h3>
              <p className="text-xs text-gray-500">Agent {activity.agentId}</p>
            </div>
          </div>

          {/* Status Badge & Controls */}
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig.variant} className="text-xs">
              {statusConfig.icon} {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
            </Badge>
            
            {/* Expand/Collapse Button */}
            {onToggleExpand && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleExpand}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Current Task */}
        {activity.currentTask && (
          <div className="mt-2 p-2 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between">
              <p className={`text-gray-700 ${compact ? 'text-xs' : 'text-sm'}`}>
                <span className="font-medium">Current:</span> {activity.currentTask.description}
              </p>
              {activity.currentTask.progress !== undefined && (
                <span className="text-xs text-gray-500">{activity.currentTask.progress}%</span>
              )}
            </div>
            
            {/* Progress Bar */}
            {activity.currentTask.progress !== undefined && (
              <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${activity.currentTask.progress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className={compact ? 'pt-0 pb-3' : 'pt-0'}>
        {/* Metrics Row */}
        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
          <div className="flex gap-4">
            <span>📝 {activity.metrics.filesModified}</span>
            <span>⚡ {activity.metrics.commandsRun}</span>
            <span>🛠️ {activity.metrics.toolsUsed}</span>
            {activity.metrics.errorsEncountered > 0 && (
              <span className="text-red-600">❌ {activity.metrics.errorsEncountered}</span>
            )}
          </div>
          <span>{timeSinceUpdate}</span>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-3 border-t pt-3">
            {/* Recent Actions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900">Recent Activity</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowActions(!showActions)}
                  className="text-xs"
                >
                  {showActions ? 'Hide' : 'Show'} Details
                </Button>
              </div>
              
              {showActions && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activity.recentActions.slice(0, 5).map((action, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 bg-gray-50 rounded text-xs"
                    >
                      <span className="text-base leading-none">{getActivityIcon(action.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 break-words">
                          {truncate(action.content, 100)}
                        </p>
                        {action.metadata.files && action.metadata.files.length > 0 && (
                          <p className="text-gray-500 mt-1">
                            Files: {action.metadata.files.join(', ')}
                          </p>
                        )}
                        <p className="text-gray-400 mt-1">
                          {formatRelativeTime(action.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {activity.recentActions.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No recent activity</p>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {showTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={showTerminal}
                  className="text-xs"
                >
                  View Terminal
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                disabled // Placeholder for future functionality
              >
                View History
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AgentActivityCard;