import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Zap, 
  Users, 
  Clock, 
  Target,
  Award,
  Quote,
  Code,
  TrendingUp,
  Activity,
  Brain,
  Heart,
  Lightbulb
} from 'lucide-react';
import { FarmerTemplate, FarmerProfile as IFarmerProfile, FarmerStats } from '@/types/farmers';
import { api } from '@/services/apiClient';
import { FarmerAvatar } from './FarmerAvatar';
import { FarmerPersonality } from './FarmerPersonality';

interface FarmerProfileProps {
  farmer: FarmerTemplate;
  onClose: () => void;
  onUse: () => void;
}

export const FarmerProfile: React.FC<FarmerProfileProps> = ({ farmer, onClose, onUse }) => {
  const [profile, setProfile] = useState<IFarmerProfile | null>(null);
  const [stats, setStats] = useState<FarmerStats | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'template' | 'stats'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFarmerDetails();
  }, [farmer.id]);

  const loadFarmerDetails = async () => {
    try {
      setLoading(true);
      const response = await api.farmers.getById(farmer.id);
      if (response.data.success) {
        setProfile(response.data.data.profile);
        setStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('Failed to load farmer details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryGradient = (category: string) => {
    const gradients = {
      startup: 'from-purple-500 to-pink-500',
      technical: 'from-blue-500 to-cyan-500',
      creative: 'from-pink-500 to-rose-500',
      research: 'from-green-500 to-emerald-500',
      operations: 'from-gray-500 to-slate-500'
    };
    return gradients[category as keyof typeof gradients] || gradients.operations;
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center"
      >
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-screen py-8 px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-apple-lg shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className={`relative bg-gradient-to-br ${getCategoryGradient(farmer.category)} p-8 text-white`}>
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>

            <div className="flex items-start space-x-6">
              <FarmerAvatar
                farmer={farmer}
                profile={profile}
                size="large"
                animated
              />
              
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">{farmer.title}</h1>
                <p className="text-white/90 text-lg mb-4">{farmer.description}</p>
                
                {profile && (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">{profile.nickname}</h3>
                    <p className="text-white/80">{profile.backstory}</p>
                  </div>
                )}

                <div className="flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>{farmer.agents.length} Agents</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span>{Math.ceil((farmer.config.timeout || 3600) / 60)} min</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4" />
                    <span className="capitalize">{farmer.metadata.complexity}</span>
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onUse}
                className="px-4 py-2 bg-white text-gray-900 rounded-apple font-semibold hover:bg-gray-100 transition-colors flex items-center space-x-2"
              >
                <Zap className="w-4 h-4" />
                <span>Use This Farmer</span>
              </motion.button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-800">
            <nav className="flex space-x-8 px-8">
              {[
                { id: 'overview', label: 'Overview', icon: Heart },
                { id: 'agents', label: 'Agents', icon: Users },
                { id: 'template', label: 'Template', icon: Code },
                { id: 'stats', label: 'Performance', icon: Activity }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <OverviewTab farmer={farmer} profile={profile} stats={stats} />
              )}
              {activeTab === 'agents' && (
                <AgentsTab farmer={farmer} />
              )}
              {activeTab === 'template' && (
                <TemplateTab farmer={farmer} />
              )}
              {activeTab === 'stats' && (
                <StatsTab stats={stats} />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Tab Components
const OverviewTab: React.FC<{
  farmer: FarmerTemplate;
  profile: IFarmerProfile | null;
  stats: FarmerStats | null;
}> = ({ farmer, profile, stats }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="space-y-8"
  >
    {profile && (
      <>
        {/* Personality Traits */}
        <FarmerPersonality profile={profile} />

        {/* Quotes */}
        {profile.quotes.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Quote className="w-5 h-5 text-primary-600" />
              <span>Memorable Quotes</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.quotes.map((quote, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-apple border-l-4 border-primary-500"
                >
                  <p className="text-gray-700 dark:text-gray-300 italic">"{quote}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fun Facts */}
        {profile.fun_facts.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <span>Fun Facts</span>
            </h3>
            <div className="space-y-2">
              {profile.fun_facts.map((fact, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <span className="text-yellow-500 mt-1">💡</span>
                  <p className="text-gray-700 dark:text-gray-300">{fact}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        {profile.achievements.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Award className="w-5 h-5 text-yellow-500" />
              <span>Achievements</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`p-4 rounded-apple border-2 ${
                    achievement.unlocked
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-2xl">{achievement.icon}</span>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {achievement.name}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {achievement.description}
                  </p>
                  {achievement.unlocked && achievement.unlockedAt && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )}
  </motion.div>
);

const AgentsTab: React.FC<{ farmer: FarmerTemplate }> = ({ farmer }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="space-y-6"
  >
    <h3 className="text-lg font-semibold mb-4">Agent Team ({farmer.agents.length})</h3>
    <div className="space-y-4">
      {farmer.agents.map((agent, index) => (
        <div
          key={index}
          className="p-6 bg-gray-50 dark:bg-gray-800 rounded-apple border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start space-x-4">
            <div className="text-3xl">{agent.emoji || '🤖'}</div>
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {agent.name}
              </h4>
              <p className="text-gray-600 dark:text-gray-400 mb-3">{agent.role}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{agent.personality}</p>
              
              {agent.capabilities && agent.capabilities.length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Capabilities:
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map((capability, capIndex) => (
                      <span
                        key={capIndex}
                        className="px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm rounded-full"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

const TemplateTab: React.FC<{ farmer: FarmerTemplate }> = ({ farmer }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="space-y-6"
  >
    {/* Initial Prompt */}
    <div>
      <h3 className="text-lg font-semibold mb-4">Initial Prompt</h3>
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-apple border border-gray-200 dark:border-gray-700">
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">
          {farmer.initial_prompt}
        </pre>
      </div>
    </div>

    {/* Steps */}
    {farmer.steps && farmer.steps.length > 0 && (
      <div>
        <h3 className="text-lg font-semibold mb-4">Execution Steps</h3>
        <div className="space-y-3">
          {farmer.steps.map((step, index) => (
            <div key={index} className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <p className="text-gray-700 dark:text-gray-300 flex-1">{step}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Configuration */}
    <div>
      <h3 className="text-lg font-semibold mb-4">Configuration</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
          <p className="text-sm text-gray-600 dark:text-gray-400">Max Agents</p>
          <p className="font-semibold">{farmer.config.maxAgents || 'Auto'}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
          <p className="text-sm text-gray-600 dark:text-gray-400">Timeout</p>
          <p className="font-semibold">{Math.ceil((farmer.config.timeout || 3600) / 60)}m</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
          <p className="text-sm text-gray-600 dark:text-gray-400">Coordination</p>
          <p className="font-semibold capitalize">{farmer.config.coordination || 'Default'}</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
          <p className="text-sm text-gray-600 dark:text-gray-400">Auto Scale</p>
          <p className="font-semibold">{farmer.config.autoScale ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  </motion.div>
);

const StatsTab: React.FC<{ stats: FarmerStats | null }> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No performance data available</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-apple">
          <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.successRate}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
        </div>
        <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-apple">
          <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalUses}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Uses</p>
        </div>
        <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-apple">
          <Clock className="w-8 h-8 text-purple-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.averageDuration}m</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Avg Duration</p>
        </div>
        <div className="text-center p-6 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-apple">
          <Award className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">#{stats.popularityRank}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Popularity Rank</p>
        </div>
      </div>

      {/* Performance Metrics */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Performance Breakdown</h3>
        <div className="space-y-4">
          {Object.entries(stats.performanceMetrics).map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                  {key.replace(/([A-Z])/g, ' $1')}
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{value}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-2 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Use Cases */}
      {stats.topUseCases && stats.topUseCases.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Top Use Cases</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topUseCases.map((useCase, index) => (
              <span
                key={index}
                className="px-3 py-2 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-apple text-sm font-medium"
              >
                {useCase}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};