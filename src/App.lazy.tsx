import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState, lazy, Suspense } from 'react'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { Dashboard } from './components/Dashboard/Dashboard'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary'
import { useThemeStore } from './store/themeStore'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './components/common/ThemeProvider'
import BackgroundIndicator from './components/common/BackgroundIndicator'
import { ApiErrorDisplay } from './components/common/ApiErrorDisplay'
import { setupHMRHandler } from './utils/hmrHandler'
import { wsManager } from './services/websocket/singletonManager'

// Lazy load heavy components
const FarmersPage = lazy(() => import('./components/Farmers/FarmersPage').then(m => ({ default: m.FarmersPage })))
const BarnPage = lazy(() => import('./components/Barn/BarnPage').then(m => ({ default: m.BarnPage })))
const CreateFarmFromSeed = lazy(() => import('./components/Farm/CreateFarmFromSeed').then(m => ({ default: m.CreateFarmFromSeed })))
const CreateFarmFromFarmer = lazy(() => import('./components/Farm/CreateFarmFromFarmer').then(m => ({ default: m.CreateFarmFromFarmer })))
const ConceptExplainer = lazy(() => import('./components/Farm/ConceptExplainer').then(m => ({ default: m.ConceptExplainer })))
const HarvestPage = lazy(() => import('./components/Harvest/HarvestPage').then(m => ({ default: m.HarvestPage })))
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'))
const Analytics = lazy(() => import('./components/Analytics/Analytics'))
const MultiClaudeManager = lazy(() => import('./components/MultiClaude/MultiClaudeManager').then(m => ({ default: m.MultiClaudeManager })))
const SafeErrorPage = lazy(() => import('./components/ErrorPage/SafeErrorPage'))
const Calculator = lazy(() => import('./components/Calculator/Calculator').then(m => ({ default: m.Calculator })))
const CommandPalette = lazy(() => import('./components/common/CommandPalette').then(m => ({ default: m.CommandPalette })))

// Setup HMR handler to prevent WebSocket suspension errors
if (import.meta.env.DEV) {
  setupHMRHandler();
}

// Initialize WebSocket connection on app startup using singleton manager
wsManager.initialize('http://localhost:4567');

// Loading component for Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
)

function AppContent() {
  const theme = useThemeStore((state) => state.theme)
  const applyTheme = useThemeStore((state) => state.applyTheme)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Prevent multiple theme applications during initial render
    if (!isInitialized) {
      setIsInitialized(true);
      return;
    }

    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme, isInitialized])

  useEffect(() => {
    // Apply theme on mount
    applyTheme(theme)
  }, [applyTheme, theme])

  // Listen for Ctrl/Cmd + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const event = new CustomEvent('toggleCommandPalette')
        window.dispatchEvent(event)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: theme === 'dark' ? '#1f2937' : '#ffffff',
            color: theme === 'dark' ? '#f3f4f6' : '#1f2937',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: theme === 'dark' ? '#1f2937' : '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: theme === 'dark' ? '#1f2937' : '#ffffff',
            },
          },
        }}
      />

      <ApiErrorDisplay />
      <BackgroundIndicator />

      <Suspense fallback={<PageLoader />}>
        <CommandPalette />
      </Suspense>

      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="farmers" element={<FarmersPage />} />
            <Route path="barn" element={<BarnPage />} />
            <Route path="seed" element={<CreateFarmFromSeed />} />
            <Route path="farmer" element={<CreateFarmFromFarmer />} />
            <Route path="concept" element={<ConceptExplainer />} />
            <Route path="harvest" element={<HarvestPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="multi-claude" element={<MultiClaudeManager />} />
            <Route path="error" element={<SafeErrorPage />} />
            <Route path="calculator" element={<Calculator />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ErrorBoundary>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GlobalErrorBoundary>
  )
}