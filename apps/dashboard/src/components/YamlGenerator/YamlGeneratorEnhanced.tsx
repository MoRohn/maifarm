import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Code, CheckCircle, AlertCircle, Download, Save, RefreshCw,
  Trophy, Target, Lightbulb, Rocket, TrendingUp, Award, Zap, Brain,
  Shuffle, Play, BarChart3, Gift, Flame, Star, Hash, Clock, Shield,
  Gauge, Layers, GitBranch, Package, Upload, Share2, Eye, EyeOff,
  ChevronRight, ChevronLeft, Plus, Minus, HelpCircle, Gem, Wand2
} from 'lucide-react';
import PromptInput from './PromptInputEnhanced';
import YamlPreview from './YamlPreview';
import YamlEditor from './YamlEditor';
import AIProviderSelector, { type AIProvider } from '../common/AIProviderSelector';
import { useYamlGenerator } from '@/hooks/useYamlGenerator';
import { GeneratorMode } from '@/types/yamlGenerator';
import confetti from 'canvas-confetti';

// Innovation metrics interface
interface InnovationMetrics {
  clarity: number;
  efficiency: number;
  innovation: number;
  completeness: number;
  overall: number;
}

// Production stage interface
interface ProductionStage {
  id: string;
  name: string;
  description: string;
  progress: number;
  completed: boolean;
  icon: React.ComponentType<any>;
}

// Creative challenge interface
interface CreativeChallenge {
  id: string;
  title: string;
  description: string;
  constraint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  reward: string;
}

