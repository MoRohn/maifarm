import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { Dashboard } from './components/Dashboard/Dashboard'
import { BarnPage } from './components/Barn/BarnPage'
import { CreateFarmFromSeed } from './components/Farm/CreateFarmFromSeed'
import { HarvestPage } from './components/Harvest/HarvestPage'
import { GrowingPage } from './components/Farm/GrowingPage'
import SettingsPage from './components/Settings/SettingsPage'
import { AnalyticsPage } from './components/Analytics/AnalyticsPage'
import { MultiClaudeManager } from './components/MultiClaude/MultiClaudeManager'
import SafeErrorPage from './components/ErrorPage/SafeErrorPage'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { useThemeStore } from './store/themeStore'
import { AuthProvider } from './hooks/useAuth'
import { AlertNotification } from './components/common/AlertNotification'
import { alertService } from './services/alertService'
import { ConnectionStatus } from './components/common/ConnectionStatus'
import { ThemeProvider } from './components/common/ThemeProvider'
import BackgroundIndicator from './components/common/BackgroundIndicator'
import { ApiErrorDisplay } from './components/common/ApiErrorDisplay'

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
          <Route path="barn" element={<BarnPage />} />
          <Route path="farms/new" element={<CreateFarmFromSeed />} />
          <Route path="farms/:farmId" element={<div>Farm Details (Coming Soon)</div>} />
          <Route path="harvests/:farmId" element={<HarvestPage />} />
          <Route path="multiclaude" element={<MultiClaudeManager />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
        <Route path="/farms/:farmId/growing" element={<GrowingPage />} />
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
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App