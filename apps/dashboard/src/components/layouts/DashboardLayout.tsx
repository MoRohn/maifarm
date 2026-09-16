import { Outlet, NavLink } from 'react-router-dom'
import {
  Home,
  FileCode,
  BarChart3,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
  Monitor,
  Warehouse,
  ChevronDown,
  ChevronRight,
  Wheat,
  Circle,
  Trash2,
  Brain,
  Stars,
  Rocket,
  Users,
  Cpu
} from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { MinimalProfileWidget } from '../common/MinimalProfileWidget'
import { MobileBottomNav } from './MobileBottomNav'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/themeStore'
import { useWebSocketStore } from '@/store/websocketStore'
import { useFarmStore } from '@/store/farmStore'
import { useHardwareStore } from '@/store/hardwareStore'
import { logFarmDeletion } from '@/store/activityStore'
import { Breadcrumb } from '../common/Breadcrumb'
import { useGlassMorphism, glassPresets } from '@/hooks/useGlassMorphism'
import clsx from 'clsx'
import { toast } from 'react-hot-toast'

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Farmers', href: '/farmers', icon: Users },
  { name: 'Barn', href: '/barn', icon: Warehouse },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
]

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [farmsExpanded, setFarmsExpanded] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [farmToDelete, setFarmToDelete] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { theme, colorScheme, setTheme } = useThemeStore()
  const connected = useWebSocketStore((state) => state.connected)
  const { farms, fetchFarms, removeFarm } = useFarmStore()
  const { isInstalled, installedModel, checkInstallationStatus } = useHardwareStore()
  const [isDarkMode, setIsDarkMode] = useState(false)
  
  // Glass morphism hooks for different sections
  const sidebarGlass = useGlassMorphism(glassPresets.sidebar)
  const headerGlass = useGlassMorphism(glassPresets.navigation)
  const modalGlass = useGlassMorphism(glassPresets.modal)
  
