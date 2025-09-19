import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { Dashboard } from './components/Dashboard/Dashboard'
import { FarmersPage } from './components/Farmers/FarmersPage'
import { BarnPage } from './components/Barn/BarnPage'
import { CreateFarmFromSeed } from './components/Farm/CreateFarmFromSeed'
import { CreateFarmFromFarmer } from './components/Farm/CreateFarmFromFarmer'
import { ConceptExplainer } from './components/Farm/ConceptExplainer'
import { HarvestPage } from './components/Harvest/HarvestPage'
import SettingsPage from './components/Settings/SettingsPage'
import Analytics from './components/Analytics/Analytics'
import { MultiClaudeManager } from './components/MultiClaude/MultiClaudeManager'
import SafeErrorPage from './components/ErrorPage/SafeErrorPage'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary'
import { Calculator } from './components/Calculator/Calculator'
import { useThemeStore } from './store/themeStore'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './components/common/ThemeProvider'
import BackgroundIndicator from './components/common/BackgroundIndicator'
import { ApiErrorDisplay } from './components/common/ApiErrorDisplay'
import { CommandPalette } from './components/common/CommandPalette'
import { setupHMRHandler } from './utils/hmrHandler'
import { wsManager } from './services/websocket/singletonManager'

// Setup HMR handler to prevent WebSocket suspension errors
if (import.meta.env.DEV) {
  setupHMRHandler();
}

// Initialize WebSocket connection on app startup using singleton manager
wsManager.initialize('http://localhost:4567');

function AppContent() {
  const theme = useThemeStore((state) => state.theme)
  const applyTheme = useThemeStore((state) => state.applyTheme)
  const navigate = useNavigate()
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
    
    // Apply saved theme colors
    applyTheme()
  }, [theme, applyTheme, isInitialized])


  return (
    <AuthProvider onNavigate={navigate}>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<Dashboard />} />
          <Route path="farmers" element={<FarmersPage />} />
          <Route path="barn" element={<BarnPage />} />
          <Route path="farms/new" element={<CreateFarmFromSeed />} />
          <Route path="farms/create-from-farmer" element={<CreateFarmFromFarmer />} />
          <Route path="farms/:farmId" element={<div>Farm Details (Coming Soon)</div>} />
          <Route path="farm/:farmId/transition/:mode" element={<ConceptExplainer />} />
          <Route path="harvest/:farmId" element={<HarvestPage />} />
          <Route path="multiclaude" element={<MultiClaudeManager />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
        <Route path="/error" element={<SafeErrorPage />} />
      </Routes>
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
      <CommandPalette />
    </AuthProvider>
  )
}

function App() {
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    // Small delay to ensure theme is applied before rendering
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 10);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!isReady) {
    // Return null to prevent any rendering until ready
    return null;
  }
  
  return (
    <GlobalErrorBoundary
      onError={(error, errorInfo) => {
        // Log to backend error tracking
        console.error('App Error:', error, errorInfo);
      }}
    >
      <ErrorBoundary>
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </GlobalErrorBoundary>
  )
}

export default App