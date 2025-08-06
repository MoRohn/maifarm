export const glass = {
  light: {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
  },
  
  dark: {
    background: 'rgba(17, 25, 40, 0.75)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.125)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  },
  
  subtle: {
    background: 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 16px 0 rgba(31, 38, 135, 0.05)',
  },
  
  vibrant: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
    backdropFilter: 'blur(20px) saturate(200%)',
    WebkitBackdropFilter: 'blur(20px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 12px 48px 0 rgba(31, 38, 135, 0.12)',
  },
  
  card: {
    background: 'rgba(255, 255, 255, 0.6)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)',
  }
};

export const glassClasses = {
  light: 'bg-white/70 backdrop-blur-[10px] border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]',
  dark: 'bg-gray-900/75 backdrop-blur-[16px] backdrop-saturate-[180%] border border-white/[0.125] shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]',
  subtle: 'bg-white/50 backdrop-blur-[5px] border border-white/10 shadow-[0_4px_16px_0_rgba(31,38,135,0.05)]',
  vibrant: 'bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-[20px] backdrop-saturate-[200%] border border-white/20 shadow-[0_12px_48px_0_rgba(31,38,135,0.12)]',
  card: 'bg-white/60 backdrop-blur-[12px] border border-white/15 shadow-[0_4px_24px_0_rgba(0,0,0,0.06)]',
};

export const glassEffects = {
  hover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.15)',
    transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
  },
  
  active: {
    transform: 'translateY(0)',
    boxShadow: '0 4px 16px 0 rgba(31, 38, 135, 0.1)',
  },
  
  glow: {
    boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), 0 8px 32px 0 rgba(31, 38, 135, 0.1)',
  },
  
  shimmer: {
    background: `linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(255, 255, 255, 0) 100%
    )`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
  }
};

export const glassTransitions = {
  default: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
  fast: 'all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
  smooth: 'all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
  spring: 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
};