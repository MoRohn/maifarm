import React from 'react';
import { motion } from 'framer-motion';
import { 
  Brain, 
  Heart, 
  Zap, 
  Target, 
  Star, 
  TrendingUp,
  Shield,
  Lightbulb,
  Users,
  Award
} from 'lucide-react';
import { FarmerProfile } from '@/types/farmers';

interface FarmerPersonalityProps {
  profile: FarmerProfile;
}

export const FarmerPersonality: React.FC<FarmerPersonalityProps> = ({ profile }) => {
  const getTraitIcon = (trait: string) => {
    const icons: { [key: string]: React.ElementType } = {
      'ambitious': Target,
      'strategic': Brain,
      'resourceful': Lightbulb,
      'persistent': Shield,
      'creative': Star,
      'analytical': TrendingUp,
      'collaborative': Users,
      'professional': Award,
      'reliable': Shield,
      'knowledgeable': Brain
    };
    
    const key = trait.toLowerCase();
    return icons[key] || Heart;
  };

  const getTraitColor = (level: number) => {
    if (level >= 90) return 'from-green-400 to-emerald-500';
    if (level >= 80) return 'from-blue-400 to-cyan-500';
    if (level >= 70) return 'from-yellow-400 to-orange-500';
    if (level >= 60) return 'from-purple-400 to-pink-500';
    return 'from-gray-400 to-gray-500';
  };

  const getSkillCategoryColor = (category: string) => {
    const colors = {
      'Business': 'from-purple-400 to-purple-600',
      'Technical': 'from-blue-400 to-blue-600',
      'Creative': 'from-pink-400 to-pink-600',
      'Research': 'from-green-400 to-green-600',
      'Operations': 'from-gray-400 to-gray-600',
      'startup': 'from-purple-400 to-purple-600',
      'technical': 'from-blue-400 to-blue-600',
      'creative': 'from-pink-400 to-pink-600',
      'research': 'from-green-400 to-green-600',
      'operations': 'from-gray-400 to-gray-600'
    };
    return colors[category as keyof typeof colors] || colors.Operations;
  };

  return (
    <div className="space-y-8">
      {/* Personality Traits */}
      {profile.personality_traits && profile.personality_traits.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-6 flex items-center space-x-2">
            <Brain className="w-5 h-5 text-primary-600" />
            <span>Personality Traits</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {profile.personality_traits.map((trait, index) => {
              const Icon = getTraitIcon(trait.trait);
              const colorGradient = getTraitColor(trait.level);
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 bg-white dark:bg-gray-800 rounded-apple border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 bg-gradient-to-br ${colorGradient} rounded-apple`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {trait.trait}
                        </h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {trait.description}
                        </p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {trait.level}%
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${trait.level}%` }}
                      transition={{ duration: 1, delay: index * 0.1 + 0.5 }}
                      className={`h-2 bg-gradient-to-r ${colorGradient} rounded-full`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills */}
      {profile.skills && profile.skills.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-6 flex items-center space-x-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <span>Core Skills</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profile.skills.map((skill, index) => {
              const colorGradient = getSkillCategoryColor(skill.category);
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-apple"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                      {skill.name}
                    </h4>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      {skill.level}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${skill.level}%` }}
                      transition={{ duration: 0.8, delay: index * 0.05 + 0.3 }}
                      className={`h-1.5 bg-gradient-to-r ${colorGradient} rounded-full`}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {skill.category}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Specialty Badges */}
      {profile.specialty_badges && profile.specialty_badges.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <Award className="w-5 h-5 text-yellow-500" />
            <span>Specialties</span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {profile.specialty_badges.map((badge, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className={`flex items-center space-x-2 px-4 py-2 bg-${badge.color}-100 dark:bg-${badge.color}-900/20 border border-${badge.color}-200 dark:border-${badge.color}-800 rounded-apple`}
              >
                <span className="text-lg">{badge.icon}</span>
                <span className={`font-medium text-${badge.color}-700 dark:text-${badge.color}-300`}>
                  {badge.name}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Mood Indicator */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
          <Heart className="w-5 h-5 text-red-500" />
          <span>Current Mood</span>
        </h3>
        <div className="p-4 bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-apple border border-red-200 dark:border-red-800">
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0] 
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: "easeInOut" 
              }}
              className="text-2xl"
            >
              {profile.mood === 'energetic' ? '⚡' : 
               profile.mood === 'focused' ? '🎯' : 
               profile.mood === 'creative' ? '🎨' : 
               profile.mood === 'analytical' ? '🔍' : '💚'}
            </motion.div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white capitalize">
                {profile.mood}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {profile.mood === 'energetic' ? 'Ready to take on big challenges!' : 
                 profile.mood === 'focused' ? 'Deep in concentration mode' : 
                 profile.mood === 'creative' ? 'Bursting with innovative ideas' : 
                 profile.mood === 'analytical' ? 'Examining every detail carefully' : 
                 'Supportive and collaborative'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};