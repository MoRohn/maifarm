import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import ProgressDashboard from './ProgressDashboard';
import ActivityFeed from './ActivityFeed';
import TerminalDrawer from './TerminalDrawer';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  ArrowLeftIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EyeIcon,
  CogIcon,
  CommandLineIcon,
  ChartBarSquareIcon
} from '@heroicons/react/24/outline';

interface StructuredHarvestPageProps {
  // Optional props for when used as embedded component
  sessionName?: string;
  farmId?: string;
  farmName?: string;
  onBack?: () => void;
}

/**
 * View modes for the structured harvest interface
 */
type ViewMode = 'dashboard' | 'activity' | 'hybrid';
type ActivityViewMode = 'cards' | 'list' | 'compact';

/**
 * Structured Harvest Page - New approach to viewing agent work
 * Replaces terminal-only view with structured, semantic information
 */
export const StructuredHarvestPage: React.FC<StructuredHarvestPageProps> = ({
  sessionName: propSessionName,
  farmId: propFarmId,
  farmName: propFarmName,
  onBack
}) => {
  const params = useParams<{ farmId: string; sessionName?: string }>();
  const navigate = useNavigate();

  // Use props or params for session info
  const sessionName = propSessionName || params.sessionName || params.farmId || '';
  const farmId = propFarmId || params.farmId;
  const farmName = propFarmName || `Farm ${sessionName}`;

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('hybrid');
  const [activityViewMode, setActivityViewMode] = useState<ActivityViewMode>('cards');
  const [isTerminalDrawerOpen, setIsTerminalDrawerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>();
  const [farmStartTime, setFarmStartTime] = useState<Date>(new Date());
  const [isPaused, setIsPaused] = useState(false);

  // WebSocket connection
  const { socket, isConnected } = useWebSocket();

  // Initialize farm start time
  useEffect(() => {
    // In a real app, this would come from farm metadata
    setFarmStartTime(new Date());
  }, [sessionName]);

  // Handle navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  // Handle showing specific agent (opens terminal drawer)
  const handleShowAgent = (agentId: number) => {
    setSelectedAgentId(agentId);
    setIsTerminalDrawerOpen(true);
  };

  // Handle showing activity feed
  const handleShowActivityFeed = () => {
    setViewMode('activity');
  };

  // Handle farm control actions (placeholders)
  const handlePauseFarm = () => {
    setIsPaused(true);
    // TODO: Implement actual farm pause logic
    console.log('Pausing farm:', sessionName);
  };

  const handleResumeFarm = () => {
    setIsPaused(false);
    // TODO: Implement actual farm resume logic
    console.log('Resuming farm:', sessionName);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Fixed to not overlap main header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-16 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Navigation */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="flex items-center gap-2"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </Button>
              
              <div className="border-l border-gray-300 pl-4">
                <h1 className="text-xl font-bold text-gray-900">{farmName}</h1>
                <p className="text-sm text-gray-500">
                  Session: {sessionName} • {isConnected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>

            {/* View Controls */}
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'dashboard' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode('dashboard')}
                  className="rounded-r-none px-3"
                >
                  <ChartBarSquareIcon className="h-4 w-4 mr-1" />
                  Dashboard
                </Button>
                <Button
                  variant={viewMode === 'activity' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode('activity')}
                  className="rounded-none px-3"
                >
                  <ListBulletIcon className="h-4 w-4 mr-1" />
                  Activity
                </Button>
                <Button
                  variant={viewMode === 'hybrid' ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode('hybrid')}
                  className="rounded-l-none px-3"
                >
                  <Squares2X2Icon className="h-4 w-4 mr-1" />
                  Both
                </Button>
              </div>

              {/* Terminal Toggle */}
              <Button
                variant={isTerminalDrawerOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setIsTerminalDrawerOpen(!isTerminalDrawerOpen)}
              >
                <CommandLineIcon className="h-4 w-4 mr-1" />
                Terminal
              </Button>

              {/* Settings (placeholder) */}
              <Button variant="ghost" size="sm">
                <CogIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Connection Warning */}
        {!isConnected && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-yellow-800">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <p className="text-sm">
                  Reconnecting to session... Some data may be delayed.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dashboard View */}
        {(viewMode === 'dashboard' || viewMode === 'hybrid') && (
          <ProgressDashboard
            sessionName={sessionName}
            farmId={farmId}
            farmName={farmName}
            startTime={farmStartTime}
            onShowActivityFeed={handleShowActivityFeed}
            onShowAgent={handleShowAgent}
            onPauseFarm={handlePauseFarm}
            onResumeFarm={handleResumeFarm}
            isPaused={isPaused}
          />
        )}

        {/* Activity Feed View */}
        {(viewMode === 'activity' || viewMode === 'hybrid') && (
          <div className="space-y-4">
            {viewMode === 'hybrid' && (
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Agent Activity</h2>
                
                {/* Activity View Controls */}
                <div className="flex border rounded-md">
                  <Button
                    variant={activityViewMode === 'cards' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActivityViewMode('cards')}
                    className="rounded-r-none px-2"
                  >
                    <Squares2X2Icon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={activityViewMode === 'list' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActivityViewMode('list')}
                    className="rounded-none px-2"
                  >
                    <ListBulletIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={activityViewMode === 'compact' ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActivityViewMode('compact')}
                    className="rounded-l-none px-2"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            <ActivityFeed
              sessionName={sessionName}
              farmId={farmId}
              onShowTerminal={handleShowAgent}
              viewMode={activityViewMode}
              autoRefresh={true}
            />
          </div>
        )}

        {/* Empty State for disconnected/no data */}
        {!isConnected && viewMode !== 'hybrid' && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <ChartBarSquareIcon className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Connecting to Farm</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Establishing connection to {sessionName}... Please wait.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="mt-4"
                >
                  Retry Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Terminal Drawer - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <TerminalDrawer
          sessionName={sessionName}
          farmId={farmId}
          isOpen={isTerminalDrawerOpen}
          onToggle={() => setIsTerminalDrawerOpen(!isTerminalDrawerOpen)}
          selectedAgentId={selectedAgentId}
          onAgentSelect={setSelectedAgentId}
          height="medium"
          theme="dark"
        />
      </div>

      {/* Spacer to prevent content from being hidden behind terminal drawer */}
      {isTerminalDrawerOpen && <div className="h-80" />}
    </div>
  );
};

export default StructuredHarvestPage;