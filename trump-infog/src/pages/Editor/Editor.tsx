import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const Editor: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id) {
      // Load existing infographic
      loadInfographic(id)
    }
  }, [id])

  const loadInfographic = async (infographicId: string) => {
    try {
      const response = await fetch(`/api/infographics/${infographicId}`)
      const data = await response.json()
      if (data.data) {
        setTitle(data.data.title)
        setSelectedTemplate(data.data.templateId || '')
      }
    } catch (error) {
      console.error('Error loading infographic:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        title,
        templateId: selectedTemplate,
        content: {} // This would contain the actual infographic data
      }

      const url = id ? `/api/infographics/${id}` : '/api/infographics'
      const method = id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      
      if (!id && data.data?.id) {
        // Navigate to the edit page for the new infographic
        navigate(`/editor/${data.data.id}`)
      }
    } catch (error) {
      console.error('Error saving infographic:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    if (!id) {
      alert('Please save the infographic first')
      return
    }

    try {
      const response = await fetch(`/api/infographics/${id}/generate`, {
        method: 'POST'
      })
      const data = await response.json()
      console.log('Generation started:', data)
    } catch (error) {
      console.error('Error generating infographic:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {id ? 'Edit Infographic' : 'Create New Infographic'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter infographic title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a template</option>
              <option value="bar-chart">Bar Chart</option>
              <option value="line-chart">Line Chart</option>
              <option value="pie-chart">Pie Chart</option>
              <option value="dashboard">Dashboard</option>
              <option value="timeline">Timeline</option>
              <option value="comparison">Comparison</option>
            </select>
          </div>

          <div className="editor-toolbar">
            <button className="font-bold">B</button>
            <button className="italic">I</button>
            <button className="underline">U</button>
            <div className="border-l border-gray-300 h-6 mx-2"></div>
            <button>📊</button>
            <button>📈</button>
            <button>🥧</button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <p className="text-gray-500">
              Infographic canvas will be displayed here
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Drag and drop elements to build your visualization
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {id && (
            <button
              onClick={handleGenerate}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Generate
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Editor