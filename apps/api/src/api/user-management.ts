/**
 * User Management API
 *
 * RESTful API endpoints for managing users and administrator roles.
 *
 * Authentication: All routes require authentication
 * Authorization: Admin-only operations are protected
 *
 * Endpoints:
 * - GET    /api/users              - List all users (admin only)
 * - GET    /api/users/current      - Get current user profile
 * - GET    /api/users/:id          - Get user by ID
 * - POST   /api/users              - Create new user (admin only)
 * - PUT    /api/users/:id          - Update user profile
 * - PUT    /api/users/:id/admin    - Toggle admin status (admin only)
 * - DELETE /api/users/:id          - Deactivate user (admin only)
 * - POST   /api/users/:id/reactivate - Reactivate user (admin only)
 */

import { Router, Request, Response } from 'express';
import { verifyToken, requirePermission, requireRole, Role, Permission, AuthenticatedRequest } from '../middleware/enhancedRBAC';
import { userManagementService, UpdateUserInput, UserListOptions } from '../services/userManagementService';
import { logger, LogCategory } from '../services/ProductionLogger';
import { ApiResponse } from '../types/api';

const router = Router();

// Apply authentication to all routes
router.use(verifyToken);

/**
 * GET /api/users - List all users (admin only)
 *
 * Query parameters:
 * - includeInactive: boolean - Include deactivated users
 * - page: number - Page number (default: 1)
 * - limit: number - Items per page (default: 50, max: 100)
 * - sortBy: string - Sort field (created_at, username, email, last_login_at)
 * - sortOrder: string - Sort order (asc, desc)
 */
router.get(
  '/',
  requirePermission(Permission.USER_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        includeInactive = 'false',
        page = '1',
        limit = '50',
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Validate and sanitize query parameters
      const options: UserListOptions = {
        includeInactive: includeInactive === 'true',
        page: Math.max(1, parseInt(page as string, 10) || 1),
        limit: Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50)),
        sortBy: ['created_at', 'username', 'email', 'last_login_at'].includes(sortBy as string)
          ? (sortBy as any)
          : 'created_at',
        sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
      };

      // Only admins can see inactive users
      if (options.includeInactive && req.user?.role !== Role.ADMIN && req.user?.role !== Role.SUPERADMIN) {
        options.includeInactive = false;
      }

      const result = await userManagementService.getAllUsers(options);

      // Remove sensitive fields from response
      const sanitizedUsers = result.users.map(user => {
        const { password_hash, mfa_secret, ...safeUser } = user as any;
        return safeUser;
      });

      const response: ApiResponse<any> = {
        success: true,
        data: {
          users: sanitizedUsers,
          total: result.total,
          page: options.page,
          limit: options.limit,
          totalPages: Math.ceil(result.total / options.limit!)
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, 'Failed to list users:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to retrieve users'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/users/current - Get current user profile
 *
 * Returns the authenticated user's profile with full context.
 */
router.get(
  '/current',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.id) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'User not authenticated'
        };
        return res.status(401).json(response);
      }

      const user = await userManagementService.getCurrentUser(req.user.id);

      if (!user) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'User not found'
        };
        return res.status(404).json(response);
      }

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, 'Failed to get current user:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to retrieve current user'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/users/:id - Get user by ID
 *
 * Users can view their own profile. Admins can view any profile.
 */
router.get(
  '/:id',
  requirePermission(Permission.USER_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check if user is accessing their own profile or is admin
      if (req.user?.id !== id && req.user?.role !== Role.ADMIN && req.user?.role !== Role.SUPERADMIN) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Forbidden: You can only view your own profile'
        };
        return res.status(403).json(response);
      }

      const user = await userManagementService.getUserById(id);

      if (!user) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'User not found'
        };
        return res.status(404).json(response);
      }

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, `Failed to get user ${req.params.id}:`, error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to retrieve user'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/users - Deprecated (admin only)
 *
 * User creation is now handled by POST /api/auth/register so that end users
 * can self-select their authentication mode. This endpoint responds with a
 * helpful error to guide consumers during the deprecation window.
 */
router.post(
  '/',
  requireRole(Role.ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Deprecated endpoint: Use POST /api/auth/register for user creation.'
    };

    res.status(410);
    res.set('Deprecation', 'true');
    res.set('Link', '</api/auth/register>; rel="successor-version"');

    return res.json(response);
  }
);

/**
 * PUT /api/users/:id - Update user profile
 *
 * Users can update their own profile. Admins can update any profile.
 *
 * Request body:
 * {
 *   email?: string,
 *   username?: string,
 *   password?: string,
 *   display_name?: string,
 *   avatar_url?: string,
 *   preferences?: object
 * }
 */
