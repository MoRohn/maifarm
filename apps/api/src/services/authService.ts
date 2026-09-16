import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database/client';
import { logger } from '../utils/logger';
import { User, AuthToken, LoginInput, RegisterInput } from '../../src/types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const REFRESH_TOKEN_EXPIRY = '30d';

export class AuthService {
  private users: Map<string, User & { passwordHash: string }> = new Map();

  constructor() {
    this.initializeDefaultUsers();
  }

  private initializeDefaultUsers() {
    // Create default admin user for development
    const adminUser = {
      id: randomUUID(),
      email: 'admin@maifarm.local',
      name: 'Admin User',
      passwordHash: bcrypt.hashSync('admin123', 10),
      roles: [{ 
        id: '1', 
        name: 'admin', 
        description: 'Administrator',
        permissions: ['*'] 
      }],
      permissions: ['*'],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: new Date(),
      mfaEnabled: false,
      isActive: true
    };

    this.users.set(adminUser.id, adminUser);
    logger.info('Default admin user created: admin@maifarm.local / admin123');
  }

  async login(input: LoginInput): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      // Check if database is available
      if (db) {
        return await this.loginWithDatabase(input);
      } else {
        return await this.loginWithMemory(input);
      }
    } catch (error) {
      logger.error('Login error:', error);
      throw new Error('Authentication failed');
    }
  }

  private async loginWithMemory(input: LoginInput) {
    // Find user by email or username
    const user = Array.from(this.users.values()).find(u => 
      u.email === input.email || u.email === input.username
    );

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLogin = new Date();

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);

    // Remove sensitive data
    const { passwordHash, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days in seconds
    };
  }

  private async loginWithDatabase(input: LoginInput) {
    const query = `
      SELECT u.*, array_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'description', r.description,
          'permissions', r.permissions
        )
      ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.email = $1 OR u.username = $1
      GROUP BY u.id
    `;

    const result = await db.query(query, [input.email || input.username]);
    
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(input.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);

    // Format user object
    const formattedUser: User = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles || [],
      permissions: this.extractPermissions(user.roles),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login_at ? new Date(user.last_login_at) : new Date(),
      mfaEnabled: user.mfa_enabled || false,
      isActive: user.is_active !== false
    };

    return {
      user: formattedUser,
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60
    };
  }

  async register(input: RegisterInput): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Validate input
    if (!input.email || !input.password || !input.name) {
      throw new Error('Missing required fields');
    }

    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(u => u.email === input.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, 10);

    // Create new user
    const newUser = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash,
      roles: [{ 
        id: '2', 
        name: 'user', 
        description: 'Standard User',
        permissions: ['read:own', 'write:own'] 
      }],
      permissions: ['read:own', 'write:own'],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: new Date(),
      mfaEnabled: false,
      isActive: true
    };

    // Save user
    this.users.set(newUser.id, newUser);

    // Generate tokens
    const accessToken = this.generateAccessToken(newUser);
    const refreshToken = this.generateRefreshToken(newUser.id);

    // Remove sensitive data
    const { passwordHash: _, ...safeUser } = newUser;

    return {
      user: safeUser,
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60
    };
  }

  async verifyToken(token: string): Promise<AuthToken> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthToken;
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET + '-refresh') as { userId: string };
      
      // Get user
      const user = this.users.get(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const accessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user.id);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 7 * 24 * 60 * 60
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  private generateAccessToken(user: any): string {
    // Combine permissions from roles and direct user permissions
    const rolePermissions = this.extractPermissions(user.roles);
    const userPermissions = user.permissions || [];
    const allPermissions = Array.from(new Set([...rolePermissions, ...userPermissions]));

    const payload: Omit<AuthToken, 'exp' | 'iat'> = {
      userId: user.id,
      email: user.email,
      roles: user.roles.map((r: any) => typeof r === 'string' ? r : r.name),
      permissions: allPermissions
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY
    });
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET + '-refresh', {
      expiresIn: REFRESH_TOKEN_EXPIRY
    });
  }

  private extractPermissions(roles: any[]): string[] {
    if (!roles || roles.length === 0) return [];
    
    const permissions = new Set<string>();
    
    roles.forEach(role => {
      if (role.permissions) {
        if (Array.isArray(role.permissions)) {
          role.permissions.forEach((p: string) => permissions.add(p));
        } else if (role.permissions === '*') {
          permissions.add('*');
        }
      }
    });

    return Array.from(permissions);
  }

  async logout(userId: string): Promise<void> {
    // In a real implementation, this would invalidate the refresh token
    logger.info(`User ${userId} logged out`);
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}

// Create singleton instance
export const authService = new AuthService();
