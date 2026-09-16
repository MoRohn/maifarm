import React from 'react'

export default function TestPage() {
  console.log('[TestPage] Rendering')

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a1a1a',
      color: '#fff',
      fontSize: '24px',
      fontFamily: 'system-ui'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>✅ React is Working</h1>
        <p>Test page loaded successfully</p>
        <p style={{ fontSize: '16px', marginTop: '20px' }}>
          If you see this, React is mounting correctly.
        </p>
      </div>
    </div>
  )
}
