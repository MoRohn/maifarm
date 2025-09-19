import React from 'react';
import { motion } from 'framer-motion';
import { FarmerTemplate, FarmerProfile } from '@/types/farmers';

interface FarmerAvatarProps {
  farmer: FarmerTemplate;
  profile?: FarmerProfile | null;
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
  showMood?: boolean;
}

export const FarmerAvatar: React.FC<FarmerAvatarProps> = ({ 
  farmer, 
  profile, 
  size = 'medium', 
  animated = false, 
  showMood = false 
}) => {
  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-24 h-24'
  };

  const textSizes = {
    small: 'text-lg',
    medium: 'text-2xl',
    large: 'text-4xl'
  };

  const getCategoryGradient = (category: string) => {
    const gradients = {
      startup: 'from-purple-400 to-pink-500',
      technical: 'from-blue-400 to-cyan-500',
      creative: 'from-pink-400 to-rose-500',
      research: 'from-green-400 to-emerald-500',
      operations: 'from-gray-400 to-slate-500'
    };
    return gradients[category as keyof typeof gradients] || gradients.operations;
  };

  const getMoodIndicator = (mood: string) => {
    const moodIndicators = {
      energetic: { color: 'bg-orange-400', pulse: true },
      focused: { color: 'bg-blue-400', pulse: false },
      creative: { color: 'bg-pink-400', pulse: true },
      analytical: { color: 'bg-purple-400', pulse: false },
      supportive: { color: 'bg-green-400', pulse: true }
    };
    return moodIndicators[mood as keyof typeof moodIndicators] || moodIndicators.focused;
  };

  // Get avatar from profile or farmer data
  const avatar = farmer.agents[0]?.emoji || profile?.avatar || '🌾';
  const mood = profile?.mood || 'focused';
  const moodIndicator = getMoodIndicator(mood);

  const AvatarContent = () => (
    <>
      {/* Main Avatar */}
      <div className={`relative ${sizeClasses[size]} rounded-full bg-gradient-to-br ${getCategoryGradient(farmer.category)} flex items-center justify-center shadow-lg`}>
        <span className={`${textSizes[size]}`}>
          {avatar}
        </span>

        {/* Mood Indicator */}
        {showMood && profile?.mood && (
          <div className="absolute -bottom-1 -right-1">
            <div className={`w-4 h-4 ${moodIndicator.color} rounded-full border-2 border-white dark:border-gray-900 ${moodIndicator.pulse ? 'animate-pulse' : ''}`} />
          </div>
        )}

        {/* Specialty Badges */}
        {profile?.specialty_badges && profile.specialty_badges.length > 0 && size === 'large' && (
          <div className="absolute -top-2 -right-2 flex space-x-1">
            {profile.specialty_badges.slice(0, 2).map((badge, index) => (
              <div
                key={index}
                className={`w-6 h-6 rounded-full bg-${badge.color}-500 flex items-center justify-center text-xs`}
                title={badge.name}
              >
                <span>{badge.icon}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Ring (for large size) */}
      {size === 'large' && animated && (
        <div className="absolute inset-0 rounded-full border-4 border-transparent">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary-400/30 border-t-primary-600"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}
    </>
  );

  if (animated) {
    return (
      <motion.div
        className="relative"
        whileHover={{ 
          scale: 1.1,
          rotate: [0, -5, 5, 0],
          transition: { duration: 0.3 }
        }}
        whileTap={{ scale: 0.95 }}
      >
        <AvatarContent />
      </motion.div>
    );
  }

  return (
    <div className="relative">
      <AvatarContent />
    </div>
  );
};