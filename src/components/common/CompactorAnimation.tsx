import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFarmStore } from '../../store/farmStore';
import { useThemeStore } from '../../store/themeStore';

interface CompactorAnimationProps {
  targetColor?: string;
  newColor?: string;
  className?: string;
  forceAnimate?: boolean;
}

const CompactorAnimation: React.FC<CompactorAnimationProps> = ({
  targetColor = '#00CC99',
  newColor = '#FFD700',
  className = '',
  forceAnimate = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compactorRef = useRef({ x: 0, y: 0, speed: 3, currentPass: 0 });
  const animationRef = useRef<number>();
  const [isAnimating, setAnimating] = useState(false);

  const { activeFarms } = useFarmStore();
  const { theme, colorScheme } = useThemeStore();

  const isDarkMode = theme === 'dark' || 
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Use the same logic as DynamicLogo for consistent logo selection
  const logoSrc = useMemo(() => {
    const colorId = colorScheme.id;
    const themeMode = isDarkMode ? 'dark' : 'light';
    
    // Check if custom logo exists for this color scheme
    if (colorId === 'forest-walk' || colorId === 'custom') {
      // Use default logos
      return `/maifarm-logo-${themeMode}-bkgd.svg`;
    } else {
      // Use color-specific logos (to be created manually)
      return `/maifarm-logo-${colorId}-${themeMode}.svg`;
    }
  }, [colorScheme, isDarkMode]);

  useEffect(() => {
    setAnimating(forceAnimate || activeFarms.length > 0);
  }, [activeFarms, forceAnimate]);

  useEffect(() => {
    if (!isAnimating) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const logoImg = new Image();
    const compactorImg = new Image();

    logoImg.src = logoSrc;
    compactorImg.src = '/farm-compactor.svg';

    const totalPasses = 5;
    const actualNewColor = newColor || colorScheme.accent || '#FFD700';
    let imagesLoaded = 0;

    const checkImagesLoaded = () => {
      imagesLoaded++;
      if (imagesLoaded === 2) {
        draw();
      }
    };

    const draw = () => {
      if (!canvas || !ctx) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const logoWidth = canvas.width * 0.7;
      const logoHeight = logoImg.complete ? logoWidth * (logoImg.height / logoImg.width) : logoWidth;
      const logoX = (canvas.width - logoWidth) / 2;
      const logoY = (canvas.height - logoHeight) / 2;

      // Draw logo
      if (logoImg.complete && logoImg.width > 0) {
        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
      }

      const compactorWidth = 120;
      const compactorHeight = 80;

      const sectionHeight = logoHeight / totalPasses;
      compactorRef.current.y = logoY + compactorRef.current.currentPass * sectionHeight + sectionHeight / 2 - compactorHeight / 2;

      compactorRef.current.x += compactorRef.current.speed;

      if (compactorRef.current.x > logoX + logoWidth) {
        compactorRef.current.x = logoX - compactorWidth;
        compactorRef.current.currentPass = (compactorRef.current.currentPass + 1) % totalPasses;
      }

      // Draw color overlay for completed sections
      for (let pass = 0; pass <= compactorRef.current.currentPass; pass++) {
        const sectionY = logoY + pass * sectionHeight;
        const fillWidth = pass === compactorRef.current.currentPass ? 
          Math.max(0, compactorRef.current.x - logoX + compactorWidth / 2) : logoWidth;
        
        // Create gradient effect
        const gradient = ctx.createLinearGradient(logoX, sectionY, logoX + fillWidth, sectionY);
        gradient.addColorStop(0, `${actualNewColor}99`);
        gradient.addColorStop(1, `${actualNewColor}66`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(logoX, sectionY, fillWidth, sectionHeight);
      }

      // Mask with logo shape
      if (logoImg.complete && logoImg.width > 0) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Draw compactor image on top
      if (compactorImg.complete && compactorImg.width > 0) {
        ctx.drawImage(compactorImg, compactorRef.current.x, compactorRef.current.y, compactorWidth, compactorHeight);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    logoImg.onload = checkImagesLoaded;
    logoImg.onerror = () => {
      console.error('Failed to load logo:', logoSrc);
      checkImagesLoaded();
    };
    
    compactorImg.onload = checkImagesLoaded;
    compactorImg.onerror = () => {
      console.error('Failed to load compactor image');
      checkImagesLoaded();
    };

    // Handle already loaded images
    if (logoImg.complete) checkImagesLoaded();
    if (compactorImg.complete) checkImagesLoaded();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating, logoSrc, newColor, colorScheme]);

  return (
    <div className={`relative w-full h-64 overflow-hidden bg-gray-50 dark:bg-gray-900 ${className}`}>
      {isAnimating ? (
        <canvas ref={canvasRef} className="w-full h-full block" />
      ) : (
        <div className="flex items-center justify-center h-full">
          <img 
            src={logoSrc} 
            alt="MaiFarm Logo" 
            className="max-w-[70%] max-h-[70%] object-contain"
            onError={(e) => {
              console.error('Logo failed to load:', logoSrc);
              // Fallback to a text display if logo fails
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = document.createElement('div');
              fallback.className = 'text-4xl font-bold text-gray-400 dark:text-gray-600';
              fallback.textContent = 'MaiFarm';
              target.parentElement?.appendChild(fallback);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default CompactorAnimation;