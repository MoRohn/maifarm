/**
 * User Management Service
 *
 * Handles all user management operations including:
 * - User CRUD operations
 * - Administrator role management with single-admin enforcement
 * - User authentication and validation
 * - User preferences management
 */

import { db } from '../database/client';
import { logger, LogCategory } from './ProductionLogger';
import bcrypt from 'bcryptjs';
import { userCreationService } from './userCreationService';

// User interface matching database schema
export interface User {
  id: string;
  email: string;
  username: string;
  password_hash?: string; // Never return in API responses
  roles: string[];
  permissions: string[];
  is_admin: boolean;
  display_name?: string;
  avatar_url?: string;
  preferences: Record<string, any>;
  last_login_at?: Date;
  auth_mode?: 'password' | 'passwordless';
  email_verified?: boolean;
  setup_completed_at?: Date | null;
  is_active: boolean;
  mfa_enabled?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password?: string;
  authMode?: 'password' | 'passwordless';
  display_name?: string;
  avatar_url?: string;
  preferences?: Record<string, any>;
  roles?: string[];
  permissions?: string[];
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  password?: string;
  display_name?: string;
  avatar_url?: string;
  preferences?: Record<string, any>;
}

export interface UserListOptions {
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'username' | 'email' | 'last_login_at';
  sortOrder?: 'asc' | 'desc';
}

class UserManagementService {
  private static instance: UserManagementService;

  private constructor() {}

  public static getInstance(): UserManagementService {
    if (!UserManagementService.instance) {
      UserManagementService.instance = new UserManagementService();
    }
    return UserManagementService.instance;
  }