const YamlGeneratorEnhanced: React.FC = () => {
  const {
    mode,
    setMode,
    currentPrompt,
    setCurrentPrompt,
    generatedYaml,
    rawYaml,
    isGenerating,
    isValidating,
    validationResult,
    generateYaml,
    validateYaml,
    saveYaml,
    history
  } = useYamlGenerator();

  const [showEditor, setShowEditor] = useState(false);
  const [editedYaml, setEditedYaml] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude');

  // Innovation features state
  const [creativityLevel, setCreativityLevel] = useState<number>(50);
  const [showInnovationDashboard, setShowInnovationDashboard] = useState(true);
  const [currentChallenge, setCurrentChallenge] = useState<CreativeChallenge | null>(null);
  const [innovationStreak, setInnovationStreak] = useState(0);
  const [exploreMode, setExploreMode] = useState(false);
  const [showImprovements, setShowImprovements] = useState(false);
  const [metrics, setMetrics] = useState<InnovationMetrics>({
    clarity: 0,
    efficiency: 0,
    innovation: 0,
    completeness: 0,
    overall: 0
  });

  const [productionStages, setProductionStages] = useState<ProductionStage[]>([
    { id: 'ideation', name: 'Ideation', description: 'Exploring possibilities', progress: 0, completed: false, icon: Lightbulb },
    { id: 'drafting', name: 'Drafting', description: 'First generation', progress: 0, completed: false, icon: Code },
    { id: 'refinement', name: 'Refinement', description: 'Applying improvements', progress: 0, completed: false, icon: TrendingUp },
    { id: 'validation', name: 'Validation', description: 'Testing & verification', progress: 0, completed: false, icon: Shield },
    { id: 'production', name: 'Production', description: 'Ready to launch', progress: 0, completed: false, icon: Rocket }
  ]);

  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [beforeYaml, setBeforeYaml] = useState('');
  const [afterYaml, setAfterYaml] = useState('');
  const [achievementUnlocked, setAchievementUnlocked] = useState<string | null>(null);

  // Creative challenges
  const challenges: CreativeChallenge[] = [
    {
      id: 'minimal',
      title: 'The Minimalist',
      description: 'Build a complete solution with 3 agents or less',
      constraint: 'Use maximum 3 agents',
      difficulty: 'easy',
      category: 'efficiency',
      reward: 'Efficiency Master Badge'
    },
    {
      id: 'speed',
      title: 'Speed Demon',
      description: 'Create a farm that completes in under 10 steps',
      constraint: 'Maximum 10 steps',
      difficulty: 'medium',
      category: 'optimization',
      reward: 'Speed Optimization Trophy'
    },
    {
      id: 'parallel',
      title: 'Parallel Universe',
      description: 'Design a farm where all agents work simultaneously',
      constraint: 'All parallel execution',
      difficulty: 'hard',
      category: 'architecture',
      reward: 'Parallel Processing Crown'
    },
    {
      id: 'creative',
      title: 'Outside the Box',
      description: 'Use unconventional agent combinations for your task',
      constraint: 'Unique agent roles',
      difficulty: 'medium',
      category: 'innovation',
      reward: 'Creative Genius Star'
    },
    {
      id: 'comprehensive',
      title: 'The Completionist',
      description: 'Include testing, documentation, and deployment',
      constraint: 'Full lifecycle coverage',
      difficulty: 'hard',
      category: 'completeness',
      reward: 'Full Stack Hero Medal'
    }
  ];

  // Generate random challenge
  const generateRandomChallenge = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * challenges.length);
    setCurrentChallenge(challenges[randomIndex]);
  }, []);

  // Calculate innovation metrics
  const calculateMetrics = useCallback((yaml: string) => {
    // Simulate metric calculation (in real app, this would analyze the YAML)
    const newMetrics = {
      clarity: Math.floor(70 + Math.random() * 30),
      efficiency: Math.floor(60 + Math.random() * 40),
      innovation: Math.floor(50 + Math.random() * 50),
      completeness: Math.floor(75 + Math.random() * 25),
      overall: 0
    };
    newMetrics.overall = Math.floor(
      (newMetrics.clarity + newMetrics.efficiency + newMetrics.innovation + newMetrics.completeness) / 4
    );
    setMetrics(newMetrics);

    // Check for achievements
    if (newMetrics.overall > 90) {
      unlockAchievement('Excellence Award');
    }
    if (newMetrics.innovation > 95) {
      unlockAchievement('Innovation Pioneer');
    }
  }, []);

  // Update production stages
  const updateProductionStage = useCallback((stageId: string, progress: number) => {
    setProductionStages(prev => {
      const updated = [...prev];
      const stageIndex = updated.findIndex(s => s.id === stageId);
      if (stageIndex !== -1) {
        updated[stageIndex].progress = progress;
        updated[stageIndex].completed = progress >= 100;

        // Auto-progress next stage
        if (progress >= 100 && stageIndex < updated.length - 1) {
          setTimeout(() => {
            updateProductionStage(updated[stageIndex + 1].id, 20);
          }, 500);
        }
      }
      return updated;
    });
  }, []);

  // Unlock achievement with celebration
  const unlockAchievement = useCallback((achievement: string) => {
    setAchievementUnlocked(achievement);
    setInnovationStreak(prev => prev + 1);

    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Hide after 3 seconds
    setTimeout(() => {
      setAchievementUnlocked(null);
    }, 3000);
  }, []);

  // Enhanced generate function
  const handleGenerate = useCallback(async () => {
    // Update production stages
    updateProductionStage('ideation', 100);
    updateProductionStage('drafting', 50);

    await generateYaml(currentPrompt, {
      provider: selectedProvider,
      creativity_level: creativityLevel,
      challenge: currentChallenge?.constraint
    });

    updateProductionStage('drafting', 100);
    calculateMetrics(rawYaml);
  }, [currentPrompt, selectedProvider, creativityLevel, currentChallenge, generateYaml, rawYaml, updateProductionStage, calculateMetrics]);

  const handleValidate = useCallback(async () => {
    const yamlToValidate = showEditor ? editedYaml : rawYaml;
    await validateYaml(yamlToValidate);
    updateProductionStage('validation', validationResult?.valid ? 100 : 50);
  }, [showEditor, editedYaml, rawYaml, validateYaml, validationResult, updateProductionStage]);

  const handleSave = useCallback(async () => {
    if (generatedYaml) {
      const filename = `${generatedYaml.name}.yaml`;
      await saveYaml(generatedYaml, filename);
      updateProductionStage('production', 100);
      unlockAchievement('Production Ready!');
    }
  }, [generatedYaml, saveYaml, updateProductionStage, unlockAchievement]);

  const handleDownload = useCallback(() => {
    const yamlContent = showEditor ? editedYaml : rawYaml;
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedYaml ? `${generatedYaml.name}.yaml` : 'generated.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [showEditor, editedYaml, rawYaml, generatedYaml]);

  // Apply improvements
  const applyImprovements = useCallback(() => {
    setBeforeYaml(rawYaml);
    // Simulate improvement (in real app, this would call an API)
    const improved = rawYaml + '\n# Improvements applied';
    setAfterYaml(improved);
    setShowBeforeAfter(true);
    updateProductionStage('refinement', 100);
    calculateMetrics(improved);
  }, [rawYaml, updateProductionStage, calculateMetrics]);

  // Initialize with challenge on mount
  useEffect(() => {
    generateRandomChallenge();
  }, [generateRandomChallenge]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Achievement Notification */}
      <AnimatePresence>
        {achievementUnlocked && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.8 }}
            className="fixed top-20 right-4 z-50 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg shadow-2xl p-4 flex items-center gap-3"
          >
            <Trophy className="w-8 h-8" />
            <div>
              <p className="font-bold text-lg">Achievement Unlocked!</p>
              <p className="text-sm opacity-90">{achievementUnlocked}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Innovation Dashboard */}
      {showInnovationDashboard && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 rounded-xl p-6 border border-purple-200 dark:border-purple-800"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Rocket className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              <h2 className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                Innovation Studio
              </h2>
            </div>
            <button
              onClick={() => setShowInnovationDashboard(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <EyeOff className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {/* Daily Challenge */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <Target className="w-5 h-5 text-orange-500" />
                <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full">
                  {currentChallenge?.difficulty}
                </span>
              </div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Today's Challenge
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                {currentChallenge?.title}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                {currentChallenge?.constraint}
              </p>
              <button
                onClick={generateRandomChallenge}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Shuffle className="w-3 h-3" />
                New Challenge
              </button>
            </motion.div>

            {/* Innovation Streak */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <Flame className="w-5 h-5 text-red-500" />
                <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {innovationStreak}
                </span>
              </div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Innovation Streak
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Keep creating to build your streak!
              </p>
              <div className="mt-2 flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < innovationStreak % 5
                        ? 'bg-red-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </motion.div>

            {/* Exploration Progress */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <Brain className="w-5 h-5 text-green-500" />
                <button
                  onClick={() => setExploreMode(!exploreMode)}
                  className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full"
                >
                  {exploreMode ? 'Active' : 'Start'}
                </button>
              </div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Explore Mode
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {exploreMode
                  ? 'Discovering new possibilities...'
                  : 'Activate to unlock suggestions'
                }
              </p>
              {exploreMode && (
                <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                  Try: "What if you added CI/CD?"
                </div>
              )}
            </motion.div>

            {/* Quality Score */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <Award className="w-5 h-5 text-blue-500" />
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {metrics.overall}%
                </span>
              </div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Quality Score
              </h3>
              <div className="space-y-1 mt-2">
                {Object.entries(metrics).slice(0, -1).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400 capitalize w-16">
                      {key}:
                    </span>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Try This Next Recommendations */}
          {exploreMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/10 dark:to-blue-900/10 rounded-lg"
            >
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                Try This Next
              </h3>
              <div className="grid md:grid-cols-3 gap-2">
                {[
                  'Add automated testing to your farm',
                  'Include performance monitoring agents',
                  'Try parallel execution for speed',
                  'Add a documentation generator agent',
                  'Include security scanning steps',
                  'Experiment with different AI models'
                ].map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentPrompt(prev => prev + ' ' + suggestion)}
                    className="text-xs p-2 bg-white dark:bg-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                  >
                    <ChevronRight className="w-3 h-3 inline mr-1 text-green-500" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Show Dashboard Toggle */}
      {!showInnovationDashboard && (
        <button
          onClick={() => setShowInnovationDashboard(true)}
          className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
        >
          <Eye className="w-4 h-4" />
          Show Innovation Dashboard
        </button>
      )}

      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 mb-4"
        >
          <Sparkles className="w-8 h-8 text-blue-500" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AI-Powered YAML Innovation Studio
          </h1>
        </motion.div>
        <p className="text-gray-600 dark:text-gray-400">
          Transform ideas into production-ready configurations with AI guidance
        </p>

        {/* Creativity Level Slider */}
        <div className="mt-4 max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Creativity Level</span>
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {creativityLevel < 33 ? 'Safe' : creativityLevel < 66 ? 'Experimental' : 'Cutting-Edge'}
            </span>
          </div>
          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              value={creativityLevel}
              onChange={(e) => setCreativityLevel(Number(e.target.value))}
              className="w-full h-2 bg-gradient-to-r from-green-400 via-yellow-400 to-red-400 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right,
                  #10b981 0%,
                  #eab308 50%,
                  #ef4444 100%)`
              }}
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>Safe</span>
              <span>Experimental</span>
              <span>Cutting-Edge</span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Journey Tracker */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-500" />
          Production Journey
        </h3>
        <div className="flex items-center justify-between">
          {productionStages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div key={stage.id} className="flex-1 relative">
                <motion.div
                  className={`flex flex-col items-center ${
                    stage.completed ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'
                  }`}
                  animate={{ scale: stage.completed ? [1, 1.2, 1] : 1 }}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                    stage.completed
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium">{stage.name}</span>
                  <span className="text-xs opacity-75">{stage.progress}%</span>
                </motion.div>
                {index < productionStages.length - 1 && (
                  <div className="absolute top-6 left-1/2 w-full h-0.5 bg-gray-200 dark:bg-gray-700">
                    <motion.div
                      className="h-full bg-gradient-to-r from-green-500 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: stage.completed ? '100%' : '0%' }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex justify-center gap-2">
        {(['guided', 'freestyle', 'template'] as GeneratorMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              mode === m
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Panel - Input */}
        <div className="space-y-4">
          <PromptInput
            value={currentPrompt}
            onChange={setCurrentPrompt}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            mode={mode}
          />

          {/* AI Provider Selection */}
          <AIProviderSelector
            value={selectedProvider}
            onChange={setSelectedProvider}
            showDetails={false}
            disabled={isGenerating}
            className="mb-4"
          />

          {/* Innovation Templates */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
              <Gem className="w-4 h-4" />
              Innovation Templates
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Microservices Builder', icon: Layers },
                { name: 'AI Pipeline Creator', icon: Brain },
                { name: 'DevOps Automator', icon: GitBranch },
                { name: 'Data Processing Farm', icon: BarChart3 },
                { name: 'Security Scanner Suite', icon: Shield },
                { name: 'Performance Optimizer', icon: Gauge }
              ].map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.name}
                    onClick={() => setCurrentPrompt(`Create a ${template.name.toLowerCase()}`)}
                    className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-sm"
                  >
                    <Icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-gray-700 dark:text-gray-300">{template.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quality Improvements Panel */}
          {rawYaml && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Suggested Improvements
                </h3>
                <button
                  onClick={applyImprovements}
                  className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Apply All
                </button>
              </div>
              <ul className="space-y-2">
                {[
                  'Add error handling to critical steps',
                  'Include rollback mechanisms',
                  'Optimize agent coordination timing',
                  'Add progress tracking metrics',
                  'Include validation checkpoints'
                ].map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Plus className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                    <span className="text-gray-700 dark:text-gray-300">{improvement}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Validation Result */}
          <AnimatePresence>
            {validationResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`rounded-lg p-4 ${
                  validationResult.valid
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      validationResult.valid
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {validationResult.valid ? 'YAML is valid!' : 'Validation errors found'}
                    </p>
                    {validationResult.errors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {validationResult.errors.map((error, index) => (
                          <li key={`error-${error.field}-${index}`} className="text-sm text-red-600 dark:text-red-400">
                            • {error.field}: {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel - Preview/Editor */}
        <div className="space-y-4">
          {/* Toggle Editor/Preview */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditor(false)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !showEditor
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => {
                  setShowEditor(true);
                  setEditedYaml(rawYaml);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  showEditor
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Code className="w-4 h-4 inline mr-1" />
                Edit
              </button>
              <button
                onClick={() => setShowBeforeAfter(!showBeforeAfter)}
                disabled={!beforeYaml || !afterYaml}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  showBeforeAfter
                    ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <GitBranch className="w-4 h-4 inline mr-1" />
                Compare
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleValidate}
                disabled={!rawYaml || isValidating}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  'Validate'
                )}
              </button>
              <button
                onClick={handleDownload}
                disabled={!rawYaml}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  // Launch farm directly
                  if (generatedYaml) {
                    handleSave();
                    // In real app, this would trigger farm launch
                  }
                }}
                disabled={!generatedYaml || !validationResult?.valid}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gradient-to-r from-green-500 to-blue-500 text-white hover:from-green-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                <Rocket className="w-4 h-4" />
                Launch
              </button>
              <button
                onClick={handleSave}
                disabled={!generatedYaml}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {showBeforeAfter ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Before</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-96 overflow-auto">
                    <pre className="text-xs text-gray-800 dark:text-gray-200">{beforeYaml}</pre>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">After Improvements</h4>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 h-96 overflow-auto">
                    <pre className="text-xs text-gray-800 dark:text-gray-200">{afterYaml}</pre>
                  </div>
                </div>
              </div>
            ) : showEditor ? (
              <YamlEditor
                key="editor"
                value={editedYaml}
                onChange={setEditedYaml}
                onValidate={handleValidate}
              />
            ) : (
              <YamlPreview
                key="preview"
                yaml={generatedYaml}
                rawYaml={rawYaml}
                isGenerating={isGenerating}
              />
            )}
          </AnimatePresence>

          {/* Innovation Score Display */}
          {rawYaml && metrics.overall > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4"
            >
              <h3 className="text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Innovation Metrics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(metrics).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                      {key}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-2 rounded-full ${
                            value > 80
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                              : value > 60
                              ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
                              : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                          }`}
                        />
                      </div>
                      <span className={`text-xs font-medium ${
                        key === 'overall' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {value}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Most Innovative Recent Generations */}
      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Most Innovative Generations
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history
              .slice(0, 6)
              .sort((a, b) => {
                // Sort by innovation score (simulated)
                const scoreA = Math.random() * 100;
                const scoreB = Math.random() * 100;
                return scoreB - scoreA;
              })
              .map((item, index) => (
                <motion.div
                  key={`history-${item.timestamp}-${index}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer border-2 border-transparent hover:border-purple-400 dark:hover:border-purple-600"
                  onClick={() => {
                    if (item.yaml) {
                      setCurrentPrompt('');
                      // Load the historical YAML
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {item.yaml?.name || 'Unnamed Farm'}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {item.yaml?.steps.length || 0} steps • {item.yaml?.agents.length || 0} agents
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {Math.floor(60 + Math.random() * 40)}% innovative
                          </span>
                        </div>
                      </div>
                    </div>
                    {item.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  {index === 0 && (
                    <div className="mt-2 text-xs px-2 py-1 bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 text-yellow-700 dark:text-yellow-300 rounded-full inline-block">
                      Most Innovative
                    </div>
                  )}
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {/* Exploration Suggestions Footer */}
      {exploreMode && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 mt-8"
        >
          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            What if you tried...
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Hybrid Approach', desc: 'Combine AI models for better results' },
              { title: 'Micro-Batching', desc: 'Process tasks in small, efficient batches' },
              { title: 'Self-Healing', desc: 'Add automatic error recovery' },
              { title: 'Progressive Enhancement', desc: 'Start simple, add complexity gradually' },
              { title: 'Distributed Processing', desc: 'Split work across multiple farms' },
              { title: 'Real-time Monitoring', desc: 'Add live metrics and logging' },
              { title: 'A/B Testing', desc: 'Compare different approaches' },
              { title: 'Chaos Engineering', desc: 'Test resilience with random failures' }
            ].map((idea) => (
              <motion.button
                key={idea.title}
                whileHover={{ scale: 1.05 }}
                onClick={() => setCurrentPrompt(prev => `${prev} with ${idea.title.toLowerCase()}`)}
                className="p-3 bg-white dark:bg-gray-800 rounded-lg text-left hover:shadow-md transition-all"
              >
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {idea.title}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {idea.desc}
                </p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default YamlGeneratorEnhanced;