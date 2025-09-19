import React from 'react';
import { useTheme } from '@/hooks/useTheme';

interface MaiFarmLogoProps {
  size?: 'small' | 'medium' | 'large' | 'icon';
  className?: string;
  showText?: boolean;
  variant?: 'light' | 'dark' | 'auto';
}

export const MaiFarmLogo: React.FC<MaiFarmLogoProps> = ({
  size = 'medium',
  className = '',
  showText = true,
  variant = 'auto'
}) => {
  const { theme } = useTheme();
  const isDark = variant === 'auto' ? theme === 'dark' : variant === 'dark';

  const sizeMap = {
    small: { width: 80, height: 80, fontSize: 12 },
    medium: { width: 120, height: 120, fontSize: 16 },
    large: { width: 200, height: 200, fontSize: 24 },
    icon: { width: 64, height: 64, fontSize: 0 }
  };

  const dimensions = sizeMap[size];
  const isIcon = size === 'icon';

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox={isIcon ? "0 0 64 64" : "0 0 200 200"}
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-300 ${className}`}
    >
      <defs>
        {/* Gradients */}
        <linearGradient id={`v2Gradient-${isDark ? 'dark' : 'light'}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isDark ? "#0A84FF" : "#007AFF"} />
          <stop offset="50%" stopColor={isDark ? "#BF5AF2" : "#5856D6"} />
          <stop offset="100%" stopColor={isDark ? "#30D158" : "#34C759"} />
        </linearGradient>

        {/* Glow effect */}
        <filter id="glow">
          <feGaussianBlur stdDeviation={isDark ? "4" : "3"} result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* Shadow */}
        <filter id="softShadow">
          <feDropShadow dx="0" dy={isIcon ? "2" : "4"} stdDeviation={isIcon ? "4" : "8"} 
                        floodOpacity={isDark ? "0.3" : "0.15"}/>
        </filter>
      </defs>

      {/* Background */}
      {isIcon ? (
        <rect width="64" height="64" rx="14" fill={isDark ? "#1C1C1E" : "#FFFFFF"} filter="url(#softShadow)"/>
      ) : (
        <>
          {isDark && <rect width="200" height="200" rx="40" fill="#000000"/>}
          <circle cx="100" cy="100" r="90" fill={isDark ? "#1C1C1E" : "#FAFAFA"} 
                  filter={!isDark ? "url(#softShadow)" : undefined}/>
        </>
      )}

      {/* Main logo group */}
      <g transform={`translate(${isIcon ? 32 : 100}, ${isIcon ? 32 : 100})`}>
        {/* Central AI brain/seed hybrid shape */}
        <g id="core">
          <path 
            d={isIcon 
              ? "M 0,-16 C 8,-16 14,-10 14,-2 C 14,6 8,12 0,14 C -8,12 -14,6 -14,-2 C -14,-10 -8,-16 0,-16 Z"
              : "M 0,-40 C 20,-40 35,-25 35,-5 C 35,15 20,30 0,35 C -20,30 -35,15 -35,-5 C -35,-25 -20,-40 0,-40 Z"
            }
            fill={`url(#v2Gradient-${isDark ? 'dark' : 'light'})`}
            opacity={isDark ? "0.95" : "0.9"}
            filter="url(#glow)"
          />

          {/* Neural pattern */}
          <g stroke="#FFFFFF" strokeWidth={isIcon ? "2" : "2"} fill="none" opacity={isDark ? "0.9" : "0.8"}>
            <circle cx="0" cy={isIcon ? "-2" : "-5"} r={isIcon ? "3" : "8"} fill="#FFFFFF"/>
            
            {!isIcon && (
              <>
                <path d="M 0,-5 C -10,-15 -15,-20 -15,-25 M 0,-5 C 10,-15 15,-20 15,-25"/>
                <path d="M 0,-5 C -12,0 -18,5 -20,10 M 0,-5 C 12,0 18,5 20,10"/>
                <path d="M 0,-5 L 0,15"/>
                
                <circle cx="-15" cy="-25" r="3" fill="#FFFFFF" filter={isDark ? "url(#glow)" : undefined}/>
                <circle cx="15" cy="-25" r="3" fill="#FFFFFF" filter={isDark ? "url(#glow)" : undefined}/>
                <circle cx="-20" cy="10" r="3" fill="#FFFFFF" filter={isDark ? "url(#glow)" : undefined}/>
                <circle cx="20" cy="10" r="3" fill="#FFFFFF" filter={isDark ? "url(#glow)" : undefined}/>
                <circle cx="0" cy="15" r="3" fill="#FFFFFF" filter={isDark ? "url(#glow)" : undefined}/>
              </>
            )}
            
            {isIcon && (
              <>
                <line x1="0" y1="-2" x2="0" y2="6" strokeLinecap="round"/>
                <line x1="0" y1="-2" x2="-6" y2="-8" strokeLinecap="round"/>
                <line x1="0" y1="-2" x2="6" y2="-8" strokeLinecap="round"/>
              </>
            )}
          </g>
        </g>

        {/* Farm field rows */}
        {!isIcon && (
          <g id="fields" opacity={isDark ? "0.8" : "0.6"}>
            <path 
              d="M -60,40 Q -50,35 -40,40 T -20,40"
              stroke={isDark ? "#30D158" : "#34C759"}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter={isDark ? "url(#glow)" : undefined}
            />
            <path 
              d="M 20,40 Q 30,35 40,40 T 60,40"
              stroke={isDark ? "#30D158" : "#34C759"}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter={isDark ? "url(#glow)" : undefined}
            />
            
            <g fill={isDark ? "#30D158" : "#34C759"} filter={isDark ? "url(#glow)" : undefined}>
              <circle cx="-50" cy="38" r={isDark ? "2.5" : "2"}/>
              <circle cx="-30" cy="38" r={isDark ? "2.5" : "2"}/>
              <circle cx="30" cy="38" r={isDark ? "2.5" : "2"}/>
              <circle cx="50" cy="38" r={isDark ? "2.5" : "2"}/>
            </g>
          </g>
        )}

        {/* Text */}
        {showText && !isIcon && (
          <g transform={`translate(0, 65)`}>
            <text 
              fontFamily="-apple-system, SF Pro Display, Helvetica Neue, Arial"
              fontSize={dimensions.fontSize}
              fontWeight="600"
              textAnchor="middle"
              fill={isDark ? "#FFFFFF" : "#1D1D1F"}
            >
              <tspan>Mai</tspan>
              <tspan fill={isDark ? "#BF5AF2" : "#5856D6"} fontWeight="700">Farm</tspan>
            </text>
          </g>
        )}
      </g>

      {/* Version indicator */}
      {!isIcon && showText && (
        <text 
          x="170" 
          y="30"
          fontFamily="-apple-system, SF Pro Display, Helvetica Neue, Arial"
          fontSize="12"
          fontWeight="500"
          fill="#8E8E93"
        >
          v2
        </text>
      )}
    </svg>
  );
};

export default MaiFarmLogo;