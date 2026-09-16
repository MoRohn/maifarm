/**
 * useAccessibility - Custom React hooks for accessibility features
 * Provides easy-to-use hooks for common accessibility patterns
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  announcer,
  focusManager,
  handleKeyboardNavigation,
  prefersReducedMotion,
  prefersHighContrast,
  announceRouteChange,
  type AriaLive,
  type KeyboardNavigationOptions,
  KEYS,
} from '@/utils/accessibility';

/**
 * Hook for screen reader announcements
 */
export function useAnnouncer() {
  const announce = useCallback((
    message: string,
    politeness: AriaLive = 'polite',
    delay?: number
  ) => {
    announcer.announce(message, politeness, delay);
  }, []);

  const announceError = useCallback((message: string) => {
    announcer.announceError(message);
  }, []);

  const announceSuccess = useCallback((message: string) => {
    announcer.announceSuccess(message);
  }, []);

  return {
    announce,
    announceError,
    announceSuccess,
  };
}

/**
 * Hook for focus trapping
 */
export function useFocusTrap(
  isActive: boolean = true,
  containerRef?: React.RefObject<HTMLElement>
) {
  const internalRef = useRef<HTMLElement>(null);
  const ref = containerRef || internalRef;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      cleanupRef.current = focusManager.trapFocus(ref.current);
      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;
      };
    }
  }, [isActive, ref]);

  return ref;
}

/**
 * Hook for keyboard navigation
 */
export function useKeyboardNavigation(
  options: KeyboardNavigationOptions,
  deps: React.DependencyList = []
) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    handleKeyboardNavigation(e, options);
  }, deps);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return handleKeyDown;
}

/**
 * Hook for arrow key navigation
 */
export function useArrowNavigation(
  itemCount: number,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
    onEscape?: () => void;
    initialIndex?: number;
  } = {}
) {
  const {
    orientation = 'vertical',
    loop = true,
    onSelect,
    onEscape,
    initialIndex = -1,
  } = options;

  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  const moveFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    setFocusedIndex(current => {
      let newIndex = current;

      if (direction === 'up' || (direction === 'left' && orientation !== 'vertical')) {
        newIndex = current - 1;
        if (newIndex < 0) {
          newIndex = loop ? itemCount - 1 : 0;
        }
      } else if (direction === 'down' || (direction === 'right' && orientation !== 'vertical')) {
        newIndex = current + 1;
        if (newIndex >= itemCount) {
          newIndex = loop ? 0 : itemCount - 1;
        }
      }

      return newIndex;
    });
  }, [itemCount, loop, orientation]);

  useKeyboardNavigation({
    onArrowUp: orientation !== 'horizontal' ? () => moveFocus('up') : undefined,
    onArrowDown: orientation !== 'horizontal' ? () => moveFocus('down') : undefined,
    onArrowLeft: orientation !== 'vertical' ? () => moveFocus('left') : undefined,
    onArrowRight: orientation !== 'vertical' ? () => moveFocus('right') : undefined,
    onHome: () => setFocusedIndex(0),
    onEnd: () => setFocusedIndex(itemCount - 1),
    onEnter: () => {
      if (focusedIndex >= 0 && focusedIndex < itemCount) {
        onSelect?.(focusedIndex);
      }
    },
    onEscape: onEscape,
  }, [itemCount, orientation, loop, focusedIndex, onSelect, onEscape]);

  return {
    focusedIndex,
    setFocusedIndex,
    moveFocus,
  };
}

/**
 * Hook for managing focus restoration
 */
export function useFocusRestore() {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current && previousFocusRef.current.focus) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      restoreFocus();
    };
  }, [restoreFocus]);

  return {
    saveFocus,
    restoreFocus,
  };
}

/**
 * Hook for detecting user preferences
 */
