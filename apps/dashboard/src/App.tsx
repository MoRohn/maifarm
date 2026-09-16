import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Toaster, toast } from 'react-hot-toast'
import { Suspense, lazy, useEffect, useState, useLayoutEffect, useCallback, ReactNode } from 'react'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { Dashboard } from './components/Dashboard/Dashboard'
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx'
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary.tsx'
import { useThemeStore } from './store/themeStore'
import { useHardwareStore } from './store/hardwareStore'
import { ThemeProvider } from './components/common/ThemeProvider'
import BackgroundIndicator from './components/common/BackgroundIndicator'
import { ApiErrorDisplay } from './components/common/ApiErrorDisplay'
import { setupHMRHandler } from './utils/hmrHandler'
import { wsManager } from './services/websocket/singletonManager'
import { getWebSocketUrl } from './config/websocket'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useFirstRunCheck } from './hooks/useFirstRunCheck'
import { WelcomeModal } from './components/Onboarding/WelcomeModal'
import SafeErrorPage from './components/ErrorPage/SafeErrorPage'

const FarmersPage = lazy(() => import('./components/Farmers/FarmersPage').then(m => ({ default: m.FarmersPage })))
const BarnPage = lazy(() => import('./components/Barn/BarnPage').then(m => ({ default: m.BarnPage })))
const CreateFarmFromSeed = lazy(() => import('./components/Farm/CreateFarmFromSeed').then(m => ({ default: m.CreateFarmFromSeed })))
const CreateFarmFromFarmer = lazy(() => import('./components/Farm/CreateFarmFromFarmer').then(m => ({ default: m.CreateFarmFromFarmer })))
const ConceptExplainer = lazy(() => import('./components/Farm/ConceptExplainer').then(m => ({ default: m.ConceptExplainer })))
const FarmDetailsPage = lazy(() => import('./components/Farm/FarmDetailsPage').then(m => ({ default: m.FarmDetailsPage })))
const HarvestPage = lazy(() => import('./components/Harvest/HarvestPage').then(m => ({ default: m.HarvestPage })))
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'))
const AnalyticsSafe = lazy(() => import('./components/Analytics/AnalyticsSafe'))
const SystemHealthPage = lazy(() => import('./components/Monitoring/SystemHealthPage').then(m => ({ default: m.SystemHealthPage })))
const MultiClaudeManager = lazy(() => import('./components/MultiClaude/MultiClaudeManager').then(m => ({ default: m.MultiClaudeManager })))
const Calculator = lazy(() => import('./components/Calculator/Calculator').then(m => ({ default: m.Calculator })))
const TerminalShowcase = lazy(() => import('./pages/TerminalShowcase'))
const CommandPalette = lazy(() => import('./components/common/CommandPalette').then(m => ({ default: m.CommandPalette })))
const WelcomeExperience = lazy(() => import('./components/Onboarding/SimplifiedWelcomeExperience'))
// Using SimpleLogin for Safari compatibility - no framer-motion animations
const LoginPage = lazy(() => import('./components/Auth/SimpleLogin'))
const TestPage = lazy(() => import('./components/Onboarding/TestPage'))
const EmailVerification = lazy(() => import('./components/Auth/EmailVerification').then(m => ({ default: m.EmailVerification })))
const ResendVerification = lazy(() => import('./components/Auth/ResendVerification').then(m => ({ default: m.ResendVerification })))
const ForgotPassword = lazy(() => import('./components/Auth/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./components/Auth/ResetPassword').then(m => ({ default: m.ResetPassword })))

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
  </div>
)

// FIX: Wrapper component that combines lazy loading with error boundary for each route
// This ensures that if a lazy-loaded component fails, it doesn't crash the entire app
const LazyRoute = ({ children, name }: { children: React.ReactNode; name: string }) => (
  <ErrorBoundary
    fallback={
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Failed to load {name}</h2>
        <p className="text-gray-500 mb-4">Something went wrong while loading this page.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          Reload Page
        </button>
      </div>
    }
    onError={(error) => {
      console.error(`[LazyRoute] Failed to load ${name}:`, error);
    }}
  >
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  </ErrorBoundary>
)

// Setup HMR handler to prevent WebSocket suspension errors
if (import.meta.env.DEV) {
  setupHMRHandler();
}

const WebSocketInitializer = () => {
  useEffect(() => {
    const url = getWebSocketUrl();
    wsManager.initialize(url);

    return () => {
      wsManager.release();
    };
  }, []);

  return null;
};

