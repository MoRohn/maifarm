import { Permission, Role, AccessControl, AuthUser } from '@/types/security';
import { User } from '@/types/auth';

export class PermissionsService {
  private static instance: PermissionsService;
  private userPermissions: Map<string, Permission[]> = new Map();
  private rolePermissions: Map<string, Permission[]> = new Map();

  private constructor() {}

  static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  // Check if user has specific permission
  hasPermission(
    user: User | null,
    resource: string,
    action: string
  ): boolean {
    if (!user) return false;

    // Check direct user permissions
    const userPerms = this.getUserPermissions(user.id);
    if (this.checkPermissions(userPerms, resource, action)) {
      return true;
    }

    // Check role-based permissions
    for (const role of user.roles) {
      const rolePerms = this.getRolePermissions(role.id);
      if (this.checkPermissions(rolePerms, resource, action)) {
        return true;
      }
    }

    return false;
  }

  // Check multiple permissions (all must be true)
  hasAllPermissions(
    user: User | null,
    permissions: Array<{ resource: string; action: string }>
  ): boolean {
    return permissions.every(p => this.hasPermission(user, p.resource, p.action));
  }

  // Check multiple permissions (any can be true)
  hasAnyPermission(
    user: User | null,
    permissions: Array<{ resource: string; action: string }>
  ): boolean {
    return permissions.some(p => this.hasPermission(user, p.resource, p.action));
  }

  // Check if user has specific role
  hasRole(user: User | null, roleName: string): boolean {
    if (!user) return false;
    return user.roles.some(role => role.name === roleName);
  }

  // Check if user has any of the specified roles
  hasAnyRole(user: AuthUser | null, roleNames: string[]): boolean {
    if (!user) return false;
    return user.roles.some((role: any) => roleNames.includes(role.name));
  }

  // Get all permissions for a user (including role-based)
  getAllUserPermissions(user: AuthUser): Permission[] {
    const allPermissions: Permission[] = [];
    
    // Add direct user permissions
    const userPerms = this.getUserPermissions(user.id);
    allPermissions.push(...userPerms);

    // Add role-based permissions
    for (const role of user.roles) {
      const rolePerms = this.getRolePermissions(role.id);
      allPermissions.push(...rolePerms);
    }

    // Remove duplicates
    return this.deduplicatePermissions(allPermissions);
  }

  // Create access control for a resource
  createAccessControl(
    user: AuthUser,
    resource: string
  ): AccessControl {
    const permissions = this.getAllUserPermissions(user);
    const resourcePerms = permissions.filter(p => p.resource === resource);

    return {
      resource,
      permissions: {
        read: resourcePerms.some(p => p.action === 'read'),
        write: resourcePerms.some(p => p.action === 'write'),
        delete: resourcePerms.some(p => p.action === 'delete'),
        execute: resourcePerms.some(p => p.action === 'execute'),
      },
    };
  }

  // Update user permissions cache
  updateUserPermissions(userId: string, permissions: Permission[]): void {
    this.userPermissions.set(userId, permissions);
  }

  // Update role permissions cache
  updateRolePermissions(roleId: string, permissions: Permission[]): void {
    this.rolePermissions.set(roleId, permissions);
  }

  // Clear permissions cache
  clearCache(): void {
    this.userPermissions.clear();
    this.rolePermissions.clear();
  }

  // Private helper methods
  private getUserPermissions(userId: string): Permission[] {
    return this.userPermissions.get(userId) || [];
  }

  private getRolePermissions(roleId: string): Permission[] {
    return this.rolePermissions.get(roleId) || [];
  }

  private checkPermissions(
    permissions: Permission[],
    resource: string,
    action: string
  ): boolean {
    return permissions.some(
      p => p.resource === resource && p.action === action
    );
  }

  private deduplicatePermissions(permissions: Permission[]): Permission[] {
    const uniqueMap = new Map<string, Permission>();
    
    permissions.forEach(perm => {
      const key = `${perm.resource}:${perm.action}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, perm);
      }
    });

    return Array.from(uniqueMap.values());
  }
}

// Permission constants for common resources
export const RESOURCES = {
  FARM: 'farm',
  AGENT: 'agent',
  YAML: 'yaml',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  USER: 'user',
  AUDIT: 'audit',
} as const;

export const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  EXECUTE: 'execute',
  MANAGE: 'manage',
} as const;

// Common permission combinations
export const PERMISSIONS = {
  FARM_READ: { resource: RESOURCES.FARM, action: ACTIONS.READ },
  FARM_WRITE: { resource: RESOURCES.FARM, action: ACTIONS.WRITE },
  FARM_DELETE: { resource: RESOURCES.FARM, action: ACTIONS.DELETE },
  FARM_EXECUTE: { resource: RESOURCES.FARM, action: ACTIONS.EXECUTE },
  AGENT_MANAGE: { resource: RESOURCES.AGENT, action: ACTIONS.MANAGE },
  ANALYTICS_READ: { resource: RESOURCES.ANALYTICS, action: ACTIONS.READ },
  SETTINGS_MANAGE: { resource: RESOURCES.SETTINGS, action: ACTIONS.MANAGE },
  USER_MANAGE: { resource: RESOURCES.USER, action: ACTIONS.MANAGE },
  AUDIT_READ: { resource: RESOURCES.AUDIT, action: ACTIONS.READ },
} as const;

export const permissionsService = PermissionsService.getInstance();