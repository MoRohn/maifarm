import { useState, useEffect, useRef, useCallback } from 'react';

interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  bufferSize?: number;
  overscan?: number;
}

interface VirtualScrollResult<T> {
  visibleItems: T[];
  totalHeight: number;
  offsetY: number;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollToBottom: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useVirtualScroll<T>(
  items: T[],
  options: VirtualScrollOptions
): VirtualScrollResult<T> {
  const { itemHeight, containerHeight, bufferSize = 500, overscan = 3 } = options;
  
  const [scrollTop, setScrollTop] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousItemsLength = useRef(items.length);
  
  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  // Limit items to bufferSize for memory optimization
  const limitedItems = items.slice(-bufferSize);
  const visibleItems = limitedItems.slice(startIndex, endIndex);
  
  const totalHeight = limitedItems.length * itemHeight;
  const offsetY = startIndex * itemHeight;
  
  // Auto-scroll to bottom when new items are added (if already at bottom)
  useEffect(() => {
    if (isAtBottom && items.length > previousItemsLength.current) {
      scrollToBottom();
    }
    previousItemsLength.current = items.length;
  }, [items.length]);
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const newScrollTop = target.scrollTop;
    setScrollTop(newScrollTop);
    
    // Check if at bottom (with 5px tolerance)
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 5;
    setIsAtBottom(atBottom);
  }, []);
  
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  }, []);
  
  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll,
    scrollToBottom,
    containerRef
  };
}

// Hook for optimizing terminal output rendering
export function useTerminalVirtualization(
  output: string[],
  containerHeight: number = 400,
  lineHeight: number = 20
) {
  const [processedOutput, setProcessedOutput] = useState<string[]>([]);
  const processBuffer = useRef<string[]>([]);
  const processTimeout = useRef<ReturnType<typeof setTimeout>>();
  
  // Batch process output updates to prevent excessive re-renders
  useEffect(() => {
    processBuffer.current = [...processBuffer.current, ...output.slice(processedOutput.length)];
    
    if (processTimeout.current) {
      clearTimeout(processTimeout.current);
    }
    
    processTimeout.current = setTimeout(() => {
      if (processBuffer.current.length > 0) {
        setProcessedOutput(prev => [...prev, ...processBuffer.current]);
        processBuffer.current = [];
      }
    }, 16); // Process at 60fps
    
    return () => {
      if (processTimeout.current) {
        clearTimeout(processTimeout.current);
      }
    };
  }, [output]);
  
  const virtualScroll = useVirtualScroll(processedOutput, {
    itemHeight: lineHeight,
    containerHeight,
    bufferSize: 1000, // Keep last 1000 lines in memory
    overscan: 5
  });
  
  return {
    ...virtualScroll,
    processedOutput
  };
}