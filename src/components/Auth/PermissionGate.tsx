import React from 'react';
import { Navigate } from 'react-router-dom';
import { Shield, Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

interface PermissionGateProps {
  children: React.ReactNode;
  resource?: string;
  action?: string;
  role?: string;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showError?: boolean;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  resource,
  action,
  role,
  fallback,
  redirectTo,
  showError = true,
}) => {
  const { isAuthenticated, user } = useAuth();
  const { hasPermission, hasRole } = usePermissions();

  // Check if user is authenticated
  if (!isAuthenticated || !user) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    return null;
  }

  // Check permissions
  let hasAccess = true;

  if (resource && action) {
    hasAccess = hasPermission(resource, action);
  }

  if (role && hasAccess) {
    hasAccess = hasRole(role);
  }

  // If access is granted, render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // If fallback is provided, render it
  if (fallback) {
    return <>{fallback}</>;
  }

  // If redirectTo is provided, redirect
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // Default unauthorized view
  if (showError) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
            <Lock className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            You don't have permission to access this resource.
            {resource && action && (
              <span className="block mt-2 text-sm">
                Required: {resource}:{action}
              </span>
            )}
            {role && (
              <span className="block mt-2 text-sm">
                Required role: {role}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }

  return null;
};

// Higher-order component for route protection
export const withPermission = <P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<PermissionGateProps, 'children'>
) => {
  return (props: P) => (
    <PermissionGate {...options}>
      <Component {...props} />
    </PermissionGate>
  );
};

// Permission badge component
export const PermissionBadge: React.FC<{
  resource: string;
  action: string;
  className?: string;
}> = ({ resource, action, className = '' }) => {
  const { hasPermission } = usePermissions();
  const hasAccess = hasPermission(resource, action);

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        hasAccess
          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
      } ${className}`}
    >
      <Shield className="w-3 h-3" />
      <span>{resource}:{action}</span>
    </div>
  );
};