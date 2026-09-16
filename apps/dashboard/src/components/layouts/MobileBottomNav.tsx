import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Wheat, Warehouse, MoreHorizontal, Zap, Clock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useGlassMorphism, glassPresets } from '@/hooks/useGlassMorphism'

interface MobileBottomNavProps {
  className?: string
}

// Apple-style Plus Button - Clean SF Symbols inspired design
const ApplePlusButton = ({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-11 h-11',
    md: 'w-14 h-14',
    lg: 'w-16 h-16'
  }

  const iconSize = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7'
  }

  return (
    <div className={clsx(
      'relative flex items-center justify-center',
      sizeClasses[size],
      className
    )}>
      {/* Subtle outer shadow ring */}
      <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md" />

      {/* Main button - Apple-style gradient */}
      <div className={clsx(
        'relative flex items-center justify-center rounded-full',
        'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600',
        'shadow-lg shadow-emerald-500/30',
        'border border-emerald-400/30',
        sizeClasses[size]
      )}>
        {/* Inner highlight - Apple gloss effect */}
        <div className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white/25 via-transparent to-transparent" />

        {/* Clean Plus Icon - SF Symbols style */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx(iconSize[size], 'relative z-10')}
        >
          <path
            d="M12 5V19M5 12H19"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

// Farm creation modes - Color scheme: Quick=Green, Farm=Navy Blue, GoWild=Burnt Orange
const farmModes = [
  {
    id: 'quick',
    name: 'Quick Task',
    description: '5-minute focused task',
    icon: Zap,
    color: 'from-leaf-400 to-leaf-700',
    bgColor: 'bg-leaf-500/10',
    borderColor: 'border-leaf-500/30',
    href: '/home?mode=quick'
  },
  {
    id: 'farm',
    name: 'Farm',
    description: '1-6 hour multi-agent session',
    icon: Wheat,
    color: 'from-navy-400 to-navy-700',
    bgColor: 'bg-navy-500/10',
    borderColor: 'border-navy-500/30',
    href: '/home?mode=farm'
  },
  {
    id: 'gowild',
    name: 'Go Wild',
    description: 'Autonomous exploration',
    icon: Sparkles,
    color: 'from-burnt-400 to-burnt-700',
    bgColor: 'bg-burnt-500/10',
    borderColor: 'border-burnt-500/30',
    href: '/home?mode=gowild'
  }
]

const navItems = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Farms', href: '/farmers', icon: Wheat },
  { name: 'create', href: '#', icon: null }, // Placeholder for center button
  { name: 'Barn', href: '/barn', icon: Warehouse },
  { name: 'More', href: '/settings', icon: MoreHorizontal }
]

export function MobileBottomNav({ className }: MobileBottomNavProps) {
  const [showModeSelector, setShowModeSelector] = useState(false)
  const navigate = useNavigate()
  const modalGlass = useGlassMorphism(glassPresets.modal)

  const handleModeSelect = (mode: typeof farmModes[0]) => {
    setShowModeSelector(false)
    navigate(mode.href)
  }

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav
        className={clsx(
          'fixed bottom-0 left-0 right-0 z-50 lg:hidden',
          'bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-xl',
          'border-t border-gray-800/50 dark:border-gray-700/50',
          'safe-area-inset-bottom',
          className
        )}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item, index) => {
            // Center button (Create Farm) - Apple-style floating action button
            if (item.name === 'create') {
              return (
                <motion.button
                  key={item.name}
                  onClick={() => setShowModeSelector(true)}
                  className="relative -mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-full"
                  aria-label="Create new farm"
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <ApplePlusButton size="md" />
                </motion.button>
              )
            }

            // Regular nav items with proper iOS touch targets
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center justify-center w-16 h-14 min-w-[44px] min-h-[44px] rounded-xl transition-all duration-200 touch-manipulation active:scale-[0.95] active:bg-gray-800/50',
                    isActive
                      ? 'text-emerald-400'
                      : 'text-gray-400 hover:text-gray-200'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.icon && (
                      <item.icon
                        className={clsx(
                          'w-6 h-6 transition-all duration-200',
                          isActive && 'scale-110'
                        )}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                    )}
                    <span
                      className={clsx(
                        'text-xs mt-1 font-medium transition-all duration-200',
                        isActive ? 'opacity-100' : 'opacity-70'
                      )}
                    >
                      {item.name}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavIndicator"
                        className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400"
                      />
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>

        {/* Home indicator safe area */}
        <div className="h-safe-area-inset-bottom bg-gray-900/95 dark:bg-gray-950/95" />
      </nav>

      {/* Mode Selector Modal */}
      <AnimatePresence>
        {showModeSelector && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-gray-900/80 backdrop-blur-sm lg:hidden"
              onClick={() => setShowModeSelector(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-20 left-4 right-4 z-[110] lg:hidden"
            >
              <div
                className="rounded-2xl overflow-hidden border border-gray-700/50"
                style={modalGlass.glassStyles}
              >
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    Create New Farm
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Choose how you want to work
                  </p>

                  <div className="space-y-3">
                    {farmModes.map((mode) => (
                      <motion.button
                        key={mode.id}
                        onClick={() => handleModeSelect(mode)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={clsx(
                          'w-full p-4 rounded-xl text-left transition-all duration-200',
                          'border',
                          mode.bgColor,
                          mode.borderColor,
                          'hover:border-opacity-60'
                        )}
                      >
                        <div className="flex items-center space-x-4">
                          <div
                            className={clsx(
                              'w-12 h-12 rounded-xl flex items-center justify-center',
                              'bg-gradient-to-br',
                              mode.color
                            )}
                          >
                            <mode.icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-white">
                              {mode.name}
                            </h4>
                            <p className="text-sm text-gray-400">
                              {mode.description}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Cancel button */}
                <div className="border-t border-gray-700/50 p-4">
                  <button
                    onClick={() => setShowModeSelector(false)}
                    className="w-full py-3 rounded-xl bg-gray-800/50 text-gray-300 font-medium hover:bg-gray-700/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
