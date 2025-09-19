import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';
import { Header } from './Header';
import { useResponsive } from '@/hooks/useResponsive';
import { useFocusTrap } from '@/hooks/useAccessibility';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ 
  children, 
  sidebar,
  className 
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isMobile, isTablet } = useResponsive();
  const sidebarRef = useFocusTrap<HTMLDivElement>(isSidebarOpen && isMobile);

  const showSidebar = !isMobile || isSidebarOpen;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)}
        isMenuOpen={isSidebarOpen}
      />
      
      <div className="flex h-full pt-[73px]">
        {/* Sidebar */}
        <AnimatePresence>
          {showSidebar && sidebar && (
            <>
              {/* Mobile overlay */}
              {isMobile && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}
              
              {/* Sidebar content */}
              <motion.aside
                ref={sidebarRef}
                initial={isMobile ? { x: -280 } : false}
                animate={{ x: 0 }}
                exit={isMobile ? { x: -280 } : undefined}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={cn(
                  'fixed lg:sticky top-[73px] left-0 z-40',
                  'w-[280px] h-[calc(100vh-73px)]',
                  'bg-white dark:bg-gray-800',
                  'border-r border-gray-200 dark:border-gray-700',
                  'overflow-y-auto',
                  {
                    'shadow-xl lg:shadow-none': isMobile,
                  }
                )}
              >
                {sidebar}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        
        {/* Main content */}
        <main 
          className={cn(
            'flex-1 overflow-y-auto',
            'px-4 sm:px-6 lg:px-8 py-6',
            'transition-all duration-300',
            {
              'lg:ml-0': !sidebar || (isMobile && !isSidebarOpen),
            },
            className
          )}
        >
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};