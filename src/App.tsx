import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { Dashboard } from './components/Dashboard/Dashboard'
import { YamlGenerator } from './components/YamlGenerator/YamlGenerator'
import { useThemeStore } from './store/themeStore'
import { useWebSocket } from './hooks/useWebSocket'

function App() {
  const theme = useThemeStore((state) => state.theme)
  
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  // Initialize WebSocket connection
  useWebSocket()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="yaml-generator" element={<YamlGenerator />} />
          <Route path="farms/:farmId" element={<div>Farm Details (Coming Soon)</div>} />
          <Route path="analytics" element={<div>Analytics (Coming Soon)</div>} />
          <Route path="settings" element={<div>Settings (Coming Soon)</div>} />
        </Route>
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
    </BrowserRouter>
  )
}

export default App