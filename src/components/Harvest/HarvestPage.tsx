import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TerminalContainer } from '../Terminal/TerminalContainer';
import { HarvestTerminal } from './HarvestTerminal';
import { HarvestDashboard } from './HarvestDashboard';
import { Package, ArrowLeft, Loader2, Terminal, LayoutDashboard } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { farmService } from '../../services/farmService';
import { harvestService } from '../../services/harvestService';

export const HarvestPage: React.FC = () => {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [farm, setFarm] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'terminal' | 'dashboard' | 'grid'>('terminal'); // Default to terminal view
  const [hasHarvest, setHasHarvest] = useState(false);
  const [goWildSession, setGoWildSession] = useState<any>(null);
  const [terminalSessions, setTerminalSessions] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | undefined>(farmId);
  const farms = useFarmStore(state => state.farms);
  const activeFarms = farms.filter(f => ['running', 'active', 'harvesting'].includes(f.status));
  const { subscribe } = useWebSocketStore();

  useEffect(() => {
    const targetFarmId = selectedFarmId || farmId;
    if (targetFarmId) {
      // First check local store
      const localFarm = farms.find(f => f.id === targetFarmId);
      if (localFarm) {
        setFarm(localFarm);
        checkHarvestAvailability();
        // Check if this is a Go Wild farm
        if (localFarm.type === 'autonomous' && localFarm.config?.goWildMode?.enabled) {
          fetchGoWildSession();
        }
        // Fetch terminal sessions for this farm
        fetchTerminalSessions(targetFarmId);
      } else {
        // Fetch from server if not in store
        fetchFarm();
      }
    }
  }, [selectedFarmId, farmId, farms]);

  const fetchTerminalSessions = async (targetFarmId: string) => {
    try {
      const response = await fetch(`/api/terminal/sessions?farmId=${encodeURIComponent(targetFarmId)}`);
      if (response.ok) {
        const data = await response.json();
        setTerminalSessions(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching terminal sessions:', error);
    }
  };

  const checkHarvestAvailability = async () => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) return;
    try {
      const harvests = await harvestService.getByFarmId(targetFarmId);
      setHasHarvest(harvests.length > 0);
      // Default to dashboard view if harvest is available
      if (harvests.length > 0 && harvests[0].status === 'ready') {
        setViewMode('dashboard');
      }
    } catch (error) {
      console.error('Error checking harvest:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFarm = async () => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) return;
    
    try {
      const farmData = await farmService.getFarm(targetFarmId);
      setFarm(farmData);
      await checkHarvestAvailability();
      // Check if this is a Go Wild farm
      if (farmData.type === 'autonomous' && farmData.config?.goWildMode?.enabled) {
        fetchGoWildSession();
      }
      // Fetch terminal sessions for this farm
      fetchTerminalSessions(targetFarmId);
    } catch (error) {
      console.error('Error fetching farm:', error);
      // Navigate back to dashboard if farm not found
      navigate('/home');
    } finally {
      setLoading(false);
    }
  };

  const fetchGoWildSession = async () => {
    if (!farmId) return;
    
    try {
      const response = await fetch(`/api/go-wild/session/${farmId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setGoWildSession(data.data);
          console.log('Go Wild session loaded:', data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching Go Wild session:', error);
    }
  };

  // Listen for Go Wild harvest ready events
  useEffect(() => {
    if (!farmId) return;

    const handleHarvestReady = (data: any) => {
      if (data.farmId === farmId && data.type === 'goWild') {
        console.log('Go Wild harvest ready:', data);
        setGoWildSession((prev: any) => ({
          ...prev,
          status: 'completed',
          summary: data.summary
        }));
        // Switch to dashboard view to show results
        setViewMode('dashboard');
        setHasHarvest(true);
      }
    };

    const handleGoWildUpdate = (data: any) => {
      if (data.farmId === farmId) {
        console.log('Go Wild update:', data);
        if (data.type === 'status-changed' && data.data?.status === 'completed') {
          // Fetch the latest harvest data
          checkHarvestAvailability();
        }
      }
    };

    const unsubscribeHarvest = subscribe('harvest:ready', handleHarvestReady);
    const unsubscribeGoWild = subscribe('goWild:status-changed', handleGoWildUpdate);

    return () => {
      unsubscribeHarvest();
      unsubscribeGoWild();
    };
  }, [farmId, subscribe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading harvest view...</p>
        </div>
      </div>
    );
  }

  if (!farm) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">Farm not found</p>
          <button
            onClick={() => navigate('/home')}
            className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 relative z-[5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/home')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {farm.name} - Live Harvest
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Monitor real-time agent activity and outputs
                  {terminalSessions.length > 0 && ` (${terminalSessions.length} sessions)`}
                </p>
              </div>
              
              {/* Farm Selector if multiple active farms */}
              {activeFarms.length > 1 && (
                <select
                  value={selectedFarmId || farmId}
                  onChange={(e) => {
                    setSelectedFarmId(e.target.value);
                    navigate(`/harvest/${e.target.value}`);
                  }}
                  className="ml-4 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {activeFarms.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-apple-lg p-1">
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`p-2 rounded-apple transition-colors ${
                    viewMode === 'dashboard'
                      ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  title="Dashboard View"
                  disabled={!hasHarvest}
                >
                  <LayoutDashboard className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('terminal')}
                  className={`p-2 rounded-apple transition-colors ${
                    viewMode === 'terminal'
                      ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  title="Terminal View"
                >
                  <Terminal className="w-5 h-5" />
                </button>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium
                ${farm.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  farm.status === 'active' ? 'bg-green-300 text-green-800 dark:bg-green-900/30 dark:text-green-500' :
                  farm.status === 'preparing' || farm.status === 'planting' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  farm.status === 'launching' || farm.status === 'planting' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :                  
                  farm.status === 'harvesting' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  farm.status === 'completed' ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                {farm.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'dashboard' && hasHarvest ? (
        <HarvestDashboard 
          farmId={(selectedFarmId || farmId)!}
          farmName={farm.name}
          onComplete={() => navigate('/home')}
        />
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-[1]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Terminal View - Using HarvestTerminal for better grid display */}
            {viewMode === 'terminal' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-8"
              >
                <HarvestTerminal 
                  farmId={selectedFarmId || farmId}
                  className="w-full"
                />
              </motion.div>
            )}

          {/* Farm Info Card */}
          <div className="bg-white dark:bg-gray-900 rounded-apple-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Farm Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Type</p>
                <p className="font-medium text-gray-900 dark:text-white capitalize">
                  {farm.type}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Agents</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {farm.agents?.length || 0} Active
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Created</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {new Date(farm.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            
            {farm.description && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Description</p>
                <p className="text-gray-900 dark:text-white">
                  {farm.description}
                </p>
              </div>
            )}
          </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};