router.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const input: UpdateUserInput = req.body;

      // Check if user is updating their own profile or has permission
      const isUpdatingSelf = req.user?.id === id;
      const isAdmin = req.user?.role === Role.ADMIN || req.user?.role === Role.SUPERADMIN;
      const hasPermission = req.user?.permissions?.includes(Permission.USER_UPDATE);

      if (!isUpdatingSelf && !isAdmin && !hasPermission) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Forbidden: You can only update your own profile'
        };
        return res.status(403).json(response);
      }

      const user = await userManagementService.updateUser(id, input);

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      logger.info(LogCategory.API, `User updated: ${user.username} (${user.id})`);

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, `Failed to update user ${req.params.id}:`, error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to update user'
      };

      // Return appropriate status code
      const statusCode = error.message.includes('not found') ? 404 :
                        error.message.includes('already exists') ? 409 : 400;
      res.status(statusCode).json(response);
    }
  }
);

/**
 * PUT /api/users/:id/admin - Toggle admin status (admin only)
 *
 * Enforces single-administrator rule:
 * - Only one user can be admin at a time
 * - Current admin must be deselected before assigning to another user
 * - First user is automatically admin
 */
router.put(
  '/:id/admin',
  requireRole(Role.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const user = await userManagementService.toggleAdminStatus(id, req.user?.id);

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      logger.info(LogCategory.API, `Admin status toggled by ${req.user?.id}: ${user.username} -> ${user.is_admin}`);

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser,
        message: user.is_admin
          ? `${user.username} is now an administrator`
          : `Admin privileges removed from ${user.username}`
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, `Failed to toggle admin status for user ${req.params.id}:`, error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to toggle admin status'
      };

      // Return appropriate status code
      const statusCode = error.message.includes('not found') ? 404 :
                        error.message.includes('Only one administrator') ? 409 : 400;
      res.status(statusCode).json(response);
    }
  }
);

/**
 * DELETE /api/users/:id - Deactivate user (admin only)
 *
 * Soft delete - marks user as inactive but preserves data.
 * Cannot deactivate an administrator (must reassign admin role first).
 */
router.delete(
  '/:id',
  requireRole(Role.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Prevent admin from deactivating themselves
      if (req.user?.id === id) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Cannot deactivate your own account'
        };
        return res.status(400).json(response);
      }

      const user = await userManagementService.deactivateUser(id);

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      logger.info(LogCategory.API, `User deactivated by admin ${req.user?.id}: ${user.username}`);

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser,
        message: `User ${user.username} has been deactivated`
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, `Failed to deactivate user ${req.params.id}:`, error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to deactivate user'
      };

      // Return appropriate status code
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json(response);
    }
  }
);

/**
 * POST /api/users/:id/reactivate - Reactivate user (admin only)
 *
 * Reactivates a previously deactivated user.
 */
router.post(
  '/:id/reactivate',
  requireRole(Role.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;

      const user = await userManagementService.reactivateUser(id);

      // Remove sensitive fields
      const { password_hash, mfa_secret, ...safeUser } = user as any;

      logger.info(LogCategory.API, `User reactivated by admin ${req.user?.id}: ${user.username}`);

      const response: ApiResponse<any> = {
        success: true,
        data: safeUser,
        message: `User ${user.username} has been reactivated`
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, `Failed to reactivate user ${req.params.id}:`, error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to reactivate user'
      };

      // Return appropriate status code
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json(response);
    }
  }
);

/**
 * GET /api/users/stats/summary - Get user statistics (admin only)
 *
 * Returns summary statistics about users in the system.
 */
router.get(
  '/stats/summary',
  requireRole(Role.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const totalUsers = await userManagementService.countActiveUsers();
      const currentAdmin = await userManagementService.getCurrentAdmin();

      const response: ApiResponse<any> = {
        success: true,
        data: {
          totalUsers,
          currentAdmin: currentAdmin ? {
            id: currentAdmin.id,
            username: currentAdmin.username,
            email: currentAdmin.email,
            display_name: currentAdmin.display_name
          } : null
        }
      };

      res.json(response);
    } catch (error: any) {
      logger.error(LogCategory.API, 'Failed to get user statistics:', error);
      const response: ApiResponse<null> = {
        success: false,
        error: error.message || 'Failed to retrieve user statistics'
      };
      res.status(500).json(response);
    }
  }
);

export default router;
