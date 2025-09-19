import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { 
  Trophy, 
  Sparkles, 
  Star, 
  Zap, 
  CheckCircle,
  TrendingUp,
  Package,
  Award,
  Target,
  Clock,
  Users,
  FileText,
  Code,
  Rocket,
  Heart
} from 'lucide-react';
import { Harvest } from '@/types/harvest';
import CountUp from 'react-countup';

interface HarvestCompletionEpicProps {
  harvest: Harvest;
  onComplete: () => void;
  onViewInBarn?: () => void;
  enableSound?: boolean;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  condition: (harvest: Harvest) => boolean;
}

const achievements: Achievement[] = [
  {
    id: 'speed-demon',
    title: 'Speed Demon',
    description: 'Completed in record time',
    icon: Rocket,
    color: 'from-orange-400 to-red-500',
    condition: (h) => h.summary.duration < 300000 // Less than 5 minutes
  },
  {
    id: 'quality-champion',
    title: 'Quality Champion',
    description: '100% success rate',
    icon: Award,
    color: 'from-green-400 to-emerald-500',
    condition: (h) => h.summary.efficiency === 100
  },
  {
    id: 'multi-agent-master',
    title: 'Multi-Agent Master',
    description: 'Coordinated 5+ agents',
    icon: Users,
    color: 'from-blue-400 to-indigo-500',
    condition: (h) => (h.summary?.agents?.length ?? 0) >= 5
  },
  {
    id: 'file-factory',
    title: 'File Factory',
    description: 'Generated 10+ files',
    icon: FileText,
    color: 'from-purple-400 to-pink-500',
    condition: (h) => h.summary.totalFiles >= 10
  },
  {
    id: 'code-wizard',
    title: 'Code Wizard',
    description: 'Created complex code',
    icon: Code,
    color: 'from-cyan-400 to-blue-500',
    condition: (h) => (h.summary?.fileCategories?.code || 0) > 5
  }
];