const AppRoutes = () => {
  const firstRunState = useFirstRunCheck();
  const { isAuthenticated, isLoading, isBootstrapping } = useAuth();

  useEffect(() => {
    // iOS PRIVATE BROWSING FIX: Wrap all sessionStorage/localStorage access in try-catch
    // iOS Safari private mode throws DOMException on storage access
    try {
      const navCount = sessionStorage.getItem('maifarm-nav-count');
      const count = navCount ? parseInt(navCount, 10) : 0;

      if (count > 20) {
        console.warn('[ANTI-LOOP] Excessive navigation detected, clearing stuck state');
        const keysToRemove = Object.keys(localStorage).filter(key =>
          key.includes('maifarm-show-welcome') ||
          key.includes('maifarm:welcome') ||
          key === 'maifarm-redirected'
        );
        keysToRemove.forEach(key => localStorage.removeItem(key));
        sessionStorage.setItem('maifarm-nav-count', '0');
      } else {
        sessionStorage.setItem('maifarm-nav-count', (count + 1).toString());
      }
    } catch {
      // Silently ignore - iOS private browsing mode doesn't persist storage
    }

    const timeout = setTimeout(() => {
      try {
        sessionStorage.setItem('maifarm-nav-count', '0');
      } catch {
        // Silently ignore - iOS private browsing mode
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  if (firstRunState.isChecking || isLoading || isBootstrapping) {
    return <PageLoader />;
  }

  if (firstRunState.needsOnboarding) {
    return (
      <Routes>
        <Route path="/welcome" element={<LazyRoute name="Welcome"><WelcomeExperience /></LazyRoute>} />
        <Route path="/initialization" element={<LazyRoute name="Initialization"><WelcomeExperience /></LazyRoute>} />
        <Route path="/setup" element={<LazyRoute name="Setup"><WelcomeExperience /></LazyRoute>} />
        <Route path="/login" element={<LazyRoute name="Login"><LoginPage /></LazyRoute>} />
        <Route path="/forgot-password" element={<LazyRoute name="Forgot Password"><ForgotPassword /></LazyRoute>} />
        <Route path="/reset-password/:token" element={<LazyRoute name="Reset Password"><ResetPassword /></LazyRoute>} />
        <Route path="/verify-email/:token" element={<LazyRoute name="Email Verification"><EmailVerification /></LazyRoute>} />
        <Route path="/resend-verification" element={<LazyRoute name="Resend Verification"><ResendVerification /></LazyRoute>} />
        <Route path="/error" element={<SafeErrorPage />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LazyRoute name="Login"><LoginPage /></LazyRoute>} />
        <Route path="/forgot-password" element={<LazyRoute name="Forgot Password"><ForgotPassword /></LazyRoute>} />
        <Route path="/reset-password/:token" element={<LazyRoute name="Reset Password"><ResetPassword /></LazyRoute>} />
        <Route path="/verify-email/:token" element={<LazyRoute name="Email Verification"><EmailVerification /></LazyRoute>} />
        <Route path="/resend-verification" element={<LazyRoute name="Resend Verification"><ResendVerification /></LazyRoute>} />
        <Route path="/welcome" element={<LazyRoute name="Welcome"><WelcomeExperience /></LazyRoute>} />
        <Route path="/initialization" element={<LazyRoute name="Initialization"><WelcomeExperience /></LazyRoute>} />
        <Route path="/setup" element={<LazyRoute name="Setup"><WelcomeExperience /></LazyRoute>} />
        <Route path="/error" element={<SafeErrorPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Allow login route for authenticated users to prevent routing conflicts during registration */}
      <Route path="/login" element={<Navigate to="/home" replace />} />
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<Dashboard />} />
        <Route path="farmers" element={<LazyRoute name="Farmers"><FarmersPage /></LazyRoute>} />
        <Route path="barn" element={<LazyRoute name="Barn"><BarnPage /></LazyRoute>} />
        <Route path="farms/new" element={<LazyRoute name="Create Farm"><CreateFarmFromSeed /></LazyRoute>} />
        <Route path="farms/create-from-farmer" element={<LazyRoute name="Create from Farmer"><CreateFarmFromFarmer /></LazyRoute>} />
        <Route path="farms/:farmId" element={<LazyRoute name="Farm Details"><FarmDetailsPage /></LazyRoute>} />
        <Route path="farm/:farmId/transition/:mode" element={<LazyRoute name="Concept Explainer"><ConceptExplainer /></LazyRoute>} />
        <Route path="harvest/:farmId" element={<LazyRoute name="Harvest"><HarvestPage /></LazyRoute>} />
        <Route path="multiclaude" element={<LazyRoute name="Multi-Claude"><MultiClaudeManager /></LazyRoute>} />
        <Route path="analytics" element={<LazyRoute name="Analytics"><AnalyticsSafe /></LazyRoute>} />
        <Route path="settings" element={<LazyRoute name="Settings"><SettingsPage /></LazyRoute>} />
        <Route path="calculator" element={<LazyRoute name="Calculator"><Calculator /></LazyRoute>} />
        <Route path="terminal-showcase" element={<LazyRoute name="Terminal Showcase"><TerminalShowcase /></LazyRoute>} />
        <Route path="system-health" element={<LazyRoute name="System Health"><SystemHealthPage /></LazyRoute>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
      <Route path="/welcome" element={<LazyRoute name="Welcome"><WelcomeExperience /></LazyRoute>} />
      <Route path="/initialization" element={<LazyRoute name="Initialization"><WelcomeExperience /></LazyRoute>} />
      <Route path="/setup" element={<LazyRoute name="Setup"><WelcomeExperience /></LazyRoute>} />
      <Route path="/verify-email/:token" element={<LazyRoute name="Email Verification"><EmailVerification /></LazyRoute>} />
      <Route path="/resend-verification" element={<LazyRoute name="Resend Verification"><ResendVerification /></LazyRoute>} />
      <Route path="/forgot-password" element={<LazyRoute name="Forgot Password"><ForgotPassword /></LazyRoute>} />
      <Route path="/reset-password/:token" element={<LazyRoute name="Reset Password"><ResetPassword /></LazyRoute>} />
      <Route path="/error" element={<SafeErrorPage />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
};

function AppContent() {
  const theme = useThemeStore((state) => state.theme)
  const setReduceMotion = useThemeStore((state) => state.setReduceMotion)
  const { checkInstallationStatus } = useHardwareStore()
  const navigate = useNavigate()
  const [showWelcomePrompt, setShowWelcomePrompt] = useState(false)
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const firstRunState = useFirstRunCheck({ disableNavigation: true })

  // Theme is managed by index.tsx initializeTheme() and ThemeProvider
  // System theme changes are handled by ThemeProvider
  // This effect is removed to prevent conflicts

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotionPreference = () => {
      setReduceMotion(mediaQuery.matches)
    }

    handleMotionPreference()
    mediaQuery.addEventListener('change', handleMotionPreference)

    return () => mediaQuery.removeEventListener('change', handleMotionPreference)
  }, [setReduceMotion])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    checkInstallationStatus()
  }, [checkInstallationStatus, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setShowWelcomePrompt(false)
      return
    }

    if (firstRunState.isChecking) {
      return
    }

    if (firstRunState.shouldShowWelcome && location.pathname !== '/welcome') {
      setShowWelcomePrompt(true)
    } else if (!firstRunState.shouldShowWelcome) {
      setShowWelcomePrompt(false)
    }
  }, [firstRunState.isChecking, firstRunState.shouldShowWelcome, location.pathname, isAuthenticated])

  useEffect(() => {
    const activeToastIds: string[] = []

    if (typeof toast.onChange !== 'function') {
      return
    }

    return toast.onChange((toastEvent) => {
      if (toastEvent.type === 'show') {
        activeToastIds.push(toastEvent.id)
        if (activeToastIds.length > 3) {
          const [oldestToastId] = activeToastIds
          toast.dismiss(oldestToastId)
          activeToastIds.shift()
        }
      }

      if (toastEvent.type === 'dismiss' || toastEvent.type === 'remove') {
        const idx = activeToastIds.indexOf(toastEvent.id)
        if (idx !== -1) {
          activeToastIds.splice(idx, 1)
        }
      }
    })
  }, [])


  return (
    <>
      {isAuthenticated && <WebSocketInitializer />}
      <Suspense fallback={<PageLoader />}>
        <AppRoutes />
      </Suspense>

      <Toaster
        position="top-right"
        toastOptions={{
          className: 'glass',
          duration: 4000,
          style: {
            background: 'var(--background)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />

      <ApiErrorDisplay />
      <BackgroundIndicator />

      {isAuthenticated && (
        <WelcomeModal
          open={showWelcomePrompt}
          onDismiss={(reason) => {
            setShowWelcomePrompt(false)
            // iOS PRIVATE BROWSING FIX: Wrap localStorage access in try-catch
            // iOS Safari private mode throws DOMException on storage access
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('maifarm:welcome-page:v2', 'viewed')
              } catch {
                // Silently ignore - iOS private browsing mode doesn't persist storage
              }
            }
            if (reason === 'complete') {
              navigate('/welcome')
            }
          }}
          userName={user?.name}
          onAction={(action) => {
            setShowWelcomePrompt(false)
            if (action === 'new-farm') {
              navigate('/farms/new')
            } else if (action === 'analytics') {
              navigate('/analytics')
            } else if (action === 'quick-task') {
              navigate('/home')
            }
          }}
        />
      )}

      {isAuthenticated && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </>
  )
}

const AuthProviderWithNavigation = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate()

  const handleNavigate = useCallback((path: string) => {
    if (!path) {
      return
    }
    navigate(path)
  }, [navigate])

  return <AuthProvider onNavigate={handleNavigate}>{children}</AuthProvider>
}

function App() {
  console.log('[APP.TSX] Rendering App component');
  return (
    <GlobalErrorBoundary
      onError={(error, errorInfo) => {
        // Log to backend error tracking
        console.error('App Error:', error, errorInfo);
      }}
    >
      <ErrorBoundary>
        {/* MotionConfig is now in index.tsx at the root level to fix Safari-specific useContext issues */}
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
          <AuthProviderWithNavigation>
            <ThemeProvider>
              <AppContent />
            </ThemeProvider>
          </AuthProviderWithNavigation>
        </BrowserRouter>
      </ErrorBoundary>
    </GlobalErrorBoundary>
  )
}

export default App
