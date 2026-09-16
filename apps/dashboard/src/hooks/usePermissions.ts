import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { permissionsService, RESOURCES, ACTIONS } from '@/services/permissions';

export const usePermissions = () => {
  const { user, checkPermission, hasRole } = useAuth();

  const hasPermission = useCallback(
    (resource: string, action: string): boolean => {
      return checkPermission(resource, action);
    },
    [checkPermission]
  );

  const hasAllPermissions = useCallback(
    (permissions: Array<{ resource: string; action: string }>): boolean => {
      return permissionsService.hasAllPermissions(user, permissions);
    },
    [user]
  );

  const hasAnyPermission = useCallback(
    (permissions: Array<{ resource: string; action: string }>): boolean => {
      return permissionsService.hasAnyPermission(user, permissions);
    },
    [user]
  );

  const hasAnyRole = useCallback(
    (roleNames: string[]): boolean => {
      return permissionsService.hasAnyRole(user, roleNames);
    },
    [user]
  );

  const canManageFarms = useCallback(
    (): boolean => {
      return hasPermission(RESOURCES.FARM, ACTIONS.MANAGE);
    },
    [hasPermission]
  );

  const canViewAnalytics = useCallback(
    (): boolean => {
      return hasPermission(RESOURCES.ANALYTICS, ACTIONS.READ);
    },
    [hasPermission]
  );

  const canManageUsers = useCallback(
    (): boolean => {
      return hasPermission(RESOURCES.USER, ACTIONS.MANAGE);
    },
    [hasPermission]
  );

  const canViewAuditLogs = useCallback(
    (): boolean => {
      return hasPermission(RESOURCES.AUDIT, ACTIONS.READ);
    },
    [hasPermission]
  );

  const isAdmin = useCallback(
    (): boolean => {
      return hasRole('admin');
    },
    [hasRole]
  );

  return {
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
    canManageFarms,
    canViewAnalytics,
    canManageUsers,
    canViewAuditLogs,
    isAdmin,
    // Export constants for convenience
    RESOURCES,
    ACTIONS,
  };
};