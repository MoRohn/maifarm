import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, CloudRain, Sun, Cloud, Wind, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { FarmField } from './FarmField';
import { FarmRoad } from './FarmRoad';
import { AgentTerminal } from './AgentTerminal';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFarmStore } from '@/store/farmStore';

// Lazy load weather component for better performance
const FarmWeather = lazy(() => import('./FarmWeather'));

interface FarmAgent {
  id: number;
  name?: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  uid?: string;
}

interface FarmLandscapeProps {
  farmId: string;
  farmName: string;
  agents: FarmAgent[];
  className?: string;
  weather?: 'sunny' | 'cloudy' | 'rainy' | 'stormy';
  onLaunchAgents?: () => void;
}

const cropTypes = ['wheat', 'corn', 'carrots', 'potatoes'] as const;

export const FarmLandscape: React.FC<FarmLandscapeProps> = ({
  farmId,
  farmName,
  agents,
  className,
  weather = 'sunny',
  onLaunchAgents
}) => {
  const [currentWeather, setCurrentWeather] = useState(weather);
  const [timeOfDay, setTimeOfDay] = useState<'dawn' | 'day' | 'dusk' | 'night'>('day');
  const [showBarn, setShowBarn] = useState(true);
  const farms = useFarmStore(state => state.farms);
  const currentFarm = farms.find(f => f.id === farmId);

  // Update time of day based on real time
  useEffect(() => {
    const updateTimeOfDay = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 8) setTimeOfDay('dawn');
      else if (hour >= 8 && hour < 17) setTimeOfDay('day');
      else if (hour >= 17 && hour < 20) setTimeOfDay('dusk');
      else setTimeOfDay('night');
    };

    updateTimeOfDay();
    const interval = setInterval(updateTimeOfDay, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Update weather based on farm status
  useEffect(() => {
    if (currentFarm) {
      switch (currentFarm.status) {
        case 'active':
        case 'running':
          setCurrentWeather('sunny');
          break;
        case 'harvesting':
          setCurrentWeather('cloudy');
          break;
        case 'failed':
        case 'terminated':
          setCurrentWeather('stormy');
          break;
        default:
          setCurrentWeather('sunny');
      }
    }
  }, [currentFarm]);

  const getSkyGradient = () => {
    switch (timeOfDay) {
      case 'dawn':
        return 'from-orange-300 via-pink-300 to-blue-400';
      case 'day':
        return currentWeather === 'stormy' 
          ? 'from-gray-600 via-gray-700 to-gray-800'
          : 'from-blue-400 via-blue-500 to-blue-600';
      case 'dusk':
        return 'from-purple-400 via-pink-400 to-orange-400';
      case 'night':
        return 'from-gray-900 via-blue-900 to-black';
    }
  };

  const getFieldStatus = (agentStatus: string): 'planting' | 'growing' | 'harvesting' | 'harvested' | 'idle' => {
    switch (agentStatus) {
      case 'starting': return 'planting';
      case 'ready': return 'growing';
      case 'working': return 'harvesting';
      case 'idle': return 'harvested';
      default: return 'idle';
    }
  };

  // Calculate grid layout based on number of agents
  const getGridLayout = () => {
    const count = agents.length;
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-1 lg:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 lg:grid-cols-2';
    if (count <= 6) return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3';
    return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
  };

  return (
    <div className={clsx('relative min-h-screen overflow-hidden', className)}>
      {/* Sky Background */}
      <div className={`absolute inset-0 bg-gradient-to-b ${getSkyGradient()} transition-all duration-1000`} />
      
      {/* Weather Effects */}
      <Suspense fallback={null}>
        <FarmWeather weather={currentWeather} intensity={currentWeather === 'stormy' ? 'heavy' : 'light'} />
      </Suspense>

      {/* Barn and Silo */}
      {showBarn && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10"
        >
          <div className="relative">
            {/* Barn */}
            <div className="bg-red-700 w-32 h-24 relative">
              <div className="absolute inset-x-0 bottom-0 h-12 bg-red-800" />
              <div className="absolute -top-8 inset-x-0">
                <div className="w-0 h-0 border-l-[64px] border-r-[64px] border-b-[32px] border-l-transparent border-r-transparent border-b-red-600 mx-auto" />
              </div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <Home className="w-8 h-8 text-white" />
              </div>
            </div>
            
            {/* Silo */}
            <div className="absolute -right-12 top-0 bg-gray-600 w-8 h-28 rounded-t-full">
              <div className="absolute top-2 inset-x-0 h-1 bg-gray-700" />
              <div className="absolute top-6 inset-x-0 h-1 bg-gray-700" />
            </div>
            
            {/* Farm Name Sign */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-amber-700 px-4 py-2 rounded shadow-lg">
              <h2 className="text-white font-bold text-lg">{farmName}</h2>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Farm Grid Container */}
      <div className="relative z-20 pt-32 px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          {/* Top Horizontal Road */}
          <div className="h-12 mb-4">
            <FarmRoad direction="horizontal" showTraffic={agents.some(a => a.status === 'working')} className="w-full h-full" />
          </div>

          {/* Main Grid with Fields and Roads */}
          <div className="relative">
            <div className={clsx('grid gap-8', getGridLayout())}>
              {agents.map((agent, index) => (
                <React.Fragment key={agent.id}>
                  {/* Add vertical road before every other field on larger screens */}
                  {index % 2 === 1 && index < agents.length && (
                    <div className="hidden lg:block absolute h-full w-8" 
                         style={{ 
                           left: `calc(${(index / 2) * 100}% - 1rem)`,
                           top: 0 
                         }}>
                      <FarmRoad direction="vertical" className="w-full h-full" />
                    </div>
                  )}
                  
                  {/* Farm Field with Terminal */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="relative"
                  >
                    <FarmField
                      fieldId={index}
                      agentName={agent.name || `Agent ${index + 1}`}
                      status={getFieldStatus(agent.status)}
                      cropType={cropTypes[index % cropTypes.length]}
                      className="h-[500px]"
                    >
                      <AgentTerminal
                        farmId={farmId}
                        agentId={agent.id}
                        agentName={agent.name}
                        agentUid={agent.uid}
                        status={agent.status}
                        className="h-[420px]"
                      />
                    </FarmField>
                  </motion.div>

                  {/* Add horizontal road after every row */}
                  {(index + 1) % 2 === 0 && index < agents.length - 1 && (
                    <div className="col-span-full h-8 -mx-8">
                      <FarmRoad direction="horizontal" className="w-full h-full" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Intersection points at road crossings */}
            {agents.length > 2 && (
              <div className="absolute hidden lg:block" 
                   style={{ 
                     left: 'calc(50% - 1rem)',
                     top: 'calc(50% - 1rem)'
                   }}>
                <div className="w-16 h-16">
                  <FarmRoad direction="intersection" className="w-full h-full" />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Horizontal Road */}
          <div className="h-12 mt-4">
            <FarmRoad direction="horizontal" className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {agents.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center z-30"
        >
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-8 text-center shadow-xl max-w-md">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Home className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Farm Ready for Agents
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Your digital farm is set up but no agents are working yet. Launch agents to start farming!
            </p>
            <div className="space-y-2">
              <button
                onClick={onLaunchAgents || (() => window.location.reload())}
                className="w-full px-4 py-2 bg-white/20 hover:bg-white/30 dark:bg-gray-800/20 dark:hover:bg-gray-800/30 backdrop-blur-md text-gray-900 dark:text-white rounded-lg transition-all font-medium border border-white/30 dark:border-gray-700/30 shadow-lg"
              >
                Launch Farm Agents
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will start AI agents to work on your farm
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Weather Indicator */}
      <div className="absolute top-8 right-8 z-30">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 shadow-lg"
        >
          <div className="flex items-center space-x-2">
            {currentWeather === 'sunny' && <Sun className="w-5 h-5 text-yellow-500" />}
            {currentWeather === 'cloudy' && <Cloud className="w-5 h-5 text-gray-500" />}
            {currentWeather === 'rainy' && <CloudRain className="w-5 h-5 text-blue-500" />}
            {currentWeather === 'stormy' && <Wind className="w-5 h-5 text-purple-500" />}
            <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
              {currentWeather}
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {timeOfDay === 'dawn' && '🌅 Dawn'}
            {timeOfDay === 'day' && '☀️ Daytime'}
            {timeOfDay === 'dusk' && '🌆 Dusk'}
            {timeOfDay === 'night' && '🌙 Night'}
          </div>
        </motion.div>
      </div>
    </div>
  );
};