import React from 'react'

export const WelcomeExperienceMinimal: React.FC = () => {
  console.log('[MINIMAL] Rendering minimal welcome experience');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom right, #064e3b, #166534, #14532d)',
      color: 'white',
      fontFamily: 'system-ui'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '600px', padding: '40px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>🌱 Welcome to MaiFarm</h1>
        <p style={{ fontSize: '20px', marginBottom: '30px' }}>
          Your AI Agent Farm Management Platform
        </p>
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '30px',
          backdropFilter: 'blur(10px)'
        }}>
          <h2 style={{ marginBottom: '15px' }}>Setup Complete!</h2>
          <p>This is a minimal test page to verify React is rendering.</p>
          <p style={{ marginTop: '15px', fontSize: '14px', opacity: 0.8 }}>
            If you see this, React is working correctly.
          </p>
        </div>
      </div>
    </div>
  )
}
