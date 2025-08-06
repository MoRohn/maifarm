import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard/Dashboard'
import Editor from './pages/Editor/Editor'
import Gallery from './pages/Gallery/Gallery'
import { Monitoring } from './pages/Monitoring/Monitoring'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-2xl font-bold text-gray-900">
                Trump Infog
              </h1>
              <nav className="flex space-x-8">
                <Link to="/" className="text-gray-700 hover:text-gray-900">
                  Dashboard
                </Link>
                <Link to="/editor" className="text-gray-700 hover:text-gray-900">
                  Editor
                </Link>
                <Link to="/gallery" className="text-gray-700 hover:text-gray-900">
                  Gallery
                </Link>
                <Link to="/monitoring" className="text-gray-700 hover:text-gray-900">
                  Monitoring
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:id" element={<Editor />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/monitoring" element={<Monitoring />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App