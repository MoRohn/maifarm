import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocketStore } from '@/store/websocketStore';

interface MobileOptimizationOptions {
  enableHapticFeedback?: boolean;
  enablePullToRefresh?: boolean;
  enableSwipeGestures?: boolean;
  enableVirtualScrolling?: boolean;
  enableLazyLoading?: boolean;
  enableMemoryManagement?: boolean;
}

interface DeviceInfo {
  isIOS: boolean;
  isIPad: boolean;
  isIPhone: boolean;
  isSafari: boolean;
  isMobile: boolean;
  isTablet: boolean;
  hasNotch: boolean;
  devicePixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  connection: 'fast' | 'slow' | 'offline';
  batteryLevel: number | null;
  isLowPowerMode: boolean;
  memoryUsage: number;
  hasReducedMotion: boolean;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsed: number;
  jsHeapSize: number;
  loadTime: number;
  renderTime: number;
  networkLatency: number;
}

/**
 * Custom hook for iOS and mobile optimization
 * Provides device detection, performance monitoring, and mobile-specific features
 */
export const useMobileOptimization = (options: MobileOptimizationOptions = {}) => {
  const {
    enableHapticFeedback = true,
    enablePullToRefresh = true,
    enableSwipeGestures = true,
    enableVirtualScrolling = true,
    enableLazyLoading = true,
    enableMemoryManagement = true,
  } = options;

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => detectDevice());
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memoryUsed: 0,
    jsHeapSize: 0,
    loadTime: 0,
    renderTime: 0,
    networkLatency: 0,
  });
  const [isAppActive, setIsAppActive] = useState(true);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>('online');

  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number>();

  // Detect device characteristics
  function detectDevice(): DeviceInfo {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;

    // ENHANCED iPad detection to avoid false positives on M1/M2 Macs with trackpads
    // iPadOS Safari reports as macOS/Safari, but we can distinguish using multiple signals
    const isIPadUA = /iPad/.test(ua);

    // Check if this looks like iPadOS Safari masquerading as macOS
    // iPadOS has touch points > 1, platform 'MacIntel', and orientation API
    // Real Macs also have platform 'MacIntel' but no orientation API or different touch behavior
    const isMacIntelPlatform = navigator.platform === 'MacIntel';
    const hasTouchScreen = navigator.maxTouchPoints > 1;

    // Key differentiator: window.orientation is deprecated and only exists on mobile devices
    // Safari on Mac doesn't have this, but iPadOS Safari does
    const hasOrientationAPI = typeof window.orientation !== 'undefined';

    // Additional check: standalone display mode (PWA) - Macs don't typically have this
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;

    // Real iPads also respond to touch-coarse media query
    const hasTouchCoarse = window.matchMedia('(pointer: coarse)').matches;

    // Final iPad detection:
    // 1. Explicit iPad in UA string, OR
    // 2. MacIntel + touch + orientation API (iPadOS masquerading), OR
    // 3. MacIntel + touch + coarse pointer (another iPadOS signal)
    // This prevents M1/M2 Macs with trackpads from being detected as iPads
    const isIPad = isIPadUA ||
      (isMacIntelPlatform && hasTouchScreen && (hasOrientationAPI || hasTouchCoarse)) ||
      (isMacIntelPlatform && hasTouchScreen && isStandalone);

    const isIPhone = /iPhone/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isMobile = /Mobile|Android|iPhone/i.test(ua);
    const isTablet = /iPad|Android.*Tablet/i.test(ua) || isIPad;

    // Detect iPhone notch (iPhone X and later)
    // CRITICAL FIX: Added iPhone 16 series screen dimensions
    const hasNotch = isIPhone && (
      (screen.height === 812 && screen.width === 375) || // iPhone X, XS, 11 Pro
      (screen.height === 896 && screen.width === 414) || // iPhone XR, XS Max, 11, 11 Pro Max
      (screen.height === 844 && screen.width === 390) || // iPhone 12, 12 Pro, 13, 13 Pro, 14, 14 Pro
      (screen.height === 926 && screen.width === 428) || // iPhone 12 Pro Max, 13 Pro Max, 14 Plus, 14 Pro Max
      (screen.height === 852 && screen.width === 393) || // iPhone 15, 15 Pro
      (screen.height === 932 && screen.width === 430) || // iPhone 15 Plus, 15 Pro Max
      (screen.height === 874 && screen.width === 402) || // iPhone 16, 16 Pro
      (screen.height === 956 && screen.width === 440)    // iPhone 16 Plus, 16 Pro Max
    );

    // Detect connection speed
    const connection = (navigator as any).connection;
    let connectionType: 'fast' | 'slow' | 'offline' = 'fast';
    if (!navigator.onLine) {
      connectionType = 'offline';
    } else if (connection) {
      const effectiveType = connection.effectiveType;
      if (effectiveType === '2g' || effectiveType === '3g' || connection.downlink < 1.5) {
        connectionType = 'slow';
      }
    }

    // Detect reduced motion preference
    const hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
      isIOS,
      isIPad,
      isIPhone,
      isSafari,
      isMobile,
      isTablet,
      hasNotch,
      devicePixelRatio: window.devicePixelRatio || 1,
      screenWidth: screen.width,
      screenHeight: screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      connection: connectionType,
      batteryLevel: null,
      isLowPowerMode: false,
      memoryUsage: 0,
      hasReducedMotion,
    };
  }

  // Monitor FPS
  const monitorFPS = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;

    if (now >= lastFrameTimeRef.current + 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / (now - lastFrameTimeRef.current));
      setPerformanceMetrics(prev => ({ ...prev, fps }));
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }

    rafIdRef.current = requestAnimationFrame(monitorFPS);
  }, []);

  // Monitor memory usage
  const monitorMemory = useCallback(() => {
    if ((performance as any).memory) {
      const memoryInfo = (performance as any).memory;
      setPerformanceMetrics(prev => ({
        ...prev,
        memoryUsed: Math.round(memoryInfo.usedJSHeapSize / 1048576), // Convert to MB
        jsHeapSize: Math.round(memoryInfo.totalJSHeapSize / 1048576),
      }));
    }
  }, []);

  // Haptic feedback (iOS specific)
  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!enableHapticFeedback || !deviceInfo.isIOS) return;

    // Use the Taptic Engine API if available
    if ('vibrate' in navigator) {
      const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 30;
      navigator.vibrate(duration);
    }

    // For iOS Safari, we can trigger haptic feedback through certain interactions
    // This is a workaround since direct haptic API access is limited
    if (window.webkit?.messageHandlers?.haptic) {
      window.webkit.messageHandlers.haptic.postMessage(style);
    }
  }, [enableHapticFeedback, deviceInfo.isIOS]);

  // Handle pull-to-refresh
  const setupPullToRefresh = useCallback(() => {
    if (!enablePullToRefresh || !deviceInfo.isMobile) return;

    let startY = 0;
    let pullDistance = 0;
    const threshold = 80;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].pageY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!startY) return;

      const currentY = e.touches[0].pageY;
      pullDistance = currentY - startY;

      if (pullDistance > 0 && window.scrollY === 0) {
        e.preventDefault();

        if (pullDistance > threshold) {
          // Trigger refresh
          document.dispatchEvent(new CustomEvent('pulltorefresh'));
          triggerHaptic('medium');
        }
      }
    };

    const handleTouchEnd = () => {
      startY = 0;
      pullDistance = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enablePullToRefresh, deviceInfo.isMobile, triggerHaptic]);

  // Optimize images for mobile
  const optimizeImage = useCallback((src: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'jpeg';
  }) => {
    if (!deviceInfo.isMobile) return src;

    const { width, height, quality = 80, format = 'webp' } = options || {};

    // If using a CDN that supports image transformation
    if (src.includes('cloudinary') || src.includes('imagekit')) {
      const params = [];
      if (width) params.push(`w_${width}`);
      if (height) params.push(`h_${height}`);
      params.push(`q_${quality}`);
      params.push(`f_${format}`);

      return src.replace('/upload/', `/upload/${params.join(',')}/`);
    }

    return src;
  }, [deviceInfo.isMobile]);

  // Memory cleanup for mobile
  const cleanupMemory = useCallback(() => {
    if (!enableMemoryManagement) return;

    // Clear unused images from memory
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    });

    // Clear WebSocket message buffer if needed
    const wsStore = useWebSocketStore.getState();
    if (wsStore.messages.length > 100) {
      wsStore.clearOldMessages(100);
    }

    // Trigger garbage collection if available
    if ((window as any).gc) {
      (window as any).gc();
    }
  }, [enableMemoryManagement]);

  // Setup swipe gestures
  const setupSwipeGestures = useCallback(() => {
    if (!enableSwipeGestures || !deviceInfo.isMobile) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    };

    const handleSwipe = () => {
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const minSwipeDistance = 50;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > minSwipeDistance) {
          if (deltaX > 0) {
            document.dispatchEvent(new CustomEvent('swiperight'));
          } else {
            document.dispatchEvent(new CustomEvent('swipeleft'));
          }
          triggerHaptic('light');
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > minSwipeDistance) {
          if (deltaY > 0) {
            document.dispatchEvent(new CustomEvent('swipedown'));
          } else {
            document.dispatchEvent(new CustomEvent('swipeup'));
          }
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enableSwipeGestures, deviceInfo.isMobile, triggerHaptic]);

  // Battery monitoring
  // CRITICAL FIX: Battery API is deprecated on iOS/macOS Safari - use safe detection
  useEffect(() => {
    // Battery Status API is deprecated and unavailable on iOS/macOS Safari
    // Only attempt on Chromium-based browsers where it's still supported
    const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/Safari/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    // Skip battery monitoring on Safari (iOS/macOS) - API not supported
    if (isSafari || !isChromium) {
      // Default to full battery assumption when API unavailable
      setDeviceInfo(prev => ({
        ...prev,
        batteryLevel: 1.0,
        isLowPowerMode: false,
      }));
      return;
    }

    // Safe check for getBattery with try-catch for older browsers
    if (typeof navigator.getBattery !== 'function') return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const battery = await navigator.getBattery();
        const updateBatteryInfo = () => {
          setDeviceInfo(prev => ({
            ...prev,
            batteryLevel: battery.level,
            isLowPowerMode: battery.level < 0.2,
          }));
        };

        updateBatteryInfo();
        battery.addEventListener('levelchange', updateBatteryInfo);

        cleanup = () => {
          battery.removeEventListener('levelchange', updateBatteryInfo);
        };
      } catch (error) {
        // Battery API not available - use defaults
        console.debug('[MobileOptimization] Battery API unavailable:', error);
      }
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  // Network monitoring
  useEffect(() => {
    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // App lifecycle management
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsAppActive(isVisible);

      if (!isVisible && enableMemoryManagement) {
        // Clean up resources when app goes to background
        cleanupMemory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // iOS-specific lifecycle events
    const handlePageHide = () => {
      // Save state before app suspension
      if (deviceInfo.isIOS) {
        localStorage.setItem('appState', JSON.stringify({
          timestamp: Date.now(),
          suspended: true,
        }));
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && deviceInfo.isIOS) {
        // Restore from bfcache
        const savedState = localStorage.getItem('appState');
        if (savedState) {
          const state = JSON.parse(savedState);
          if (state.suspended) {
            // Reconnect WebSocket, refresh data, etc.
            document.dispatchEvent(new CustomEvent('appresumed'));
          }
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [deviceInfo.isIOS, enableMemoryManagement, cleanupMemory]);

  // Initialize optimizations
  useEffect(() => {
    // Start performance monitoring
    monitorFPS();
    const memoryInterval = setInterval(monitorMemory, 5000);

    // Setup mobile features
    const cleanupPullToRefresh = setupPullToRefresh();
    const cleanupSwipeGestures = setupSwipeGestures();

    // Memory cleanup interval
    const cleanupInterval = enableMemoryManagement
      ? setInterval(cleanupMemory, 60000) // Every minute
      : null;

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      clearInterval(memoryInterval);
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
      cleanupPullToRefresh?.();
      cleanupSwipeGestures?.();
    };
  }, [monitorFPS, monitorMemory, setupPullToRefresh, setupSwipeGestures, cleanupMemory, enableMemoryManagement]);

  return {
    deviceInfo,
    performanceMetrics,
    isAppActive,
    networkStatus,
    triggerHaptic,
    optimizeImage,
    cleanupMemory,

    // Feature flags based on device capabilities
    features: {
      canUseHaptics: deviceInfo.isIOS && enableHapticFeedback,
      canUsePullToRefresh: deviceInfo.isMobile && enablePullToRefresh,
      canUseSwipeGestures: deviceInfo.isMobile && enableSwipeGestures,
      shouldUseVirtualScrolling: deviceInfo.isMobile && enableVirtualScrolling,
      shouldLazyLoadImages: deviceInfo.isMobile && enableLazyLoading,
      shouldReduceAnimations: deviceInfo.hasReducedMotion || deviceInfo.isLowPowerMode,
      shouldUseOfflineMode: networkStatus === 'offline' || deviceInfo.connection === 'slow',
    },

    // iOS-specific helpers
    ios: {
      getSafeAreaInsets: () => ({
        top: deviceInfo.hasNotch ? 44 : 20,
        bottom: deviceInfo.hasNotch ? 34 : 0,
        left: 0,
        right: 0,
      }),
      getStatusBarHeight: () => deviceInfo.hasNotch ? 44 : 20,
      getHomeIndicatorHeight: () => deviceInfo.hasNotch ? 34 : 0,
    }
  };
};

// Export device detection utilities
export const iOSDevice = {
  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream,
  isIPad: () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  isIPhone: () => /iPhone/.test(navigator.userAgent),
  isSafari: () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  hasNotch: () => {
    const isIPhone = /iPhone/.test(navigator.userAgent);
    return isIPhone && (
      (screen.height === 812 && screen.width === 375) ||
      (screen.height === 896 && screen.width === 414) ||
      (screen.height === 844 && screen.width === 390) ||
      (screen.height === 926 && screen.width === 428) ||
      (screen.height === 852 && screen.width === 393) ||
      (screen.height === 932 && screen.width === 430)
    );
  }
};

// Type augmentation for WebKit message handlers
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        haptic?: {
          postMessage: (style: string) => void;
        };
      };
    };
    showErrorNotification?: (message: string) => void;
    showWarningNotification?: (message: string) => void;
  }
}