// Use the same logic as DynamicLogo for consistent logo selection
  const logoSrc = useMemo(() => {
    const colorId = colorScheme.id;
    const themeMode = isDarkMode ? 'dark' : 'light';
    
    // Check if custom logo exists for this color scheme
    if (colorId === 'forest-walk' || colorId === 'custom') {
      // Use default logos
      return `/maifarm-logo-${themeMode}-bkgd.svg`;
    } else {
      // Use color-specific logos (to be created manually)
      return `/maifarm-logo-${colorId}-${themeMode}.svg`;
    }
  }, [colorScheme, isDarkMode]);

  useEffect(() => {
    const checkDarkMode = () => {
      if (theme === 'dark') {
        setIsDarkMode(true)
      } else if (theme === 'light') {
        setIsDarkMode(false)
      } else {
        // System theme
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }
    
    checkDarkMode()
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => checkDarkMode()
    mediaQuery.addEventListener('change', handleChange)
    
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Fetch farms on mount
  useEffect(() => {
    fetchFarms()
  }, [fetchFarms])

  // Check GPT-OSS installation status on mount
  useEffect(() => {
    checkInstallationStatus()
  }, [checkInstallationStatus])

  const themeIcon = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'launching':
        return 'bg-yellow-500'
      case 'paused':
        return 'bg-orange-500'
      case 'completed':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, farm: { id: string; name: string }) => {
    e.preventDefault()
    e.stopPropagation()
    setFarmToDelete(farm)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!farmToDelete) return
    
    setIsDeleting(true)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567'
    
    try {
      // First, try to stop the farm gracefully if it's running to collect yields
      try {
        const stopResponse = await fetch(`${apiUrl}/api/farms/${farmToDelete.id}/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            graceful: true // Use graceful shutdown before deletion to collect yields
          })
        }).catch(err => {
          console.warn('Stop request failed (farm may already be stopped):', err)
          return { ok: false }
        })
        
        // Wait a moment for graceful shutdown only if stop was successful
        if (stopResponse.ok) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      } catch (stopError) {
        // Continue with deletion even if stop fails
        console.warn('Could not stop farm before deletion:', stopError)
      }
      
      // Delete the farm with better error handling
      let deleteResponse: Response | null = null
      try {
        deleteResponse = await fetch(`${apiUrl}/api/farms/${farmToDelete.id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      } catch (fetchError) {
        // Network error - handle gracefully
        console.error('Network error while deleting farm:', fetchError)
        
        // Still remove from local store if network error
        // (the backend may have deleted it but response failed)
        removeFarm(farmToDelete.id)
        toast(`⚠️ Farm "${farmToDelete.name}" removed locally. Please refresh if issues persist.`)
        return
      }
      
      if (deleteResponse && deleteResponse.ok) {
        // Log the deletion activity
        logFarmDeletion(farmToDelete.name, farmToDelete.id)
        
        // Remove from local store
        removeFarm(farmToDelete.id)
        
        // Show success message
        toast.success(`Farm "${farmToDelete.name}" deleted successfully`)
        console.log(`Farm "${farmToDelete.name}" deleted successfully`)
      } else if (deleteResponse) {
        // Server returned an error response
        const errorData = await deleteResponse.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Failed to delete farm'
        
        // Check if it's a 404 - farm already deleted
        if (deleteResponse.status === 404) {
          removeFarm(farmToDelete.id)
          toast(`ℹ️ Farm "${farmToDelete.name}" was already deleted`)
        } else {
          toast.error(errorMessage)
          console.error('Failed to delete farm:', errorMessage)
        }
      }
    } catch (error) {
      // Catch-all for any unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete farm'
      
      // Don't show "Load failed" errors - these are network issues
      if (errorMessage.includes('Load failed') || errorMessage.includes('Failed to fetch')) {
        toast.error('Network error. Please check your connection and try again.')
        console.error('Network error during farm deletion:', error)
      } else {
        toast.error(errorMessage)
        console.error('Error deleting farm:', error)
      }
    } finally {
      setIsDeleting(false)
      setDeleteModalOpen(false)
      setFarmToDelete(null)
    }
  }

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 safe-area-all">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-gray-900/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 z-50 h-full w-72 lg:hidden"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }}
          >
            <div className="flex h-full flex-col glass-panel" style={sidebarGlass.glassStyles}>
              {/* Mobile sidebar header - just close button, no logo banner */}
              <div className="flex h-14 items-center justify-end px-4">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-lg p-2 hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700 touch-manipulation active:scale-[0.95] min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close sidebar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
                {navigation.map((item) => (
                  <div key={item.name}>
                    <NavLink
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 touch-manipulation active:scale-[0.98]',
                          isActive
                            ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-900 dark:text-primary-100 shadow-lg shadow-primary-500/10 border-l-2 border-primary-500'
                            : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700'
                        )
                      }
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </NavLink>
                    
                    {/* Show Farms section after Analytics */}
                    {item.name === 'Analytics' && (
                      <div className="mt-1">
                        <button
                          onClick={() => setFarmsExpanded(!farmsExpanded)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700 rounded-lg transition-all duration-200 touch-manipulation active:scale-[0.98]"
                          aria-label="Toggle farms list"
                          aria-expanded={farmsExpanded}
                        >
                          <div className="flex items-center space-x-3">
                            <Wheat className="h-5 w-5" />
                            <span>Farms</span>
                          </div>
                          {farmsExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        
                        <AnimatePresence>
                          {farmsExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="ml-4 mt-1 space-y-1">
                                {farms.length > 0 ? (
                                  farms.map((farm) => (
                                    <div key={farm.id} className="group relative">
                                      <NavLink
                                        to={`/harvest/${farm.id}`}
                                        onClick={() => setSidebarOpen(false)}
                                        className={({ isActive }) =>
                                          clsx(
                                            'flex items-center space-x-2 rounded-lg px-3 py-2 pr-10 text-xs transition-all duration-200 touch-manipulation active:scale-[0.98]',
                                            isActive
                                              ? 'bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 border-l-2 border-primary-400'
                                              : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700'
                                          )
                                        }
                                      >
                                        <Circle className={clsx('h-2 w-2', getStatusColor(farm.status))} />
                                        <span className="truncate">{farm.name}</span>
                                      </NavLink>
                                      <button
                                        onClick={(e) => handleDeleteClick(e, farm)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-200 touch-manipulation opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                        title={`Delete ${farm.name}`}
                                        aria-label={`Delete farm ${farm.name}`}
                                      >
                                        <Trash2 className="h-3 w-3 text-red-500 dark:text-red-400" />
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                                    No farms available
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                ))}
              </nav>
              <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
                {/* Profile Widget */}
                <div className="group">
                  <MinimalProfileWidget expanded={true} className="w-full" />
                </div>

                {/* Settings Link */}
                <NavLink
                  to="/settings"
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 touch-manipulation active:scale-[0.98]',
                      isActive
                        ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-900 dark:text-primary-100 shadow-lg shadow-primary-500/10 border-l-2 border-primary-500'
                        : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700'
                    )
                  }
                >
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </NavLink>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-full w-64 lg:block">
        <div className="flex h-full flex-col glass-panel" style={sidebarGlass.glassStyles}>
          <div className="flex h-24 items-center justify-center px-6 py-4">
            <img 
              src={
                colorScheme.id === 'forest-walk' || colorScheme.id === 'custom'
                  ? `/maifarm-logo-${isDarkMode ? 'dark' : 'light'}-bkgd.svg`
                  : `/maifarm-logo-${colorScheme.id}-${isDarkMode ? 'dark' : 'light'}.svg`
              } 
              alt="MaiFarm" 
              className="h-38 w-38" 
            />
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            {navigation.map((item) => (
              <div key={item.name}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 touch-manipulation active:scale-[0.98]',
                      isActive
                        ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-900 dark:text-primary-100 shadow-lg shadow-primary-500/10 border-l-2 border-primary-500'
                        : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:active:bg-gray-700'
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </NavLink>

                {/* Show Farms section after Analytics */}
                {item.name === 'Analytics' && (
                  <div className="mt-1">
                    <button
                      onClick={() => setFarmsExpanded(!farmsExpanded)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:active:bg-gray-700 rounded-lg transition-all duration-200 touch-manipulation active:scale-[0.98]"
                    >
                      <div className="flex items-center space-x-3">
                        <Wheat className="h-5 w-5" />
                        <span>Farms</span>
                      </div>
                      {farmsExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    
                    <AnimatePresence>
                      {farmsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-4 mt-1 space-y-1">
                            {farms.length > 0 ? (
                              farms.map((farm) => (
                                <div key={farm.id} className="group relative">
                                  <NavLink
                                    to={`/harvest/${farm.id}`}
                                    className={({ isActive }) =>
                                      clsx(
                                        'flex items-center space-x-2 rounded-lg px-3 py-2 pr-10 text-xs transition-all duration-200 touch-manipulation active:scale-[0.98]',
                                        isActive
                                          ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                          : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:active:bg-gray-700'
                                      )
                                    }
                                  >
                                    <Circle className={clsx('h-2 w-2', getStatusColor(farm.status))} />
                                    <span className="truncate">{farm.name}</span>
                                  </NavLink>
                                  <button
                                    onClick={(e) => handleDeleteClick(e, farm)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-200"
                                    title={`Delete ${farm.name}`}
                                  >
                                    <Trash2 className="h-3 w-3 text-red-500 dark:text-red-400" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                                No farms available
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
            {/* Profile Widget */}
            <div className="group">
              <MinimalProfileWidget expanded={true} className="w-full" />
            </div>

            {/* Settings Link */}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                clsx(
                  'flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 touch-manipulation active:scale-[0.98]',
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100 shadow-lg shadow-primary-500/10'
                    : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800/50 dark:active:bg-gray-700'
                )
              }
            >
              <Settings className="h-5 w-5" />
              <span>Settings</span>
            </NavLink>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky z-10 flex items-center glass-heavy border-b border-gray-200 dark:border-gray-700" style={{ ...headerGlass.glassStyles, top: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(4rem + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex flex-1 items-center justify-between px-4 sm:px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700 lg:hidden touch-manipulation active:scale-[0.95] min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800" title={connected ? 'Connected to server' : 'Disconnected from server'} role="status" aria-live="polite">
                <div className="relative">
                  <div className={clsx(
                    'h-3 w-3 rounded-full transition-all duration-300',
                    connected ? 'bg-green-500 shadow-green-500/50 shadow-sm' : 'bg-red-500 shadow-red-500/50 shadow-sm'
                  )} />
                  {connected && (
                    <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                  )}
                </div>
                <span className={clsx(
                  'text-xs font-medium transition-colors',
                  connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {connected ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* GPT-OSS Model Badge */}
              {isInstalled && installedModel && (
                <NavLink
                  to="/settings"
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 hover:border-emerald-500/40 active:border-emerald-500/60 active:scale-[0.98] transition-all duration-200 group touch-manipulation"
                  title={`GPT-OSS: ${installedModel.recommendation.modelSize} model installed`}
                >
                  <Cpu className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    GPT-OSS: {installedModel.recommendation.modelSize}
                  </span>
                </NavLink>
              )}

              {/* Theme switcher */}
              <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 touch-manipulation active:scale-[0.95]',
                      theme === t
                        ? 'bg-gray-50 dark:bg-gray-700 shadow-sm'
                        : 'hover:bg-gray-200 active:bg-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600'
                    )}
                    aria-label={`Switch to ${t} theme`}
                    aria-pressed={theme === t}
                  >
                    {themeIcon[t]}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </header>

        {/* Breadcrumb Navigation */}
        <Breadcrumb />

        {/* Page content - FIX: Use dynamic viewport height for mobile */}
        <main className="min-h-[calc(100vh-4rem)] min-h-screen-dynamic p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalOpen && farmToDelete && (
          <>
            {/* Backdrop - FIX: Account for safe areas on notched devices */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-gray-900/80 backdrop-blur-sm modal-safe-area"
              onClick={() => !isDeleting && setDeleteModalOpen(false)}
            />

            {/* Modal - FIX: Account for safe area top inset on notched devices */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-[210] w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4"
              style={{
                marginTop: 'env(safe-area-inset-top, 0px)'
              }}
            >
              <div className="rounded-2xl glass-modal" style={modalGlass.glassStyles}>
                <div className="p-6">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20">
                    <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  
                  <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Delete Farm
                  </h3>
                  
                  <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Are you sure you want to delete <span className="font-semibold">"{farmToDelete.name}"</span>? 
                    This will stop all running agents and cannot be undone.
                  </p>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setDeleteModalOpen(false)}
                      disabled={isDeleting}
                      className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteConfirm}
                      disabled={isDeleting}
                      className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isDeleting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                          Deleting...
                        </>
                      ) : (
                        'Delete Farm'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}