export const HarvestCompletionEpic: React.FC<HarvestCompletionEpicProps> = ({
  harvest,
  onComplete,
  onViewInBarn,
  enableSound = true
}) => {
  const [phase, setPhase] = useState<'buildup' | 'explosion' | 'victory' | 'cta'>('buildup');
  const [showStats, setShowStats] = useState(false);
  const [earnedAchievements, setEarnedAchievements] = useState<Achievement[]>([]);
  const [currentStatIndex, setCurrentStatIndex] = useState(0);
  const controls = useAnimation();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Calculate earned achievements
  useEffect(() => {
    const earned = achievements.filter(a => a.condition(harvest));
    setEarnedAchievements(earned);
  }, [harvest]);

  // Animation sequence
  useEffect(() => {
    const sequence = async () => {
      // Phase 1: Buildup (1s)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Phase 2: Explosion (2s)
      setPhase('explosion');
      if (enableSound) {
        playSound('success');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Phase 3: Victory lap (5s)
      setPhase('victory');
      setShowStats(true);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Phase 4: Call to action
      setPhase('cta');
    };
    
    sequence();
  }, [enableSound]);

  // Cycle through stats
  useEffect(() => {
    if (showStats) {
      const interval = setInterval(() => {
        setCurrentStatIndex(prev => (prev + 1) % 4);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [showStats]);

  const playSound = (type: 'success' | 'achievement' | 'counter') => {
    // Sound implementation would go here
    // For now, we'll use the Web Audio API for simple sounds
    if (!enableSound) return;
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'success') {
      // Triumphant chord
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
    }
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1);
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // Particle generation for confetti
  const generateParticles = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 20 + 10,
      color: ['#FFD700', '#FF69B4', '#00CED1', '#FF6347', '#9370DB'][Math.floor(Math.random() * 5)],
      delay: Math.random() * 0.5,
      duration: Math.random() * 2 + 1
    }));
  };

  const particles = generateParticles(50);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] overflow-hidden"
        style={{ pointerEvents: phase === 'cta' ? 'auto' : 'none' }}
      >
        {/* Background overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'explosion' ? 1 : 0.8 }}
          transition={{ duration: 0.5 }}
        />

        {/* Screen-wide ripple effect */}
        {phase === 'explosion' && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            <div className="w-96 h-96 rounded-full bg-gradient-radial from-yellow-400/50 via-orange-400/30 to-transparent" />
          </motion.div>
        )}

        {/* Confetti particles */}
        {(phase === 'explosion' || phase === 'victory') && (
          <div className="absolute inset-0 pointer-events-none">
            {particles.map(particle => (
              <motion.div
                key={particle.id}
                className="absolute rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: particle.color,
                  left: particle.x,
                  top: particle.y,
                }}
                initial={{ scale: 0, y: 0 }}
                animate={{
                  scale: [0, 1, 1, 0],
                  y: [0, -100, -200, 500],
                  x: [(Math.random() - 0.5) * 200],
                  rotate: [0, 360, 720],
                }}
                transition={{
                  duration: particle.duration + 1,
                  delay: particle.delay,
                  ease: "easeOut"
                }}
              />
            ))}
          </div>
        )}

        {/* Main content container */}
        <div className="relative h-full flex items-center justify-center">
          <motion.div
            className="relative max-w-4xl w-full mx-auto p-8"
            animate={controls}
          >
            {/* Phase 1: Buildup */}
            {phase === 'buildup' && (
              <motion.div
                className="text-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <Trophy className="w-32 h-32 mx-auto text-yellow-400 mb-4" />
                </motion.div>
                <div className="text-white text-2xl font-bold">Finalizing harvest...</div>
              </motion.div>
            )}

            {/* Phase 2: Explosion */}
            {phase === 'explosion' && (
              <motion.div
                className="text-center"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
              >
                <motion.div
                  className="relative inline-block"
                  animate={{
                    rotate: [0, 360],
                    scale: [1, 1.2, 1]
                  }}
                  transition={{ duration: 1 }}
                >
                  <Trophy className="w-48 h-48 text-yellow-400" />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.5, 0] }}
                    transition={{ duration: 1, repeat: 2 }}
                  >
                    <Sparkles className="w-64 h-64 text-yellow-300 opacity-50" />
                  </motion.div>
                </motion.div>

                <motion.h1
                  className="text-6xl font-bold text-white mt-8 mb-4"
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  HARVEST COMPLETE!
                </motion.h1>
                
                <motion.div
                  className="text-2xl text-gray-200"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  {harvest.farmName} has finished its journey
                </motion.div>
              </motion.div>
            )}

            {/* Phase 3: Victory Lap */}
            {phase === 'victory' && showStats && (
              <div className="space-y-8">
                {/* Main stats display */}
                <motion.div
                  className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <FileText className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                      <div className="text-3xl font-bold text-white">
                        <CountUp end={harvest.summary.totalFiles} duration={2} />
                      </div>
                      <div className="text-sm text-gray-300">Files Created</div>
                    </motion.div>

                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Clock className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <div className="text-3xl font-bold text-white">
                        {formatDuration(harvest.summary.duration)}
                      </div>
                      <div className="text-sm text-gray-300">Time Taken</div>
                    </motion.div>

                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                      <div className="text-3xl font-bold text-white">
                        <CountUp end={harvest.summary.efficiency} duration={2} suffix="%" />
                      </div>
                      <div className="text-sm text-gray-300">Efficiency</div>
                    </motion.div>

                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Users className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                      <div className="text-3xl font-bold text-white">
                        <CountUp end={harvest.summary.agents?.length || 1} duration={2} />
                      </div>
                      <div className="text-sm text-gray-300">Agents Used</div>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Achievements */}
                {earnedAchievements.length > 0 && (
                  <motion.div
                    className="space-y-4"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1 }}
                  >
                    <h3 className="text-xl font-bold text-white mb-4">Achievements Unlocked!</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {earnedAchievements.map((achievement, index) => (
                        <motion.div
                          key={achievement.id}
                          className="bg-gradient-to-r p-4 rounded-xl border border-white/20"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${achievement.color.split(' ')[0].replace('from-', '')} 0%, ${achievement.color.split(' ')[2].replace('to-', '')} 100%)`
                          }}
                          initial={{ scale: 0, rotate: -10 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ 
                            delay: 1.5 + index * 0.2,
                            type: "spring",
                            stiffness: 200
                          }}
                        >
                          <div className="flex items-center space-x-3">
                            <achievement.icon className="w-8 h-8 text-white" />
                            <div>
                              <div className="font-bold text-white">{achievement.title}</div>
                              <div className="text-sm text-white/80">{achievement.description}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Phase 4: Call to Action */}
            {phase === 'cta' && (
              <motion.div
                className="text-center space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Trophy className="w-24 h-24 mx-auto text-yellow-400 mb-4" />
                <h2 className="text-4xl font-bold text-white mb-2">Incredible Work!</h2>
                <p className="text-xl text-gray-200 mb-8">
                  Your harvest is ready to be stored and reused
                </p>

                <div className="flex justify-center space-x-4">
                  <motion.button
                    onClick={onViewInBarn}
                    className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-xl shadow-xl"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="flex items-center space-x-2">
                      <Package className="w-5 h-5" />
                      <span>View in Barn</span>
                    </div>
                  </motion.button>

                  <motion.button
                    onClick={onComplete}
                    className="px-8 py-4 bg-white/20 backdrop-blur text-white font-bold rounded-xl border border-white/30"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Continue
                  </motion.button>
                </div>

                {/* Share options */}
                <div className="mt-8">
                  <p className="text-sm text-gray-400 mb-2">Share your achievement</p>
                  <div className="flex justify-center space-x-2">
                    {['🎉', '🚀', '💪', '🔥'].map((emoji, i) => (
                      <motion.button
                        key={i}
                        className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-2xl"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {emoji}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Fallback CountUp component if react-countup not installed
const CountUpFallback: React.FC<{ end: number; duration: number; suffix?: string }> = ({ 
  end, 
  duration, 
  suffix = '' 
}) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      setCount(Math.floor(progress * end));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [end, duration]);
  
  return <>{count}{suffix}</>;
};