import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { ApiResponse } from '../types/api';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-key-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'maifarm-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '30d'; // Long-lived refresh token for mobile

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

// Generate tokens helper
function generateTokens(userId: string, email: string, roles: string[] = []) {
  const payload = { userId, email, roles };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, { 
    expiresIn: ACCESS_TOKEN_EXPIRY 
  });
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' }, 
    REFRESH_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  return { accessToken, refreshToken };
}

// Login endpoint
router.post('/login', apiRateLimits.auth, async (req, res) => {
  try {
    const { email, username, password, deviceId, platform } = req.body;
    
    // Mock authentication - in production this would verify credentials
    if ((email === 'test@maifarm.ai' || username === 'test') && password) {
      const tokens = generateTokens(mockUser.id, mockUser.email, ['admin']);
      
      // Store refresh token in database for validation
      if (deviceId) {
        await db.query(
          `INSERT INTO refresh_tokens (user_id, token, device_id, platform, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
           ON CONFLICT (user_id, device_id) 
           DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at`,
          [mockUser.id, tokens.refreshToken, deviceId, platform || 'unknown']
        ).catch(() => {}); // Ignore errors for mock
      }
      
      res.json({
        success: true,
        user: mockUser,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900 // 15 minutes in seconds
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
    const { refreshToken, deviceId } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }
    
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Validate token in database if deviceId provided
      if (deviceId) {
        const result = await db.query(
          'SELECT * FROM refresh_tokens WHERE user_id = $1 AND device_id = $2 AND token = $3 AND expires_at > NOW()',
          [decoded.userId, deviceId, refreshToken]
        ).catch(() => null);
        
        // For mock/dev, allow even if DB check fails
        if (process.env.NODE_ENV === 'production' && (!result || result.rows.length === 0)) {
          throw new Error('Token not found or expired');
        }
      }
      
      // Generate new tokens
      const tokens = generateTokens(decoded.userId, mockUser.email, ['admin']);
      
      // Update refresh token in database
      if (deviceId) {
        await db.query(
          `UPDATE refresh_tokens 
           SET token = $1, expires_at = NOW() + INTERVAL '30 days'
           WHERE user_id = $2 AND device_id = $3`,
          [tokens.refreshToken, decoded.userId, deviceId]
        ).catch(() => {});
      }
      
      res.json({
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900,
        user: mockUser
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
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

// Biometric authentication endpoint
router.post('/biometric', apiRateLimits.auth, async (req, res) => {
  try {
    const { deviceId, biometricToken, platform } = req.body;
    
    if (!deviceId || !biometricToken) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and biometric token required'
      });
    }
    
    // Verify biometric token (in production, this would validate with device)
    // For iOS, this would be validated against stored Face ID/Touch ID credentials
    const result = await db.query(
      `SELECT u.* FROM users u
       JOIN user_devices ud ON u.id = ud.user_id
       WHERE ud.device_id = $1 AND ud.biometric_enabled = true`,
      [deviceId]
    ).catch(() => null);
    
    // For development, allow mock biometric auth
    const user = result?.rows[0] || mockUser;
    
    const tokens = generateTokens(user.id, user.email, ['admin']);
    
    res.json({
      success: true,
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900
    });
  } catch (error) {
    console.error('Biometric auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Biometric authentication failed'
    });
  }
});

// API Key authentication for persistent sessions
router.post('/api-key', apiRateLimits.auth, async (req, res) => {
  try {
    const { apiKey, deviceId } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Validate API key
    const result = await db.query(
      `SELECT u.*, ak.id as key_id, ak.name as key_name
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key = $1 AND ak.active = true`,
      [apiKey]
    ).catch(() => null);
    
    if (!result || result.rows.length === 0) {
      // For development, allow mock API key
      if (apiKey === 'dev-api-key') {
        const tokens = generateTokens(mockUser.id, mockUser.email, ['admin']);
        return res.json({
          success: true,
          user: mockUser,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: 900
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    const user = result.rows[0];
    const tokens = generateTokens(user.id, user.email, ['admin']);
    
    // Update last used timestamp for API key
    await db.query(
      'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
      [user.key_id]
    ).catch(() => {});
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900
    });
  } catch (error) {
    console.error('API key auth error:', error);
    res.status(500).json({
      success: false,
      error: 'API key authentication failed'
    });
  }
});

export default router;