import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectItem } from '../ui/select';
import AgentActivityCard from './AgentActivityCard';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  EyeIcon,
  ListBulletIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline';

/**
 * Types matching server-side interfaces
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

interface ActivityFeedProps {
  sessionName: string;
  farmId?: string;
  onShowTerminal?: (agentId: number) => void;
  viewMode?: 'cards' | 'list' | 'compact';
  autoRefresh?: boolean;
}

/**
 * Filter and sort options
 */
const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active (Executing/Thinking)' },
  { value: 'idle', label: 'Idle' },
  { value: 'executing', label: 'Executing' },
  { value: 'thinking', label: 'Thinking' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' },
  { value: 'error', label: 'Errors' }
];

const TASK_TYPE_FILTERS = [
  { value: 'all', label: 'All Tasks' },
  { value: 'file_edit', label: 'File Operations' },
  { value: 'command', label: 'Commands' },
  { value: 'search', label: 'Search' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'coordination', label: 'Coordination' },
  { value: 'tool_use', label: 'Tool Usage' }
];

const SORT_OPTIONS = [
  { value: 'activity', label: 'Recent Activity' },
  { value: 'agentId', label: 'Agent ID' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' }
];

/**
 * Activity Feed Component
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  sessionName,
  farmId,
  onShowTerminal,
  viewMode = 'cards',
  autoRefresh = true
}) => {
  // State
  const [agentActivities, setAgentActivities] = useState<Map<number, AgentActivity>>(new Map());
  const [expandedAgents, setExpandedAgents] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('activity');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // WebSocket connection
  const { socket, isConnected } = useWebSocket();

  // Connect to session events
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join session room for activity updates
    socket.emit('terminal:join_session', { sessionId: sessionName, farmId });

    // Listen for agent activity updates
    const handleAgentActivity = (data: {
      agentId: number;
      agentName: string;
      activities: ParsedActivity[];
    }) => {
      setAgentActivities(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.agentId);
        
        if (existing) {
          // Update existing agent with new activities
          const updatedAgent = {
            ...existing,
            recentActions: [
              ...data.activities,
              ...existing.recentActions.slice(0, 10 - data.activities.length)
            ],
            lastUpdate: new Date()
          };
          updated.set(data.agentId, updatedAgent);
        }
        
        return updated;
      });
    };

    // Listen for agent status updates
    const handleAgentStatus = (data: {
      agentActivity: AgentActivity;
    }) => {
      setAgentActivities(prev => {
        const updated = new Map(prev);
        updated.set(data.agentActivity.agentId, {
          ...data.agentActivity,
          lastUpdate: new Date(data.agentActivity.lastUpdate)
        });
        return updated;
      });
    };

    socket.on('agent:activity', handleAgentActivity);
    socket.on('agent:status', handleAgentStatus);

    // Cleanup
    return () => {
      socket.off('agent:activity', handleAgentActivity);
      socket.off('agent:status', handleAgentStatus);
      socket.emit('terminal:leave_session', { sessionId: sessionName });
    };
  }, [socket, isConnected, sessionName, farmId]);

  // Filter and sort agents
  const filteredAndSortedAgents = useMemo(() => {
    let agents = Array.from(agentActivities.values());

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      agents = agents.filter(agent =>
        agent.agentName.toLowerCase().includes(query) ||
        agent.currentTask?.description.toLowerCase().includes(query) ||
        agent.recentActions.some(action => 
          action.content.toLowerCase().includes(query)
        )
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        agents = agents.filter(agent => 
          agent.status === 'executing' || agent.status === 'thinking'
        );
      } else {
        agents = agents.filter(agent => agent.status === statusFilter);
      }
    }

    // Filter by task type
    if (taskTypeFilter !== 'all') {
      agents = agents.filter(agent => 
        agent.currentTask?.type === taskTypeFilter
      );
    }

    // Sort agents
    agents.sort((a, b) => {
      switch (sortBy) {
        case 'agentId':
          return a.agentId - b.agentId;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'progress':
          const aProgress = a.currentTask?.progress || 0;
          const bProgress = b.currentTask?.progress || 0;
          return bProgress - aProgress;
        case 'activity':
        default:
          return b.lastUpdate.getTime() - a.lastUpdate.getTime();
      }
    });

    return agents;
  }, [agentActivities, searchQuery, statusFilter, taskTypeFilter, sortBy]);

  // Toggle agent expansion
  const toggleAgentExpanded = (agentId: number) => {
    setExpandedAgents(prev => {
      const updated = new Set(prev);
      if (updated.has(agentId)) {
        updated.delete(agentId);
      } else {
        updated.add(agentId);
      }
      return updated;
    });
  };

  // Get activity stats
  const activityStats = useMemo(() => {
    const agents = Array.from(agentActivities.values());
    return {
      total: agents.length,
      active: agents.filter(a => a.status === 'executing' || a.status === 'thinking').length,
      errors: agents.reduce((sum, a) => sum + a.metrics.errorsEncountered, 0),
      completed: agents.filter(a => a.status === 'completed').length
    };
  }, [agentActivities]);

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Agent Activity Feed</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Session: {sessionName} • {activityStats.total} agents • {activityStats.active} active
              </p>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-xs">
              ⚡ {activityStats.active} Active
            </Badge>
            <Badge variant="outline" className="text-xs">
              ✅ {activityStats.completed} Completed
            </Badge>
            {activityStats.errors > 0 && (
              <Badge variant="destructive" className="text-xs">
                ❌ {activityStats.errors} Errors
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-2 flex-1 min-w-64">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search agents, tasks, or activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Filters
            </Button>

            {/* View Mode Toggle */}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'cards' ? "default" : "ghost"}
                size="sm"
                onClick={() => {}} // Handled by parent
                className="rounded-r-none"
              >
                <Squares2X2Icon className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? "default" : "ghost"}
                size="sm"
                onClick={() => {}} // Handled by parent
                className="rounded-none"
              >
                <ListBulletIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'compact' ? "default" : "ghost"}
                size="sm"
                onClick={() => {}} // Handled by parent
                className="rounded-l-none"
              >
                <EyeIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filters Row */}
          {showFilters && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t">
              <Select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-48"
              >
                {STATUS_FILTERS.map(filter => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </Select>

              <Select 
                value={taskTypeFilter} 
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                className="w-48"
              >
                {TASK_TYPE_FILTERS.map(filter => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </Select>

              <Select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="w-48"
              >
                {SORT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setTaskTypeFilter('all');
                  setSortBy('activity');
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ArrowPathIcon className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading agent activities...</p>
            </CardContent>
          </Card>
        ) : filteredAndSortedAgents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-gray-500">
                {agentActivities.size === 0 
                  ? 'No agent activities yet. Waiting for agents to start...'
                  : 'No agents match the current filters.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className={`grid gap-4 ${
            viewMode === 'compact' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
              : 'grid-cols-1'
          }`}>
            {filteredAndSortedAgents.map((agent) => (
              <AgentActivityCard
                key={agent.agentId}
                activity={agent}
                isExpanded={expandedAgents.has(agent.agentId)}
                onToggleExpand={() => toggleAgentExpanded(agent.agentId)}
                showTerminal={onShowTerminal ? () => onShowTerminal(agent.agentId) : undefined}
                compact={viewMode === 'compact'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;