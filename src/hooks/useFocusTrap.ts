import { useEffect, useRef } from 'react'

interface UseFocusTrapOptions {
  isActive: boolean
  initialFocus?: string // CSS selector for initial focus element
  restoreFocus?: boolean // Whether to restore focus on unmount
}

export function useFocusTrap(options: UseFocusTrapOptions) {
  const { isActive, initialFocus, restoreFocus = true } = options
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement

    // Get all focusable elements within the container
    const getFocusableElements = () => {
      if (!containerRef.current) return []
      
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ]
      
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors.join(', '))
      ).filter(el => {
        // Filter out invisible elements
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
    }

    // Set initial focus
    const setInitialFocus = () => {
      if (initialFocus && containerRef.current) {
        const targetElement = containerRef.current.querySelector<HTMLElement>(initialFocus)
        if (targetElement) {
          targetElement.focus()
          return
        }
      }

      // Fallback to first focusable element
      const focusableElements = getFocusableElements()
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }

    // Set initial focus after a small delay to ensure DOM is ready
    const timer = setTimeout(setInitialFocus, 50)

    // Handle Tab key for focus trapping
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (e.shiftKey) {
        // Shift + Tab (backwards)
        if (activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab (forwards)
        if (activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && containerRef.current) {
        // Find and click the close button if it exists
        const closeButton = containerRef.current.querySelector<HTMLButtonElement>(
          '[aria-label*="close" i], [aria-label*="cancel" i], button[class*="close"]'
        )
        if (closeButton) {
          closeButton.click()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleEscape)

      // Restore focus to the previously focused element
      if (restoreFocus && previousActiveElement.current && document.body.contains(previousActiveElement.current)) {
        previousActiveElement.current.focus()
      }
    }
  }, [isActive, initialFocus, restoreFocus])

  return containerRef
}