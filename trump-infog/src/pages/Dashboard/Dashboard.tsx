import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface InfographicSummary {
  id: string
  title: string
  status: string
  createdAt: string
  thumbnail?: string
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [infographics, setInfographics] = useState<InfographicSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch infographics from API
    fetchInfographics()
  }, [])

  const fetchInfographics = async () => {
    try {
      const response = await fetch('/api/infographics')
      const data = await response.json()
      setInfographics(data.data || [])
    } catch (error) {
      console.error('Error fetching infographics:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNew = () => {
    navigate('/editor')
  }

  const handleEdit = (id: string) => {
    navigate(`/editor/${id}`)
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-2 text-gray-600">
            Manage your infographics and create new visualizations
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Infographic
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="spinner"></div>
        </div>
      ) : infographics.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No infographics yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new infographic.
          </p>
          <div className="mt-6">
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Create your first infographic
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {infographics.map((infographic) => (
            <div
              key={infographic.id}
              className="infographic-preview cursor-pointer"
              onClick={() => handleEdit(infographic.id)}
            >
              {infographic.thumbnail ? (
                <img
                  src={infographic.thumbnail}
                  alt={infographic.title}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              ) : (
                <div className="w-full h-48 bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
                  <svg
                    className="h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                {infographic.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Status: {infographic.status}
              </p>
              <p className="text-sm text-gray-500">
                Created: {new Date(infographic.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard