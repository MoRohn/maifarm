/**
 * Accessibility Utilities - WCAG 2.1 AA Compliance
 * Comprehensive accessibility helpers for iOS App Store requirements
 */

/**
 * ARIA live region politeness levels
 */
export type AriaLive = 'off' | 'polite' | 'assertive';

/**
 * Keyboard navigation keys
 */
export const KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

/**
 * Screen reader announcer class
 */
class ScreenReaderAnnouncer {
  private liveRegion: HTMLDivElement | null = null;
  private announceTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.createLiveRegion();
  }

  /**
   * Create ARIA live region for announcements
   */
  private createLiveRegion(): void {
    if (typeof document === 'undefined') return;

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.className = 'sr-only'; // Visually hidden but accessible
    this.liveRegion.style.cssText = `
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(this.liveRegion);
  }

  /**
   * Announce message to screen readers
   */
  public announce(
    message: string,
    politeness: AriaLive = 'polite',
    delay: number = 100
  ): void {
    if (!this.liveRegion) {
      this.createLiveRegion();
    }

    if (!this.liveRegion) return;

    // Clear any pending announcements
    if (this.announceTimeout) {
      clearTimeout(this.announceTimeout);
    }

    // Update politeness level
    this.liveRegion.setAttribute('aria-live', politeness);

    // Clear and set message with delay for reliability
    this.liveRegion.textContent = '';

    this.announceTimeout = setTimeout(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = message;

        // Clear after announcement
        setTimeout(() => {
          if (this.liveRegion) {
            this.liveRegion.textContent = '';
          }
        }, 1000);
      }
    }, delay);
  }

  /**
   * Announce error message
   */
  public announceError(message: string): void {
    this.announce(`Error: ${message}`, 'assertive', 0);
  }

  /**
   * Announce success message
   */
  public announceSuccess(message: string): void {
    this.announce(message, 'polite');
  }

  /**
   * Clean up live region
   */
  public destroy(): void {
    if (this.announceTimeout) {
      clearTimeout(this.announceTimeout);
    }

    if (this.liveRegion && this.liveRegion.parentNode) {
      this.liveRegion.parentNode.removeChild(this.liveRegion);
      this.liveRegion = null;
    }
  }
}

// Global announcer instance
export const announcer = new ScreenReaderAnnouncer();

/**
 * Focus management utilities
 */
export class FocusManager {
  private focusStack: HTMLElement[] = [];
  private previousFocus: HTMLElement | null = null;

  /**
   * Trap focus within an element
   */
  public trapFocus(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);

    if (focusableElements.length === 0) return () => {};

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Store current focus
    this.previousFocus = document.activeElement as HTMLElement;

    // Focus first element
    firstElement.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      this.restoreFocus();
    };
  }

  /**
   * Get all focusable elements within a container
   */
  public getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(', ');

    return Array.from(container.querySelectorAll<HTMLElement>(selector))
      .filter(el => {
        // Filter out invisible elements
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               el.offsetParent !== null;
      });
  }

  /**
   * Save current focus
   */
  public saveFocus(): void {
    this.previousFocus = document.activeElement as HTMLElement;
  }

  /**
   * Restore previous focus
   */
  public restoreFocus(): void {
    if (this.previousFocus && this.previousFocus.focus) {
      this.previousFocus.focus();
      this.previousFocus = null;
    }
  }

  /**
   * Move focus to next/previous element
   */
  public moveFocus(direction: 'next' | 'previous', container?: HTMLElement): void {
    const root = container || document.body;
    const focusable = this.getFocusableElements(root);
    const current = document.activeElement as HTMLElement;
    const currentIndex = focusable.indexOf(current);

    if (currentIndex === -1) {
      focusable[0]?.focus();
      return;
    }

    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % focusable.length;
    } else {
      nextIndex = currentIndex === 0 ? focusable.length - 1 : currentIndex - 1;
    }

    focusable[nextIndex]?.focus();
  }
}

export const focusManager = new FocusManager();

/**
 * Keyboard navigation handler
 */
export interface KeyboardNavigationOptions {
  onEnter?: (e: KeyboardEvent) => void;
  onSpace?: (e: KeyboardEvent) => void;
  onEscape?: (e: KeyboardEvent) => void;
  onArrowUp?: (e: KeyboardEvent) => void;
  onArrowDown?: (e: KeyboardEvent) => void;
  onArrowLeft?: (e: KeyboardEvent) => void;
  onArrowRight?: (e: KeyboardEvent) => void;
  onHome?: (e: KeyboardEvent) => void;
  onEnd?: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
}

export function handleKeyboardNavigation(
  e: KeyboardEvent,
  options: KeyboardNavigationOptions
): void {
  const { preventDefault = true } = options;

  const handlers: Record<string, ((e: KeyboardEvent) => void) | undefined> = {
    [KEYS.ENTER]: options.onEnter,
    [KEYS.SPACE]: options.onSpace,
    [KEYS.ESCAPE]: options.onEscape,
    [KEYS.ARROW_UP]: options.onArrowUp,
    [KEYS.ARROW_DOWN]: options.onArrowDown,
    [KEYS.ARROW_LEFT]: options.onArrowLeft,
    [KEYS.ARROW_RIGHT]: options.onArrowRight,
    [KEYS.HOME]: options.onHome,
    [KEYS.END]: options.onEnd,
  };

  const handler = handlers[e.key];
  if (handler) {
    if (preventDefault) {
      e.preventDefault();
    }
    handler(e);
  }
}

/**
 * ARIA attributes builder
 */
export interface AriaAttributes {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  hidden?: boolean;
  pressed?: boolean | 'mixed';
  current?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
  level?: number;
  valueMin?: number;
  valueMax?: number;
  valueNow?: number;
  valueText?: string;
  controls?: string;
  owns?: string;
  flowTo?: string;
  hasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  invalid?: boolean | 'grammar' | 'spelling';
  live?: AriaLive;
  atomic?: boolean;
  busy?: boolean;
  relevant?: string;
  dropEffect?: string;
  grabbed?: boolean;
  role?: string;
}

export function buildAriaAttributes(attrs: AriaAttributes): Record<string, any> {
  const result: Record<string, any> = {};

  if (attrs.label) result['aria-label'] = attrs.label;
  if (attrs.labelledBy) result['aria-labelledby'] = attrs.labelledBy;
  if (attrs.describedBy) result['aria-describedby'] = attrs.describedBy;
  if (attrs.expanded !== undefined) result['aria-expanded'] = attrs.expanded;
  if (attrs.selected !== undefined) result['aria-selected'] = attrs.selected;
  if (attrs.checked !== undefined) result['aria-checked'] = attrs.checked;
  if (attrs.disabled !== undefined) result['aria-disabled'] = attrs.disabled;
  if (attrs.hidden !== undefined) result['aria-hidden'] = attrs.hidden;
  if (attrs.pressed !== undefined) result['aria-pressed'] = attrs.pressed;
  if (attrs.current !== undefined) result['aria-current'] = attrs.current;
  if (attrs.level !== undefined) result['aria-level'] = attrs.level;
  if (attrs.valueMin !== undefined) result['aria-valuemin'] = attrs.valueMin;
  if (attrs.valueMax !== undefined) result['aria-valuemax'] = attrs.valueMax;
  if (attrs.valueNow !== undefined) result['aria-valuenow'] = attrs.valueNow;
  if (attrs.valueText) result['aria-valuetext'] = attrs.valueText;
  if (attrs.controls) result['aria-controls'] = attrs.controls;
  if (attrs.owns) result['aria-owns'] = attrs.owns;
  if (attrs.flowTo) result['aria-flowto'] = attrs.flowTo;
  if (attrs.hasPopup !== undefined) result['aria-haspopup'] = attrs.hasPopup;
  if (attrs.invalid !== undefined) result['aria-invalid'] = attrs.invalid;
  if (attrs.live) result['aria-live'] = attrs.live;
  if (attrs.atomic !== undefined) result['aria-atomic'] = attrs.atomic;
  if (attrs.busy !== undefined) result['aria-busy'] = attrs.busy;
  if (attrs.relevant) result['aria-relevant'] = attrs.relevant;
  if (attrs.dropEffect) result['aria-dropeffect'] = attrs.dropEffect;
  if (attrs.grabbed !== undefined) result['aria-grabbed'] = attrs.grabbed;
  if (attrs.role) result['role'] = attrs.role;

  return result;
}

/**
 * Color contrast checker for WCAG compliance
 */
export function checkColorContrast(
  foreground: string,
  background: string
): { ratio: number; aa: boolean; aaa: boolean } {
  // Convert hex to RGB
  const getRGB = (color: string) => {
    const hex = color.replace('#', '');
    return {
      r: parseInt(hex.substr(0, 2), 16) / 255,
      g: parseInt(hex.substr(2, 2), 16) / 255,
      b: parseInt(hex.substr(4, 2), 16) / 255,
    };
  };

  // Calculate relative luminance
  const getLuminance = (rgb: { r: number; g: number; b: number }) => {
    const { r, g, b } = rgb;
    const [rs, gs, bs] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const fgRGB = getRGB(foreground);
  const bgRGB = getRGB(background);

  const fgLuminance = getLuminance(fgRGB);
  const bgLuminance = getLuminance(bgRGB);

  // Calculate contrast ratio
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5, // Normal text
    aaa: ratio >= 7,  // Enhanced contrast
  };
}

/**
 * Skip navigation link component properties
 */
export interface SkipLinkTarget {
  id: string;
  label: string;
}

/**
 * Generate skip navigation links
 */
export function generateSkipLinks(targets: SkipLinkTarget[]): string {
  return targets
    .map(target =>
      `<a href="#${target.id}" class="skip-link">${target.label}</a>`
    )
    .join('\n');
}

/**
 * Accessible tooltip properties
 */
export interface TooltipProps {
  content: string;
  id?: string;
  role?: 'tooltip' | 'description';
}

/**
 * Create accessible tooltip attributes
 */
export function createTooltipAttributes(props: TooltipProps): Record<string, string> {
  const id = props.id || `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  return {
    'aria-describedby': id,
    'data-tooltip-id': id,
    'data-tooltip-content': props.content,
    role: props.role || 'tooltip',
  };
}

/**
 * Reduced motion preference detector
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  return mediaQuery.matches;
}

/**
 * High contrast mode detector
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;

  const mediaQuery = window.matchMedia('(prefers-contrast: high)');
  return mediaQuery.matches;
}

/**
 * Announce route changes for screen readers
 */
export function announceRouteChange(pageName: string): void {
  announcer.announce(`Navigated to ${pageName}`, 'polite');
}

/**
 * Format time for screen readers
 */
export function formatTimeForScreenReader(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (secs > 0) parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);

  return parts.join(', ');
}

/**
 * Create unique ID for accessibility
 */
let idCounter = 0;
export function generateAccessibleId(prefix: string = 'element'): string {
  idCounter++;
  return `${prefix}-${Date.now()}-${idCounter}`;
}