export function useAccessibilityPreferences() {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion());
  const [highContrast, setHighContrast] = useState(prefersHighContrast());

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    const handleContrastChange = (e: MediaQueryListEvent) => {
      setHighContrast(e.matches);
    };

    // Modern browsers
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', handleMotionChange);
      contrastQuery.addEventListener('change', handleContrastChange);

      return () => {
        motionQuery.removeEventListener('change', handleMotionChange);
        contrastQuery.removeEventListener('change', handleContrastChange);
      };
    }

    // Legacy browsers
    motionQuery.addListener?.(handleMotionChange);
    contrastQuery.addListener?.(handleContrastChange);

    return () => {
      motionQuery.removeListener?.(handleMotionChange);
      contrastQuery.removeListener?.(handleContrastChange);
    };
  }, []);

  return {
    reducedMotion,
    highContrast,
  };
}

/**
 * Hook for roving tabindex pattern
 */
export function useRovingTabIndex(
  itemCount: number,
  options: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
  } = {}
) {
  const [activeIndex, setActiveIndex] = useState(0);

  const getTabIndex = useCallback((index: number) => {
    return index === activeIndex ? 0 : -1;
  }, [activeIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const { orientation = 'horizontal', loop = true } = options;

    let newIndex = index;
    let handled = false;

    if ((orientation === 'horizontal' && e.key === KEYS.ARROW_RIGHT) ||
        (orientation === 'vertical' && e.key === KEYS.ARROW_DOWN)) {
      newIndex = index + 1;
      if (newIndex >= itemCount) {
        newIndex = loop ? 0 : itemCount - 1;
      }
      handled = true;
    } else if ((orientation === 'horizontal' && e.key === KEYS.ARROW_LEFT) ||
               (orientation === 'vertical' && e.key === KEYS.ARROW_UP)) {
      newIndex = index - 1;
      if (newIndex < 0) {
        newIndex = loop ? itemCount - 1 : 0;
      }
      handled = true;
    } else if (e.key === KEYS.HOME) {
      newIndex = 0;
      handled = true;
    } else if (e.key === KEYS.END) {
      newIndex = itemCount - 1;
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      setActiveIndex(newIndex);

      // Focus the new element
      const element = e.currentTarget.parentElement?.children[newIndex] as HTMLElement;
      element?.focus();
    }
  }, [itemCount, options]);

  return {
    activeIndex,
    getTabIndex,
    handleKeyDown,
  };
}

/**
 * Hook for managing live regions
 */
export function useLiveRegion(
  ariaLive: AriaLive = 'polite',
  ariaAtomic: boolean = true
) {
  const [message, setMessage] = useState('');
  const regionRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((text: string) => {
    setMessage('');
    setTimeout(() => setMessage(text), 100);
  }, []);

  return {
    regionProps: {
      ref: regionRef,
      role: 'status',
      'aria-live': ariaLive,
      'aria-atomic': ariaAtomic,
      'aria-relevant': 'additions text',
      className: 'sr-only',
    },
    announce,
    message,
  };
}

/**
 * Hook for skip navigation links
 */
export function useSkipLinks(targets: Array<{ id: string; label: string }>) {
  const [isVisible, setIsVisible] = useState(false);

  const handleFocus = useCallback(() => {
    setIsVisible(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsVisible(false);
  }, []);

  const skipTo = useCallback((targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return {
    isVisible,
    handleFocus,
    handleBlur,
    skipTo,
    targets,
  };
}

/**
 * Hook for managing ARIA descriptions
 */
export function useAriaDescriptions() {
  const [descriptions, setDescriptions] = useState<Map<string, string>>(new Map());
  const idCounterRef = useRef(0);

  const addDescription = useCallback((text: string): string => {
    const id = `aria-desc-${Date.now()}-${++idCounterRef.current}`;
    setDescriptions(prev => new Map(prev).set(id, text));
    return id;
  }, []);

  const removeDescription = useCallback((id: string) => {
    setDescriptions(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updateDescription = useCallback((id: string, text: string) => {
    setDescriptions(prev => new Map(prev).set(id, text));
  }, []);

  return {
    descriptions,
    addDescription,
    removeDescription,
    updateDescription,
  };
}

/**
 * Hook for route change announcements
 */
export function useRouteAnnouncer() {
  useEffect(() => {
    // Get current route from window location
    const pageName = document.title || 'New page';
    announceRouteChange(pageName);
  }, []);
}