import { Router } from 'express';
import { apiRateLimits } from '../middleware/rateLimit';

const router = Router();

// Mock user for testing
const mockUser = {
  id: '1',
  email: 'test@maifarm.ai',
  name: 'Test User',
  roles: [{ id: '1', name: 'admin', description: 'Administrator', permissions: [] }],
  permissions: [],
  createdAt: new Date(),
  lastLogin: new Date(),
  mfaEnabled: false
};

// Login endpoint
router.post('/login', apiRateLimits.auth, async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Mock authentication - in production this would verify credentials
    if ((email === 'test@maifarm.ai' || username === 'test') && password) {
      res.json({
        success: true,
        user: mockUser,
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        expiresIn: 3600
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Register endpoint
router.post('/register', apiRateLimits.auth, async (req, res) => {
  try {
    const { email, name, password } = req.body;
    
    // Mock registration - in production this would create a new user
    if (email && name && password) {
      const newUser = {
        ...mockUser,
        id: Date.now().toString(),
        email,
        name
      };
      
      res.json({
        success: true,
        user: newUser,
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        expiresIn: 3600
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', apiRateLimits.auth, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Mock token refresh - in production this would validate the refresh token
    if (refreshToken && refreshToken.startsWith('mock-refresh-token-')) {
      res.json({
        success: true,
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        expiresIn: 3600,
        user: mockUser
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Logout endpoint
router.post('/logout', apiRateLimits.auth, async (req, res) => {
  // Mock logout - in production this would invalidate the session
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;