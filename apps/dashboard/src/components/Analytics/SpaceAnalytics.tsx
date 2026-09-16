import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Globe, Satellite, Activity, Zap, Database } from 'lucide-react';
import { LineChart } from './Charts/LineChart';
import { BarChart } from './Charts/BarChart';
import { PieChart } from './Charts/PieChart';

interface SpaceAnalyticsProps {
  farmId?: string;
  className?: string;
}

export const SpaceAnalytics: React.FC<SpaceAnalyticsProps> = ({ farmId, className = '' }) => {
  // Mock data for space-themed analytics
  const spaceMetrics = useMemo(() => ({
    totalMissions: 42,
    activeSatellites: 7,
    dataTransmitted: '2.4 TB',
    signalStrength: 98.5,
    orbitalVelocity: '7.8 km/s',
    cosmicDiscoveries: 12
  }), []);

  const missionData = useMemo(() => [{
    label: 'Missions Completed',
    data: [
      { timestamp: new Date('2024-01-01'), value: 5 },
      { timestamp: new Date('2024-02-01'), value: 8 },
      { timestamp: new Date('2024-03-01'), value: 12 },
      { timestamp: new Date('2024-04-01'), value: 7 },
      { timestamp: new Date('2024-05-01'), value: 10 },
      { timestamp: new Date('2024-06-01'), value: 15 }
    ],
    color: 'rgb(59, 130, 246)'
  }], []);

  const satelliteDistribution = useMemo(() => [
    { label: 'LEO', value: 3, color: 'rgba(59, 130, 246, 0.8)' },
    { label: 'MEO', value: 2, color: 'rgba(139, 92, 246, 0.8)' },
    { label: 'GEO', value: 1, color: 'rgba(236, 72, 153, 0.8)' },
    { label: 'Deep Space', value: 1, color: 'rgba(251, 146, 60, 0.8)' }
  ], []);

  return (
    <div className={`space-analytics ${className}`}>
      <motion.div 
        className="bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 rounded-lg p-6 shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <Rocket className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">Space Analytics</h2>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <MetricCard
            icon={<Rocket className="w-4 h-4" />}
            label="Total Missions"
            value={spaceMetrics.totalMissions}
            color="text-blue-400"
          />
          <MetricCard
            icon={<Satellite className="w-4 h-4" />}
            label="Active Satellites"
            value={spaceMetrics.activeSatellites}
            color="text-purple-400"
          />
          <MetricCard
            icon={<Database className="w-4 h-4" />}
            label="Data Transmitted"
            value={spaceMetrics.dataTransmitted}
            color="text-green-400"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" />}
            label="Signal Strength"
            value={`${spaceMetrics.signalStrength}%`}
            color="text-yellow-400"
          />
          <MetricCard
            icon={<Zap className="w-4 h-4" />}
            label="Orbital Velocity"
            value={spaceMetrics.orbitalVelocity}
            color="text-orange-400"
          />
          <MetricCard
            icon={<Globe className="w-4 h-4" />}
            label="Discoveries"
            value={spaceMetrics.cosmicDiscoveries}
            color="text-pink-400"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/30 backdrop-blur-sm rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Mission Timeline</h3>
            <LineChart data={missionData} height={200} showLegend={false} />
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Satellite Distribution</h3>
            <PieChart data={satelliteDistribution} height={200} showLabels={true} />
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-6 flex items-center justify-between text-xs text-gray-400">
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
          {farmId && <span>Farm ID: {farmId}</span>}
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            All systems operational
          </span>
        </div>
      </motion.div>
    </div>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, color }) => (
  <motion.div 
    className="bg-black/30 backdrop-blur-sm rounded-lg p-3 border border-white/10"
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    <div className={`${color} mb-1`}>{icon}</div>
    <div className="text-xs text-gray-400">{label}</div>
    <div className="text-lg font-bold text-white">{value}</div>
  </motion.div>
);

export default SpaceAnalytics;