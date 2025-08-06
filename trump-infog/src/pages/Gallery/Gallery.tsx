import React, { useState, useEffect } from 'react'

interface GalleryItem {
  id: string
  title: string
  thumbnail: string
  author: string
  createdAt: string
  viewCount: number
}

const Gallery: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchGalleryItems()
  }, [filter])

  const fetchGalleryItems = async () => {
    try {
      const params = filter !== 'all' ? `?visibility=public` : ''
      const response = await fetch(`/api/infographics${params}`)
      const data = await response.json()
      
      // Filter for published items only
      const galleryItems = (data.data || [])
        .filter((item: any) => item.status === 'published')
        .map((item: any) => ({
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail || '/placeholder.png',
          author: 'Unknown Author', // Would come from user data
          createdAt: item.createdAt,
          viewCount: item.viewCount || 0
        }))
      
      setItems(galleryItems)
    } catch (error) {
      console.error('Error fetching gallery items:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Gallery</h2>
        <p className="mt-2 text-gray-600">
          Explore published infographics from the community
        </p>
      </div>

      <div className="mb-6 flex space-x-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('trending')}
          className={`px-4 py-2 rounded-lg ${
            filter === 'trending'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Trending
        </button>
        <button
          onClick={() => setFilter('recent')}
          className={`px-4 py-2 rounded-lg ${
            filter === 'recent'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Recent
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="spinner"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No published infographics yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <img
                src={item.thumbnail}
                alt={item.title}
                className="w-full h-48 object-cover"
              />
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  By {item.author}
                </p>
                <div className="flex justify-between items-center text-sm text-gray-500">
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  <span>{item.viewCount} views</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Gallery