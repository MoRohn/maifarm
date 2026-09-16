/**
 * Activity Timeline Component
 *
 * Displays a real-time visual timeline of agent activities during farm execution.
 * Shows what each agent is doing with activity icons and progress indicators.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
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
  Activity,
  ChevronDown,
  ChevronRight,
  Zap,
  User
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ParsedActivity } from './EnhancedTerminalMessage';

interface ActivityTimelineProps {
  farmId: string;
  maxActivities?: number;
  compact?: boolean;
}

interface AgentTimeline {
  agentId: number;
  agentName: string;
  activities: ParsedActivity[];
  status: 'idle' | 'thinking' | 'executing' | 'error' | 'completed';
  lastActivity: Date;
  isExpanded: boolean;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  farmId,
  maxActivities = 50,
  compact = false
}) => {
  const [agentTimelines, setAgentTimelines] = useState<Map<number, AgentTimeline>>(new Map());
  const [autoScroll, setAutoScroll] = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('terminal:activities', (data: any) => {
      if (data.farmId === farmId) {
        handleNewActivities(data.agentId, data.agentName, data.activities);
      }
    });

    return unsubscribe;
  }, [farmId, subscribe]);

  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [agentTimelines, autoScroll]);

  const handleNewActivities = (agentId: number, agentName: string, activities: ParsedActivity[]) => {
    setAgentTimelines(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(agentId) || {
        agentId,
        agentName,
        activities: [],
        status: 'idle',
        lastActivity: new Date(),
        isExpanded: true
      };

      // Add new activities
      const updatedActivities = [...existing.activities, ...activities].slice(-maxActivities);

      // Update status based on latest activity
      let newStatus = existing.status;
      if (activities.length > 0) {
        const latest = activities[activities.length - 1];
        switch (latest.type) {
          case 'error':
            newStatus = 'error';
            break;
          case 'completion':
            newStatus = 'completed';
            break;
          case 'tool_use':
          case 'command':
          case 'progress':
            newStatus = 'executing';
            break;
          case 'thinking':
            newStatus = 'thinking';
            break;
        }
      }

      newMap.set(agentId, {
        ...existing,
        activities: updatedActivities,
        status: newStatus,
        lastActivity: new Date()
      });

      return newMap;
    });
  };

  const toggleAgentExpanded = (agentId: number) => {
    setAgentTimelines(prev => {
      const newMap = new Map(prev);
      const timeline = newMap.get(agentId);
      if (timeline) {
        newMap.set(agentId, {
          ...timeline,
          isExpanded: !timeline.isExpanded
        });
      }
      return newMap;
    });
  };

  const getStatusColor = (status: AgentTimeline['status']) => {
    switch (status) {
      case 'idle':
        return 'bg-gray-500';
      case 'thinking':
        return 'bg-yellow-500';
      case 'executing':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      case 'completed':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: AgentTimeline['status']) => {
    switch (status) {
      case 'idle':
        return <Clock className="w-4 h-4" />;
      case 'thinking':
        return <Loader className="w-4 h-4 animate-pulse" />;
      case 'executing':
        return <Zap className="w-4 h-4 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityIcon = (type: ParsedActivity['type']) => {
    switch (type) {
      case 'tool_use':
        return <Code className="w-3 h-3" />;
      case 'file_operation':
        return <File className="w-3 h-3" />;
      case 'command':
        return <Terminal className="w-3 h-3" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-400" />;
      case 'progress':
        return <Loader className="w-3 h-3 text-purple-400" />;
      case 'completion':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      default:
        return <Activity className="w-3 h-3" />;
    }
  };

  const formatActivitySummary = (activity: ParsedActivity): string => {
    switch (activity.type) {
      case 'tool_use':
        const tool = activity.metadata.tools?.[0] || 'tool';
        const files = activity.metadata.files || [];
        if (files.length > 0) {
          const fileName = files[0].split('/').pop() || files[0];
          return `${tool}: ${fileName}`;
        }
        return tool;

      case 'file_operation':
        if (activity.metadata.fileOperation) {
          const op = activity.metadata.fileOperation;
          const fileName = op.path.split('/').pop() || op.path;
          return `${op.type} ${fileName}`;
        }
        return 'File operation';

      case 'command':
        const cmd = activity.metadata.command || activity.content;
        const cmdParts = cmd.split(' ');
        return cmdParts.slice(0, 3).join(' ');

      case 'error':
        return `${activity.metadata.errorLevel || 'Error'}: ${activity.content.slice(0, 50)}`;

      case 'progress':
        return activity.metadata.progress
          ? `Progress: ${activity.metadata.progress}%`
          : activity.content.slice(0, 50);

      case 'completion':
        return 'Task completed';

      default:
        return activity.content.slice(0, 50);
    }
  };

  const sortedTimelines = Array.from(agentTimelines.values()).sort((a, b) => a.agentId - b.agentId);

  if (sortedTimelines.length === 0) {
    return (
      <div className="activity-timeline bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Agent Activity Timeline
          </h3>
        </div>
        <div className="text-center text-gray-500 py-8">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Waiting for agent activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`activity-timeline bg-gray-900 rounded-lg ${compact ? 'p-2' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          Agent Activity Timeline
        </h3>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-xs px-2 py-1 rounded ${
            autoScroll ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
          }`}
        >
          Auto-scroll {autoScroll ? 'ON' : 'OFF'}
        </button>
      </div>

      <div
        ref={timelineRef}
        className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700"
      >
        <AnimatePresence>
          {sortedTimelines.map((timeline) => (
            <motion.div
              key={timeline.agentId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-gray-800 rounded-lg border border-gray-700"
            >
              {/* Agent Header */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/50 transition-colors"
                onClick={() => toggleAgentExpanded(timeline.agentId)}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(timeline.status)} animate-pulse`} />
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-sm">{timeline.agentName}</span>
                    <span className="text-xs text-gray-500">
                      (Agent {timeline.agentId})
                    </span>
                  </div>
                  {getStatusIcon(timeline.status)}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">
                    {timeline.activities.length} activities
                  </span>
                  {timeline.isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Activity List */}
              <AnimatePresence>
                {timeline.isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-gray-700"
                  >
                    <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                      {timeline.activities.length === 0 ? (
                        <div className="text-xs text-gray-500 text-center py-2">
                          No activities yet
                        </div>
                      ) : (
                        <>
                          {/* Show last 10 activities */}
                          {timeline.activities.slice(-10).map((activity, idx) => (
                            <motion.div
                              key={`${activity.timestamp}-${idx}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.02 }}
                              className="flex items-start space-x-2 text-xs"
                            >
                              <span className="text-gray-600 flex-shrink-0 w-12">
                                {new Date(activity.timestamp).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: false
                                })}
                              </span>
                              <div className="flex-shrink-0 mt-0.5">
                                {getActivityIcon(activity.type)}
                              </div>
                              <span className="text-gray-300 truncate flex-1">
                                {formatActivitySummary(activity)}
                              </span>
                            </motion.div>
                          ))}
                          {timeline.activities.length > 10 && (
                            <div className="text-xs text-gray-500 text-center">
                              ... and {timeline.activities.length - 10} more activities
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Activity Stats */}
                    <div className="border-t border-gray-700 px-3 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-4">
                        {/* Count by type */}
                        <div className="flex items-center space-x-1">
                          <File className="w-3 h-3 text-green-400" />
                          <span className="text-gray-400">
                            {timeline.activities.filter(a => a.type === 'file_operation').length}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Terminal className="w-3 h-3 text-cyan-400" />
                          <span className="text-gray-400">
                            {timeline.activities.filter(a => a.type === 'command').length}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Code className="w-3 h-3 text-blue-400" />
                          <span className="text-gray-400">
                            {timeline.activities.filter(a => a.type === 'tool_use').length}
                          </span>
                        </div>
                        {timeline.activities.some(a => a.type === 'error') && (
                          <div className="flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3 text-red-400" />
                            <span className="text-gray-400">
                              {timeline.activities.filter(a => a.type === 'error').length}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-gray-500">
                        Last: {new Date(timeline.lastActivity).toLocaleTimeString()}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Overall Stats */}
      {!compact && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <User className="w-3 h-3 text-gray-400" />
                <span className="text-gray-400">{sortedTimelines.length} agents</span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-gray-400" />
                <span className="text-gray-400">
                  {Array.from(agentTimelines.values()).reduce(
                    (sum, t) => sum + t.activities.length,
                    0
                  )}{' '}
                  total activities
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {sortedTimelines.filter(t => t.status === 'executing').length > 0 && (
                <span className="text-blue-400">
                  {sortedTimelines.filter(t => t.status === 'executing').length} active
                </span>
              )}
              {sortedTimelines.filter(t => t.status === 'completed').length > 0 && (
                <span className="text-green-400">
                  {sortedTimelines.filter(t => t.status === 'completed').length} completed
                </span>
              )}
              {sortedTimelines.filter(t => t.status === 'error').length > 0 && (
                <span className="text-red-400">
                  {sortedTimelines.filter(t => t.status === 'error').length} errors
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;