// Global glass morphism configuration
export const glassConfig = {
  // Enable/disable glass effects globally
  enabled: true,
  
  // Performance settings
  performance: {
    // Automatically reduce effects on low-end devices
    autoOptimize: true,
    // Maximum blur radius in pixels
    maxBlur: 24,
    // Disable on mobile devices
    disableOnMobile: false,
    // Reduce effects when battery is low
    reducedOnLowBattery: true
  },
  
  // Visual settings
  visual: {
    // Default blur intensity (1-10)
    blurIntensity: 7,
    // Glass opacity (0-1)
    opacity: 0.72,
    // Color saturation multiplier
    saturation: 1.2,
    // Enable noise texture overlay
    noiseTexture: true,
    // Enable gradient overlays
    gradientOverlays: true,
    // Enable inner shadows
    innerShadows: true
  },
  
  // Animation settings
  animations: {
    // Enable hover effects
    hoverEffects: true,
    // Enable entrance animations
    entranceAnimations: true,
    // Animation duration in ms
    duration: 300,
    // Easing function
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  },
  
  // Accessibility settings
  accessibility: {
    // Respect prefers-reduced-motion
    respectMotionPreference: true,
    // Ensure minimum contrast ratios
    enforceContrast: true,
    // Add focus indicators
    enhancedFocus: true
  },
  
  // Theme-specific overrides
  themes: {
    light: {
      opacity: 0.72,
      blurIntensity: 7,
      borderOpacity: 0.3
    },
    dark: {
      opacity: 0.65,
      blurIntensity: 8,
      borderOpacity: 0.15
    }
  }
}

// Utility to check if glass effects should be enabled
export function shouldEnableGlass(): boolean {
  if (!glassConfig.enabled) return false
  
  // Check for browser support
  const supportsBackdropFilter = 
    CSS.supports('backdrop-filter', 'blur(10px)') || 
    CSS.supports('-webkit-backdrop-filter', 'blur(10px)')
  
  if (!supportsBackdropFilter) return false
  
  // Check for performance mode
  if (glassConfig.performance.autoOptimize) {
    // Check device pixel ratio
    if (window.devicePixelRatio > 2) return false
    
    // Check for mobile
    if (glassConfig.performance.disableOnMobile && 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return false
    }
    
    // NOTE: Battery API check removed - it's deprecated on iOS/macOS Safari
    // and the async nature prevents it from working correctly in this sync function
    // Low battery mode detection is handled by useMobileOptimization hook instead
  }
  
  // Check accessibility preferences
  if (glassConfig.accessibility.respectMotionPreference) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return false
  }
  
  return true
}

// Get glass configuration for current theme
export function getGlassConfig(isDark: boolean) {
  const themeConfig = isDark ? glassConfig.themes.dark : glassConfig.themes.light
  
  return {
    ...glassConfig.visual,
    ...themeConfig,
    animations: glassConfig.animations,
    accessibility: glassConfig.accessibility
  }
}