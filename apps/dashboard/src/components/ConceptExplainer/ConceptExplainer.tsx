import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Brain, 
  Zap, 
  Users, 
  ArrowRight,
  Loader2,
  Code,
  Target,
  Cpu,
  GitBranch,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { terminalSubscriptionManager } from '@/utils/terminalSubscriptionManager';
import { wsManager } from '@/services/websocket/singletonManager';

interface ConceptStep {
  title: string;
  description: string;
  icon: React.ElementType;
  delay: number;
}

export const ConceptExplainer: React.FC = () => {
  const navigate = useNavigate();
  const { farmId, mode } = useParams<{ farmId: string; mode: string }>();
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [farmName, setFarmName] = useState('');
  const [agentCount, setAgentCount] = useState(0);

  // Define concept steps based on mode
  const getConceptSteps = (): ConceptStep[] => {
    const baseSteps: ConceptStep[] = [
      {
        title: 'Initializing AI Agents',
        description: 'Setting up collaborative AI agents with specialized roles and capabilities',
        icon: Users,
        delay: 1500
      },
      {
        title: 'Establishing Coordination',
        description: 'Creating communication channels between agents for seamless collaboration',
        icon: GitBranch,
        delay: 1800
      },
      {
        title: 'Loading Task Context',
        description: 'Analyzing your requirements and preparing the execution environment',
        icon: Brain,
        delay: 2000
      }
    ];

    switch (mode) {
      case 'quicktask':
        return [
          {
            title: 'Quick Task Activation',
            description: 'Rapidly deploying focused agents for immediate task execution',
            icon: Zap,
            delay: 1000
          },
          ...baseSteps,
          {
            title: 'Sprint Mode Engaged',
            description: 'Optimizing for speed with 5-minute execution window',
            icon: Target,
            delay: 1500
          }
        ];
      
      case 'farm':
        return [
          {
            title: 'Farm Cultivation',
            description: 'Preparing your digital farm with specialized agent workers',
            icon: Sparkles,
            delay: 1000
          },
          ...baseSteps,
          {
            title: 'Planting Seeds',
            description: 'Distributing tasks across agent workforce for parallel execution',
            icon: Code,
            delay: 2200
          },
          {
            title: 'Growth Monitoring',
            description: 'Establishing real-time progress tracking and health checks',
            icon: Activity,
            delay: 1800
          }
        ];
      
      case 'gowild':
        return [
          {
            title: 'Exploration Mode',
            description: 'Unleashing creative AI agents for autonomous discovery',
            icon: Cpu,
            delay: 1000
          },
          ...baseSteps,
          {
            title: 'Boundary Expansion',
            description: 'Enabling agents to explore beyond conventional limits',
            icon: GitBranch,
            delay: 2000
          },
          {
            title: 'Innovation Engine',
            description: 'Activating creative problem-solving capabilities',
            icon: Sparkles,
            delay: 1500
          }
        ];
      
      default:
        return baseSteps;
    }
  };

  const conceptSteps = getConceptSteps();

  useEffect(() => {
    // Fetch farm details
    if (farmId) {
      fetch(`/api/farms/${farmId}`)
        .then(res => res.json())
        .then(data => {
          setFarmName(data.name || 'Your Farm');
          setAgentCount(data.agents?.length || 2);
        })
        .catch(console.error);
    }

    // CRITICAL: Subscribe to terminal events immediately to start receiving output
    // This ensures terminal output is being captured even during the transition
    const socket = wsManager.getSocket();
    let subscriptionKey: string | null = null;
    
    if (farmId && socket) {
      console.log('[ConceptExplainer] Setting up terminal subscription for farm:', farmId);
      terminalSubscriptionManager.setSocket(socket);
      
      // Extract short ID for session name (matches backend format)
      const shortId = farmId.substring(0, 8);
      const sessionName = `farm-${shortId}`;
      
      console.log('[ConceptExplainer] Using session name:', sessionName);
      
      // Subscribe to terminal output with correct session name
      subscriptionKey = terminalSubscriptionManager.subscribe(
        sessionName,  // Use the formatted session name
        farmId,
        (data: any) => {
          // Terminal output is being received and cached
          console.log('[ConceptExplainer] Receiving terminal output during transition:', data.agentId);
        }
      );
      
      // Also emit join event directly for immediate connection with both IDs
      socket.emit('terminal:join_session', {
        sessionId: sessionName,  // Use formatted session name
        farmId: farmId,
        timestamp: Date.now()
      });
      
      // Also try with just the farmId for compatibility
      socket.emit('terminal:join_session', {
        sessionId: farmId,
        farmId: farmId,
        timestamp: Date.now()
      });
    }

    // Auto-advance through steps
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= conceptSteps.length - 1) {
          setIsComplete(true);
          clearInterval(stepInterval);
          // Navigate to harvest page after showing all concepts
          setTimeout(() => {
            navigate(`/harvest/${farmId}`);
          }, 2000);
          return prev;
        }
        return prev + 1;
      });
    }, 2500);

    return () => {
      clearInterval(stepInterval);
      // Clean up terminal subscription
      if (subscriptionKey) {
        terminalSubscriptionManager.unsubscribe(subscriptionKey);
      }
    };
  }, [farmId, navigate, conceptSteps.length]);

  const getModeTitle = () => {
    switch (mode) {
      case 'quicktask':
        return 'Quick Task Execution';
      case 'farm':
        return 'Farm Orchestration';
      case 'gowild':
        return 'GoWild Exploration';
      default:
        return 'AI Orchestration';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'quicktask':
        return 'from-yellow-400 to-orange-500';
      case 'farm':
        return 'from-green-400 to-emerald-500';
      case 'gowild':
        return 'from-purple-400 to-pink-500';
      default:
        return 'from-blue-400 to-cyan-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className={`text-5xl font-bold bg-gradient-to-r ${getModeColor()} bg-clip-text text-transparent mb-4`}>
            {getModeTitle()}
          </h1>
          <p className="text-xl text-gray-300">
            {farmName && `Launching ${farmName} with ${agentCount} AI agents`}
          </p>
        </motion.div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${getModeColor()}`}
              initial={{ width: '0%' }}
              animate={{ width: `${((currentStep + 1) / conceptSteps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Concept Steps */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {conceptSteps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isPast = index < currentStep;
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ 
                    opacity: isActive || isPast ? 1 : 0.3,
                    x: 0,
                    scale: isActive ? 1.05 : 1
                  }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`
                    relative p-6 rounded-xl border-2 transition-all duration-500
                    ${isActive 
                      ? 'border-white/30 bg-white/10 shadow-2xl' 
                      : isPast 
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-gray-700 bg-gray-800/50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`
                      p-3 rounded-lg transition-all duration-500
                      ${isActive 
                        ? `bg-gradient-to-br ${getModeColor()} shadow-lg` 
                        : isPast
                          ? 'bg-green-500/20'
                          : 'bg-gray-700'
                      }
                    `}>
                      {isPast ? (
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      ) : (
                        <Icon className={`w-6 h-6 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h3 className={`
                        text-lg font-semibold transition-colors duration-500
                        ${isActive ? 'text-white' : isPast ? 'text-green-400' : 'text-gray-400'}
                      `}>
                        {step.title}
                      </h3>
                      <p className={`
                        text-sm mt-1 transition-colors duration-500
                        ${isActive ? 'text-gray-200' : isPast ? 'text-gray-400' : 'text-gray-500'}
                      `}>
                        {step.description}
                      </p>
                    </div>

                    {isActive && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 className="w-6 h-6 text-white" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Completion Message */}
        <AnimatePresence>
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mt-12 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                className="inline-block mb-4"
              >
                <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">
                All Systems Ready!
              </h2>
              <p className="text-gray-300 mb-4">
                Redirecting to your harvest terminal...
              </p>
              <motion.div
                animate={{ x: [0, 10, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="inline-flex items-center space-x-2 text-green-400"
              >
                <span>Loading Harvest Terminal</span>
                <ArrowRight className="w-5 h-5" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip Button */}
        {!isComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="mt-8 text-center"
          >
            <button
              onClick={() => navigate(`/harvest/${farmId}`)}
              className="px-6 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Skip to Harvest Terminal →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};