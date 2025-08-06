import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GrowingPage } from './GrowingPage';

// This wrapper ensures GrowingPage has proper Router context
export const GrowingPageWrapper: React.FC = () => {
  // Validate we have Router context by using hooks
  try {
    const navigate = useNavigate();
    const params = useParams();
    
    // If we successfully have Router context, render the GrowingPage
    return <GrowingPage />;
  } catch (error) {
    console.error('GrowingPage rendered outside Router context:', error);
    // Fallback to window navigation
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Navigation Error</h1>
          <p className="mb-4">Unable to load the growing page properly.</p>
          <button
            onClick={() => window.location.href = '/home'}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }
};