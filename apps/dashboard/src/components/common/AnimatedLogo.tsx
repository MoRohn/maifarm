import React, { useEffect, useRef, useState } from 'react';
import { useFarmStore } from '@/store/farmStore';
import { useThemeStore } from '@/store/themeStore';
import { DynamicLogo } from './DynamicLogo';

interface AnimatedLogoProps {
  className?: string;
  variant?: 'icon' | 'logo' | 'wordmark';
  animationSpeed?: number;
  waveColor?: string;
  enableAnimation?: boolean;
}

export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({
  className = '',
  variant = 'logo',
  animationSpeed = 2,
  waveColor,
  enableAnimation = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const wavePositionRef = useRef(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  const { activeFarms } = useFarmStore();
  const { theme, colorScheme } = useThemeStore();

  const isDarkMode = theme === 'dark' || 
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const defaultWaveColor = waveColor || colorScheme.accent || '#FFD700';

  useEffect(() => {
    setIsAnimating(enableAnimation && activeFarms.length > 0);
  }, [activeFarms, enableAnimation]);

  useEffect(() => {
    if (!isAnimating || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create wave effect
      const waveHeight = 20;
      const waveSpeed = animationSpeed;
      
      wavePositionRef.current += waveSpeed;
      
      // Draw multiple wave passes
      for (let pass = 0; pass < 3; pass++) {
        const offset = pass * (canvas.height / 3);
        const opacity = 0.3 - (pass * 0.1);
        
        ctx.beginPath();
        ctx.moveTo(0, offset + canvas.height);
        
        for (let x = 0; x <= canvas.width; x++) {
          const y = offset + canvas.height / 2 + 
            Math.sin((x * 0.02) + (wavePositionRef.current * 0.01) - (pass * Math.PI / 3)) * waveHeight;
          ctx.lineTo(x, y);
        }
        
        ctx.lineTo(canvas.width, offset + canvas.height);
        ctx.closePath();
        
        // Apply gradient
        const gradient = ctx.createLinearGradient(0, offset, 0, offset + canvas.height);
        gradient.addColorStop(0, `${defaultWaveColor}00`);
        gradient.addColorStop(0.5, `${defaultWaveColor}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`);
        gradient.addColorStop(1, `${defaultWaveColor}00`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Add particle effects
      const particleCount = 5;
      for (let i = 0; i < particleCount; i++) {
        const particleX = (wavePositionRef.current * 2 + i * 100) % (canvas.width + 100) - 50;
        const particleY = canvas.height / 2 + Math.sin(wavePositionRef.current * 0.02 + i) * 30;
        const particleSize = 2 + Math.sin(wavePositionRef.current * 0.05 + i) * 2;
        
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
        ctx.fillStyle = `${defaultWaveColor}80`;
        ctx.fill();
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = defaultWaveColor;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating, defaultWaveColor, animationSpeed]);

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={logoRef}
        className={`relative z-10 ${isAnimating ? 'animate-pulse' : ''}`}
        style={{
          filter: isAnimating ? `drop-shadow(0 0 20px ${defaultWaveColor}40)` : undefined
        }}
      >
        <DynamicLogo 
          variant={variant}
          className="w-full h-full"
        />
      </div>
      
      {isAnimating && (
        <>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: 'screen' }}
          />
          
          {/* Processing indicator */}
          <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/80 rounded-full backdrop-blur-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: defaultWaveColor,
                      animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-300">Processing {activeFarms.length} farm{activeFarms.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </>
      )}
      
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};