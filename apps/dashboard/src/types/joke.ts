export type JokeCategory = 
  | 'dad-jokes'
  | 'puns'
  | 'one-liners'
  | 'knock-knock'
  | 'tech-jokes'
  | 'animal-jokes'
  | 'food-jokes'
  | 'science-jokes';

export interface Joke {
  id: string;
  category: JokeCategory;
  setup?: string;
  punchline: string;
  tags: string[];
  rating: number;
  views: number;
  createdAt: string;
  submittedBy?: string;
}

export interface JokeStats {
  totalViewed: number;
  totalFavorites: number;
  totalRated: number;
  averageRating: number;
  mostViewedCategory: JokeCategory | null;
  dailyStreak: number;
  lastViewedDate: string | null;
}

export interface JokeFilters {
  categories: JokeCategory[];
  searchTerm: string;
  sortBy: 'rating' | 'views' | 'newest' | 'random';
  onlyFavorites: boolean;
}

export interface JokeReaction {
  type: 'laugh' | 'groan' | 'love' | 'mind-blown';
  timestamp: number;
}

export const categoryInfo: Record<JokeCategory, {
  label: string;
  icon: string;
  color: string;
  description: string;
}> = {
  'dad-jokes': {
    label: 'Dad Jokes',
    icon: '👔',
    color: 'from-blue-400 to-blue-600',
    description: 'Classic groan-worthy dad humor'
  },
  'puns': {
    label: 'Puns',
    icon: '🎯',
    color: 'from-purple-400 to-purple-600',
    description: 'Wordplay at its finest (or worst)'
  },
  'one-liners': {
    label: 'One-Liners',
    icon: '⚡',
    color: 'from-yellow-400 to-orange-500',
    description: 'Quick hits of humor'
  },
  'knock-knock': {
    label: 'Knock Knock',
    icon: '🚪',
    color: 'from-green-400 to-green-600',
    description: 'Who\'s there? Comedy gold!'
  },
  'tech-jokes': {
    label: 'Tech Jokes',
    icon: '💻',
    color: 'from-cyan-400 to-blue-500',
    description: 'Bugs, features, and semicolons'
  },
  'animal-jokes': {
    label: 'Animal Jokes',
    icon: '🦁',
    color: 'from-amber-400 to-orange-600',
    description: 'Wild and domestic humor'
  },
  'food-jokes': {
    label: 'Food Jokes',
    icon: '🍕',
    color: 'from-red-400 to-pink-500',
    description: 'Deliciously funny'
  },
  'science-jokes': {
    label: 'Science Jokes',
    icon: '🔬',
    color: 'from-indigo-400 to-purple-600',
    description: 'Periodic table of humor'
  }
};