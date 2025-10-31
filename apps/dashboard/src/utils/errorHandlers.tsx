import React from 'react';
import { toast } from 'react-hot-toast';

// Define window extensions
declare global {
  interface Window {
    __lastRateLimitError?: {
      provider: string;
      providerName: string;
      providerUrl: string;
      message: string;
      timestamp: number;
    };
  }
}

/**
 * Handle rate limit errors with provider-specific messages and action buttons
 */
export function handleRateLimitError(error: any): void {
  // Extract error details from the enhanced error or window storage
  const rateLimitInfo = error.code === 'RATE_LIMIT_EXCEEDED'
    ? {
        provider: error.provider,
        providerName: error.providerName,
        providerUrl: error.providerUrl,
        message: error.message
      }
    : window.__lastRateLimitError;

  if (!rateLimitInfo) {
    // Fallback to generic error message
    toast.error('Rate limit exceeded. Please try again later.');
    return;
  }

  // Show enhanced toast with JSX content
  toast.error(
    (
      <div style={{ maxWidth: '400px' }}>
        <strong>Rate Limit Exceeded</strong>
        <p style={{ margin: '8px 0 12px', fontSize: '14px', opacity: 0.9 }}>
          {rateLimitInfo.message}
        </p>
        <a
          href={rateLimitInfo.providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            marginTop: '8px',
            padding: '6px 12px',
            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 500,
            fontSize: '14px'
          }}
        >
          Add {rateLimitInfo.providerName} Credits →
        </a>
      </div>
    ),
    {
      duration: 10000, // Show for 10 seconds
      position: 'top-center',
      style: {
        minWidth: '320px',
        padding: '16px',
        borderRadius: '8px',
        background: '#1f2937',
        color: '#fff'
      },
      id: 'rate-limit-error' // Prevent duplicate toasts
    }
  );
}

/**
 * Generic API error handler
 */
export function handleApiError(error: any, context?: string): void {
  // Check for rate limit errors first
  if (error.code === 'RATE_LIMIT_EXCEEDED' || error.response?.status === 429) {
    handleRateLimitError(error);
    return;
  }

  // Handle network errors
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
    toast.error('Unable to connect to the server. Please check your connection.');
    return;
  }

  // Handle validation errors
  if (error.response?.status === 400) {
    const message = error.response?.data?.error?.message || 'Invalid request. Please check your input.';
    toast.error(message);
    return;
  }

  // Handle unauthorized errors
  if (error.response?.status === 401) {
    toast.error('Your session has expired. Please log in again.');
    return;
  }

  // Handle forbidden errors
  if (error.response?.status === 403) {
    toast.error('You do not have permission to perform this action.');
    return;
  }

  // Handle server errors
  if (error.response?.status >= 500) {
    toast.error('Server error. Please try again later.');
    return;
  }

  // Generic error fallback
  const message = error.message || 'An unexpected error occurred.';
  const displayMessage = context ? `${context}: ${message}` : message;
  toast.error(displayMessage);
}

/**
 * Create a rate limit modal dialog for more prominent display
 */
export function showRateLimitModal(error: any): void {
  const rateLimitInfo = error.code === 'RATE_LIMIT_EXCEEDED'
    ? {
        provider: error.provider,
        providerName: error.providerName,
        providerUrl: error.providerUrl,
        message: error.message
      }
    : window.__lastRateLimitError;

  if (!rateLimitInfo) {
    handleApiError(error);
    return;
  }

  // Create modal element
  const modalId = 'rate-limit-modal';

  // Remove existing modal if any
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease;
    ">
      <div style="
        background: white;
        border-radius: 12px;
        padding: 32px;
        max-width: 480px;
        width: 90%;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        animation: slideUp 0.3s ease;
      ">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 16px;
          ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 9V13M12 17H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0377 2.66667 10.2679 4L3.33974 16C2.56998 17.3333 3.53223 19 5.07183 19Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <h2 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">
              Rate Limit Reached
            </h2>
            <p style="margin: 4px 0 0; color: #6b7280; font-size: 14px;">
              ${rateLimitInfo.providerName} API
            </p>
          </div>
        </div>

        <p style="color: #374151; line-height: 1.6; margin-bottom: 24px;">
          ${rateLimitInfo.message}
        </p>

        <div style="
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 24px;
        ">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>Next Step:</strong> Add credits to your ${rateLimitInfo.providerName} account to continue using MaiFarm.
          </p>
        </div>

        <div style="display: flex; gap: 12px;">
          <a href="${rateLimitInfo.providerUrl}"
             target="_blank"
             rel="noopener noreferrer"
             style="
               flex: 1;
               padding: 12px 24px;
               background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
               color: white;
               text-decoration: none;
               border-radius: 8px;
               font-weight: 500;
               text-align: center;
               transition: transform 0.2s;
               display: inline-block;
             "
             onmouseover="this.style.transform='scale(1.02)'"
             onmouseout="this.style.transform='scale(1)'"
          >
            Add ${rateLimitInfo.providerName} Credits
          </a>
          <button
            onclick="document.getElementById('${modalId}').remove()"
            style="
              padding: 12px 24px;
              background: #f3f4f6;
              color: #374151;
              border: 1px solid #d1d5db;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='#e5e7eb'"
            onmouseout="this.style.background='#f3f4f6'"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
  `;

  document.body.appendChild(modal);

  // Remove modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal.querySelector('div')) {
      modal.remove();
    }
  });
}