  /**
   * Get all users with filtering and pagination
   */
  async getAllUsers(options: UserListOptions = {}): Promise<{ users: User[]; total: number }> {
    try {
      const {
        includeInactive = false,
        page = 1,
        limit = 50,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = options;

      const offset = (page - 1) * limit;

      // Build query
      let whereClause = includeInactive ? '' : 'WHERE is_active = true';
      const validSortColumns = ['created_at', 'username', 'email', 'last_login_at'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

      // Get users
      const usersQuery = `
        SELECT
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY ${sortColumn} ${order}
        LIMIT $1 OFFSET $2
      `;

      const usersResult = await db.query(usersQuery, [limit, offset]);

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      const countResult = await db.query(countQuery);
      const total = parseInt(countResult.rows[0].total, 10);

      logger.info(LogCategory.API, `Retrieved ${usersResult.rows.length} users (total: ${total})`);

      return {
        users: usersResult.rows,
        total
      };
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get all users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
        FROM users
        WHERE id = $1
      `;

      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        logger.warn(LogCategory.API, `User not found: ${userId}`);
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(LogCategory.API, `Failed to get user by ID ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = `
        SELECT
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
        FROM users
        WHERE email = $1
      `;

      const result = await db.query(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(LogCategory.API, `Failed to get user by email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const query = `
        SELECT
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
        FROM users
        WHERE username = $1
      `;

      const result = await db.query(query, [username]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(LogCategory.API, `Failed to get user by username ${username}:`, error);
      throw error;
    }
  }

  /**
   * Create new user with validation
   */
  async createUser(input: CreateUserInput, isFirstUser: boolean = false): Promise<User> {
    try {
      if (!input.email || !input.username) {
        throw new Error('Email and username are required');
      }

      const creation = await userCreationService.createUser({
        email: input.email,
        username: input.username,
        password: input.password,
        authMode: input.authMode || (input.password ? 'password' : 'passwordless'),
        name: input.display_name || input.username,
        displayName: input.display_name || input.username,
        avatarUrl: input.avatar_url,
        preferences: input.preferences,
        roles: input.roles || (isFirstUser ? ['admin', 'user'] : undefined),
        permissions: input.permissions,
        sendWelcomeEmail: false,
        requireEmailVerification: (input.authMode || 'password') === 'password',
        metadata: { source: 'admin-service', requestedFirstUser: isFirstUser }
      });

      const user = creation.user as User;
      logger.info(LogCategory.API, `User created: ${user.username} (${user.email}), is_admin: ${user.is_admin}`);
      return user;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    try {
      // Validate user exists
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        throw new Error('User not found');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Email update
      if (input.email && input.email !== existingUser.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input.email)) {
          throw new Error('Invalid email format');
        }

        // Check if new email already exists
        const emailExists = await this.getUserByEmail(input.email);
        if (emailExists) {
          throw new Error('Email already exists');
        }

        updates.push(`email = $${paramIndex++}`);
        values.push(input.email.toLowerCase());
      }

      // Username update
      if (input.username && input.username !== existingUser.username) {
        const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
        if (!usernameRegex.test(input.username)) {
          throw new Error('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens');
        }

        // Check if new username already exists
        const usernameExists = await this.getUserByUsername(input.username);
        if (usernameExists) {
          throw new Error('Username already exists');
        }

        updates.push(`username = $${paramIndex++}`);
        values.push(input.username);
      }

      // Password update
      if (input.password) {
        if (input.password.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(input.password, saltRounds);

        updates.push(`password_hash = $${paramIndex++}`);
        values.push(passwordHash);
      }

      // Display name update
      if (input.display_name !== undefined) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(input.display_name);
      }

      // Avatar URL update
      if (input.avatar_url !== undefined) {
        updates.push(`avatar_url = $${paramIndex++}`);
        values.push(input.avatar_url);
      }

      // Preferences update
      if (input.preferences !== undefined) {
        updates.push(`preferences = $${paramIndex++}`);
        values.push(JSON.stringify(input.preferences));
      }

      if (updates.length === 0) {
        logger.warn(LogCategory.API, `No updates provided for user ${userId}`);
        return existingUser;
      }

      // Always update updated_at
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      // Add userId to values for WHERE clause
      values.push(userId);

      const query = `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
      `;

      const result = await db.query(query, values);
      const user = result.rows[0];

      logger.info(LogCategory.API, `User updated: ${user.username} (${user.id})`);

      return user;
    } catch (error) {
      logger.error(LogCategory.API, `Failed to update user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Toggle admin status with single-admin enforcement
   *
   * This enforces the rule that only one user can be admin at a time.
   * To assign admin to a new user, the current admin must be deselected first.
   */
  async toggleAdminStatus(userId: string, currentAdminId?: string): Promise<User> {
    try {
      // Validate user exists
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newAdminStatus = !user.is_admin;

      // If trying to make user an admin
      if (newAdminStatus === true) {
        // Check if there's already an admin
        const currentAdmin = await this.getCurrentAdmin();
        if (currentAdmin && currentAdmin.id !== userId) {
          throw new Error(
            `Only one administrator can be active at a time. Please deselect ${currentAdmin.username || currentAdmin.email} first.`
          );
        }
      }

      // If trying to remove admin status
      if (newAdminStatus === false) {
        // Verify this is the current admin removing themselves or another admin doing it
        if (currentAdminId && currentAdminId !== userId) {
          const requestingUser = await this.getUserById(currentAdminId);
          if (!requestingUser?.is_admin) {
            throw new Error('Only an administrator can remove admin status');
          }
        }
      }

      // Update admin status
      const query = `
        UPDATE users
        SET is_admin = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
      `;

      const result = await db.query(query, [newAdminStatus, userId]);
      const updatedUser = result.rows[0];

      logger.info(
        LogCategory.API,
        `Admin status toggled for user ${updatedUser.username}: ${user.is_admin} -> ${updatedUser.is_admin}`
      );

      return updatedUser;
    } catch (error) {
      logger.error(LogCategory.API, `Failed to toggle admin status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get current admin user
   */
  async getCurrentAdmin(): Promise<User | null> {
    try {
      const query = `
        SELECT
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
        FROM users
        WHERE is_admin = true AND is_active = true
        LIMIT 1
      `;

      const result = await db.query(query);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get current admin:', error);
      throw error;
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId: string): Promise<User> {
    try {
      // Validate user exists
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Prevent deactivating admin
      if (user.is_admin) {
        throw new Error('Cannot deactivate an administrator. Please reassign admin role first.');
      }

      const query = `
        UPDATE users
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
      `;

      const result = await db.query(query, [userId]);
      const deactivatedUser = result.rows[0];

      logger.info(LogCategory.API, `User deactivated: ${deactivatedUser.username} (${deactivatedUser.id})`);

      return deactivatedUser;
    } catch (error) {
      logger.error(LogCategory.API, `Failed to deactivate user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Reactivate user
   */
  async reactivateUser(userId: string): Promise<User> {
    try {
      const query = `
        UPDATE users
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id, email, username, roles, permissions, is_admin,
          display_name, avatar_url, preferences, last_login_at, setup_completed_at,
          auth_mode, email_verified, is_active, mfa_enabled, created_at, updated_at
      `;

      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      logger.info(LogCategory.API, `User reactivated: ${user.username} (${user.id})`);

      return user;
    } catch (error) {
      logger.error(LogCategory.API, `Failed to reactivate user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get current user with full permissions context
   */
  async getCurrentUser(userId: string): Promise<User | null> {
    try {
      const user = await this.getUserById(userId);

      if (!user) {
        return null;
      }

      // Add computed fields if needed (e.g., aggregated stats)
      logger.debug(LogCategory.API, `Retrieved current user: ${user.username}`);

      return user;
    } catch (error) {
      logger.error(LogCategory.API, `Failed to get current user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Verify user password
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    try {
      const query = `SELECT password_hash FROM users WHERE id = $1`;
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        return false;
      }

      const passwordHash = result.rows[0].password_hash;
      return await bcrypt.compare(password, passwordHash);
    } catch (error) {
      logger.error(LogCategory.API, `Failed to verify password for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE users
        SET last_login_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await db.query(query, [userId]);
      logger.debug(LogCategory.AUTH, `Updated last login for user ${userId}`);
    } catch (error) {
      logger.error(LogCategory.AUTH, `Failed to update last login for user ${userId}:`, error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Count total active users
   */
  async countActiveUsers(): Promise<number> {
    try {
      const query = `SELECT COUNT(*) as count FROM users WHERE is_active = true`;
      const result = await db.query(query);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to count active users:', error);
      throw error;
    }
  }

  /**
   * Check if this is the first user (for auto-admin)
   */
  async isFirstUser(): Promise<boolean> {
    try {
      const count = await this.countActiveUsers();
      return count === 0;
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to check if first user:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const userManagementService = UserManagementService.getInstance();
