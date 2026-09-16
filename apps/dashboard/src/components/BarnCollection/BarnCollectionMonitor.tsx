import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { 
  Activity, 
  Eye, 
  EyeOff, 
  FolderOpen, 
  FileText, 
  Clock, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Settings,
  Download,
  Zap
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

interface CollectionSession {
  workspaceId: string;
  farmId: string;
  agentId?: string;
  isActive: boolean;
  hasPendingCollection: boolean;
  activity?: {
    lastActivity: Date;
    pendingChanges: number;
    statistics: {
      totalFiles: number;
      totalSize: number;
      changeRate: number;
      lastCollection: Date | null;
      productivityScore: number;
    };
  };
  policy?: {
    autoCollect: boolean;
    minChangeThreshold: number;
    idleTimeThreshold: number;
    maxTimeBetweenCollections: number;
  };
}

interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  timestamp: Date;
  size: number;
  category: string;
}

interface CollectionEvent {
  workspaceId: string;
  harvestId?: string;
  filesCollected?: number;
  trigger: {
    type: string;
    reason: string;
    timestamp: Date;
  };
  error?: string;
}

export const BarnCollectionMonitor: React.FC = () => {
  const [collectionSessions, setCollectionSessions] = useState<CollectionSession[]>([]);
  const [recentChanges, setRecentChanges] = useState<FileChange[]>([]);
  const [recentCollections, setRecentCollections] = useState<CollectionEvent[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [patterns, setPatterns] = useState<any[]>([]);
  
  const { socket, connected } = useWebSocket();

  useEffect(() => {
    fetchCollectionData();
    fetchPatterns();
    
    // Subscribe to WebSocket events
    if (socket) {
      socket.on('barn:collection:started', handleCollectionStarted);
      socket.on('barn:collection:stopped', handleCollectionStopped);
      socket.on('barn:file:changed', handleFileChanged);
      socket.on('barn:collection:scheduled', handleCollectionScheduled);
      socket.on('barn:collection:started', handleCollectionStarted);
      socket.on('barn:collection:completed', handleCollectionCompleted);
      socket.on('barn:collection:failed', handleCollectionFailed);
      socket.on('barn:productivity:updated', handleProductivityUpdated);
      
      return () => {
        socket.off('barn:collection:started');
        socket.off('barn:collection:stopped');
        socket.off('barn:file:changed');
        socket.off('barn:collection:scheduled');
        socket.off('barn:collection:started');
        socket.off('barn:collection:completed');
        socket.off('barn:collection:failed');
        socket.off('barn:productivity:updated');
      };
    }
  }, [socket]);

  const fetchCollectionData = async () => {
    try {
      const response = await fetch('/api/barn-collection/collection/active');
      const data = await response.json();
      
      if (data.success) {
        setCollectionSessions(data.data.collection || []);
      }
    } catch (error) {
      console.error('Failed to fetch collection data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPatterns = async () => {
    try {
      const response = await fetch('/api/barn-collection/patterns');
      const data = await response.json();
      
      if (data.success) {
        setPatterns(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch patterns:', error);
    }
  };

  const handleCollectionStarted = (data: any) => {
    fetchCollectionData();
  };

  const handleCollectionStopped = (data: any) => {
    setCollectionSessions(prev => 
      prev.filter(s => s.workspaceId !== data.workspaceId)
    );
  };

  const handleFileChanged = (data: any) => {
    // Update recent changes
    setRecentChanges(prev => [data.change, ...prev].slice(0, 50));
    
    // Update session statistics
    setCollectionSessions(prev => 
      prev.map(s => {
        if (s.workspaceId === data.workspaceId) {
          return {
            ...s,
            activity: {
              ...s.activity!,
              lastActivity: new Date(),
              pendingChanges: (s.activity?.pendingChanges || 0) + 1,
              statistics: data.statistics
            }
          };
        }
        return s;
      })
    );
  };

  const handleCollectionScheduled = (data: any) => {
    setCollectionSessions(prev =>
      prev.map(s => {
        if (s.workspaceId === data.workspaceId) {
          return { ...s, hasPendingCollection: true };
        }
        return s;
      })
    );
  };

  const handleCollectionCompleted = (data: CollectionEvent) => {
    setRecentCollections(prev => [data, ...prev].slice(0, 20));
    
    setCollectionSessions(prev =>
      prev.map(s => {
        if (s.workspaceId === data.workspaceId) {
          return {
            ...s,
            hasPendingCollection: false,
            activity: {
              ...s.activity!,
              pendingChanges: 0,
              statistics: {
                ...s.activity!.statistics,
                lastCollection: new Date()
              }
            }
          };
        }
        return s;
      })
    );
  };

  const handleCollectionFailed = (data: any) => {
    setRecentCollections(prev => [
      { ...data, error: data.error },
      ...prev
    ].slice(0, 20));
  };

  const handleProductivityUpdated = (data: any) => {
    setCollectionSessions(prev =>
      prev.map(s => {
        if (s.workspaceId === data.workspaceId) {
          return {
            ...s,
            activity: {
              ...s.activity!,
              statistics: data.statistics
            }
          };
        }
        return s;
      })
    );
  };

  const triggerManualCollection = async (workspaceId: string) => {
    try {
      const response = await fetch('/api/barn-collection/collection/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, reason: 'Manual trigger from monitor' })
      });
      
      const data = await response.json();
      if (!data.success) {
        console.error('Failed to trigger collection:', data.error);
      }
    } catch (error) {
      console.error('Failed to trigger collection:', error);
    }
  };

  const stopCollection = async (workspaceId: string) => {
    try {
      const response = await fetch('/api/barn-collection/collection/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      
      const data = await response.json();
      if (!data.success) {
        console.error('Failed to stop collection:', data.error);
      }
    } catch (error) {
      console.error('Failed to stop collection:', error);
    }
  };

  const getProductivityColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    if (score >= 20) return 'text-orange-500';
    return 'text-red-500';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'code': return '💻';
      case 'config': return '⚙️';
      case 'output': return '📄';
      case 'temp': return '🗑️';
      default: return '📁';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Barn Collection Monitor</h2>
          <p className="text-gray-600">
            Autonomous workspace collection and file collection system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'destructive'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button onClick={fetchCollectionData} size="sm" variant="outline">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Collection</p>
              <p className="text-2xl font-bold">{collectionSessions.length}</p>
            </div>
            <Eye className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Changes</p>
              <p className="text-2xl font-bold">
                {collectionSessions.reduce((sum, s) => sum + (s.activity?.pendingChanges || 0), 0)}
              </p>
            </div>
            <FileText className="w-8 h-8 text-orange-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Recent Collections</p>
              <p className="text-2xl font-bold">{recentCollections.length}</p>
            </div>
            <Download className="w-8 h-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Patterns</p>
              <p className="text-2xl font-bold">{patterns.filter(p => p.enabled).length}</p>
            </div>
            <Zap className="w-8 h-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Active Collection Sessions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Active Collection Sessions</h3>
        
        {collectionSessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No active collection sessions
          </div>
        ) : (
          <div className="space-y-4">
            {collectionSessions.map(session => (
              <div
                key={session.workspaceId}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">Farm: {session.farmId}</h4>
                      {session.agentId && (
                        <Badge variant="outline">Agent: {session.agentId}</Badge>
                      )}
                      {session.hasPendingCollection && (
                        <Badge variant="warning">Collection Pending</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Files:</span>{' '}
                        <span className="font-medium">
                          {session.activity?.statistics.totalFiles || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Pending Changes:</span>{' '}
                        <span className="font-medium">
                          {session.activity?.pendingChanges || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Change Rate:</span>{' '}
                        <span className="font-medium">
                          {session.activity?.statistics.changeRate || 0}/min
                        </span>
                      </div>
                    </div>

                    {session.activity && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">Productivity Score</span>
                          <span className={`text-sm font-medium ${getProductivityColor(session.activity.statistics.productivityScore)}`}>
                            {session.activity.statistics.productivityScore}%
                          </span>
                        </div>
                        <Progress 
                          value={session.activity.statistics.productivityScore} 
                          className="h-2"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last activity: {session.activity?.lastActivity ? 
                          formatDistanceToNow(new Date(session.activity.lastActivity), { addSuffix: true }) : 
                          'Never'}
                      </div>
                      {session.activity?.statistics.lastCollection && (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Last collection: {formatDistanceToNow(new Date(session.activity.statistics.lastCollection), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerManualCollection(session.workspaceId)}
                      disabled={session.hasPendingCollection}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Collect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => stopCollection(session.workspaceId)}
                    >
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent File Changes */}
      <div className="grid grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent File Changes</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentChanges.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No recent changes</div>
            ) : (
              recentChanges.slice(0, 10).map((change, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{getCategoryIcon(change.category)}</span>
                  <div className="flex-1 truncate">
                    <span className="font-medium">{change.path.split('/').pop()}</span>
                    <Badge 
                      variant={change.type === 'added' ? 'success' : 
                               change.type === 'deleted' ? 'destructive' : 'default'}
                      className="ml-2 text-xs"
                    >
                      {change.type}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(change.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Collections */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Collections</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentCollections.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No recent collections</div>
            ) : (
              recentCollections.slice(0, 10).map((collection, idx) => (
                <div key={idx} className="border-b pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {collection.error ? (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">
                        {collection.trigger.type} Collection
                      </span>
                    </div>
                    {collection.filesCollected !== undefined && (
                      <Badge variant="outline">{collection.filesCollected} files</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{collection.trigger.reason}</p>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(collection.trigger.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Active Patterns */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Active Detection Patterns</h3>
        <div className="grid grid-cols-2 gap-4">
          {patterns.map(pattern => (
            <div key={pattern.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <h4 className="font-medium">{pattern.name}</h4>
                <p className="text-sm text-gray-600">{pattern.description}</p>
              </div>
              <Badge variant={pattern.enabled ? 'success' : 'secondary'}>
                {pattern.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};