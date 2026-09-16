import { useState, useEffect, useCallback, useMemo } from 'react'
import { useThemeStore } from '@/store/themeStore'

interface GlassConfig {
  blur: number
  opacity: number
  saturation: number
  brightness: number
  borderOpacity: number
  shadowIntensity: number
  noiseOpacity: number
}

interface UseGlassMorphismOptions {
  variant?: 'light' | 'medium' | 'heavy' | 'ultra'
  responsive?: boolean
  performanceMode?: boolean
  customConfig?: Partial<GlassConfig>
}

const defaultConfigs: Record<string, GlassConfig> = {
  light: {
    blur: 8,
    opacity: 0.4,
    saturation: 1.1,
    brightness: 1.05,
    borderOpacity: 0.2,
    shadowIntensity: 0.1,
    noiseOpacity: 0.02
  },
  medium: {
    blur: 12,
    opacity: 0.72,
    saturation: 1.2,
    brightness: 1.0,
    borderOpacity: 0.3,
    shadowIntensity: 0.15,
    noiseOpacity: 0.03
  },
  heavy: {
    blur: 20,
    opacity: 0.85,
    saturation: 1.3,
    brightness: 0.95,
    borderOpacity: 0.4,
    shadowIntensity: 0.2,
    noiseOpacity: 0.04
  },
  ultra: {
    blur: 32,
    opacity: 0.92,
    saturation: 1.5,
    brightness: 0.9,
    borderOpacity: 0.5,
    shadowIntensity: 0.25,
    noiseOpacity: 0.05
  }
}

export function useGlassMorphism({
  variant = 'medium',
  responsive = true,
  performanceMode = false,
  customConfig
}: UseGlassMorphismOptions = {}) {
  const theme = useThemeStore(state => state.theme)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  
  const [isReducedMotion, setIsReducedMotion] = useState(false)
  const [devicePixelRatio, setDevicePixelRatio] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  
  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setIsReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])
  
  // Track device pixel ratio for performance optimization
  useEffect(() => {
    setDevicePixelRatio(window.devicePixelRatio || 1)
    
    const handleResize = () => {
      setDevicePixelRatio(window.devicePixelRatio || 1)
      setViewportWidth(window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Get the base configuration
  const baseConfig = useMemo(() => {
    const config = { ...defaultConfigs[variant], ...customConfig }
    
    // Adjust for dark mode
    if (isDark) {
      config.opacity *= 0.9
      config.brightness *= 0.8
      config.shadowIntensity *= 1.5
    }
    
    // Performance optimizations
    if (performanceMode || devicePixelRatio > 2 || viewportWidth < 768) {
      config.blur = Math.min(config.blur, 12)
      config.noiseOpacity = 0
    }
    
    // Reduced motion
    if (isReducedMotion) {
      config.blur = Math.min(config.blur, 8)
    }
    
    return config
  }, [variant, customConfig, isDark, performanceMode, devicePixelRatio, viewportWidth, isReducedMotion])
  
  // Generate CSS styles
  const glassStyles = useMemo(() => {
    const { blur, opacity, saturation, brightness, borderOpacity, shadowIntensity, noiseOpacity } = baseConfig
    
    const bgColor = isDark
      ? `rgba(20, 20, 28, ${opacity})`
      : `rgba(255, 255, 255, ${opacity})`
    
    const borderColor = isDark
      ? `rgba(255, 255, 255, ${borderOpacity * 0.5})`
      : `rgba(255, 255, 255, ${borderOpacity})`
    
    const shadow = isDark
      ? `0 8px 32px rgba(0, 0, 0, ${shadowIntensity * 2})`
      : `0 8px 32px rgba(0, 0, 0, ${shadowIntensity})`
    
    return {
      backgroundColor: bgColor,
      backdropFilter: `blur(${blur}px) saturate(${saturation}) brightness(${brightness})`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation}) brightness(${brightness})`,
      border: `1px solid ${borderColor}`,
      boxShadow: shadow,
      '--glass-noise-opacity': noiseOpacity,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    } as React.CSSProperties
  }, [baseConfig, isDark])
  
  // Generate class names for Tailwind
  const glassClasses = useCallback((additionalClasses = '') => {
    const classes = [
      'glass',
      variant === 'light' && 'glass-subtle',
      variant === 'heavy' && 'glass-heavy',
      variant === 'ultra' && 'glass-modal',
      performanceMode && 'glass-performance',
      responsive && 'glass-responsive',
      additionalClasses
    ].filter(Boolean).join(' ')
    
    return classes
  }, [variant, performanceMode, responsive])
  
  // Utility function to apply glass to an element
  const applyGlass = useCallback((element: HTMLElement | null) => {
    if (!element) return
    
    Object.entries(glassStyles).forEach(([key, value]) => {
      if (key.startsWith('--')) {
        element.style.setProperty(key, String(value))
      } else {
        (element.style as any)[key] = value
      }
    })
  }, [glassStyles])
  
  // Utility to check if glass effects are supported
  const isSupported = useMemo(() => {
    return CSS.supports('backdrop-filter', 'blur(10px)') || 
           CSS.supports('-webkit-backdrop-filter', 'blur(10px)')
  }, [])
  
  return {
    glassStyles,
    glassClasses,
    applyGlass,
    isSupported,
    config: baseConfig,
    isDark,
    isReducedMotion,
    performanceMode: performanceMode || devicePixelRatio > 2 || viewportWidth < 768
  }
}

// Preset glass effects for common use cases
export const glassPresets = {
  card: {
    variant: 'medium' as const,
    customConfig: {
      blur: 16,
      opacity: 0.75,
      shadowIntensity: 0.12
    }
  },
  modal: {
    variant: 'heavy' as const,
    customConfig: {
      blur: 24,
      opacity: 0.88,
      shadowIntensity: 0.25
    }
  },
  navigation: {
    variant: 'medium' as const,
    customConfig: {
      blur: 12,
      opacity: 0.8,
      borderOpacity: 0.2
    }
  },
  button: {
    variant: 'light' as const,
    customConfig: {
      blur: 8,
      opacity: 0.5,
      shadowIntensity: 0.05
    }
  },
  sidebar: {
    variant: 'heavy' as const,
    customConfig: {
      blur: 20,
      opacity: 0.85,
      borderOpacity: 0.15
    }
  },
  overlay: {
    variant: 'ultra' as const,
    customConfig: {
      blur: 40,
      opacity: 0.95,
      noiseOpacity: 0
    }
  }
}