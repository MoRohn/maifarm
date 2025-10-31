import { useEffect, useRef, useCallback, RefObject, useState } from 'react';
import { useMediaQuery } from './useResponsive';

interface UseAccessibilityOptions {
  role?: string;
  label?: string;
  description?: string;
  live?: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
  relevant?: string;
}

export const useAccessibility = <T extends HTMLElement = HTMLElement>(
  options: UseAccessibilityOptions = {}
) => {
  const ref = useRef<T>(null);
  const { role, label, description, live, atomic, relevant } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (role) element.setAttribute('role', role);
    if (label) element.setAttribute('aria-label', label);
    if (description) element.setAttribute('aria-describedby', description);
    if (live) element.setAttribute('aria-live', live);
    if (atomic !== undefined) element.setAttribute('aria-atomic', String(atomic));
    if (relevant) element.setAttribute('aria-relevant', relevant);

    return () => {
      if (role) element.removeAttribute('role');
      if (label) element.removeAttribute('aria-label');
      if (description) element.removeAttribute('aria-describedby');
      if (live) element.removeAttribute('aria-live');
      if (atomic !== undefined) element.removeAttribute('aria-atomic');
      if (relevant) element.removeAttribute('aria-relevant');
    };
  }, [role, label, description, live, atomic, relevant]);

  return ref;
};

export const useFocusTrap = <T extends HTMLElement = HTMLElement>(
  isActive = true
): RefObject<T> => {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isActive || !ref.current) return;

    const container = ref.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  return ref;
};

export const useAnnouncement = () => {
  const announcementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    document.body.appendChild(announcement);
    announcementRef.current = announcement;

    return () => {
      document.body.removeChild(announcement);
      announcementRef.current = null;
    };
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (!announcementRef.current) return;

    announcementRef.current.setAttribute('aria-live', priority);
    announcementRef.current.textContent = message;

    // Clear after announcement
    setTimeout(() => {
      if (announcementRef.current) {
        announcementRef.current.textContent = '';
      }
    }, 1000);
  }, []);

  return announce;
};

export const useKeyboardNavigation = <T extends HTMLElement = HTMLElement>(
  items: RefObject<T>[],
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
  } = {}
) => {
  const { orientation = 'vertical', loop = true, onSelect } = options;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let nextIndex = activeIndex;

      switch (e.key) {
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            e.preventDefault();
            nextIndex = activeIndex - 1;
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            e.preventDefault();
            nextIndex = activeIndex + 1;
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            e.preventDefault();
            nextIndex = activeIndex - 1;
          }
          break;
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            e.preventDefault();
            nextIndex = activeIndex + 1;
          }
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = items.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(activeIndex);
          return;
        default:
          return;
      }

      if (loop) {
        nextIndex = (nextIndex + items.length) % items.length;
      } else {
        nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
      }

      setActiveIndex(nextIndex);
      items[nextIndex]?.current?.focus();
    };

    const activeItem = items[activeIndex]?.current;
    if (activeItem) {
      activeItem.addEventListener('keydown', handleKeyDown);
      return () => activeItem.removeEventListener('keydown', handleKeyDown);
    }
  }, [activeIndex, items, orientation, loop, onSelect]);

  return { activeIndex, setActiveIndex };
};

export const useHighContrast = () => {
  return useMediaQuery('(prefers-contrast: high)');
};

export const useColorScheme = () => {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersLight = useMediaQuery('(prefers-color-scheme: light)');
  
  return {
    prefersDark,
    prefersLight,
    scheme: prefersDark ? 'dark' : 'light',
  };
};