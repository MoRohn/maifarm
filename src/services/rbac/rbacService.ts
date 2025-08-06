import {
  Role,
  Permission,
  Policy,
  AccessRequest,
  AccessDecision,
  RoleAssignment,
  Delegation,
  RBACConfig,
  Resource,
  ActionName,
  Condition,
  AccessContext,
} from '../../types/rbac';

// Define missing types locally
interface Action {
  name: ActionName | 'manage';
}

interface EvaluatedCondition {
  condition: Condition;
  result: boolean;
}

interface PolicyCondition extends Condition {}

interface PolicyStatement {
  effect: 'allow' | 'deny';
  actions: string[];
  resources: string[];
  conditions?: PolicyCondition[];
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class RBACService {
  private config: RBACConfig = {
    enableHierarchy: true,
    enableDelegation: true,
    enableTimeBasedAccess: true,
    enableAttributeBasedAccess: true,
    defaultDenyAll: true,
    maxRoleDepth: 5,
    sessionTimeout: 3600000, // 1 hour
    cacheTimeout: 300000, // 5 minutes
  };

  private roleCache = new Map<string, { role: Role; fetchedAt: number }>();
  private policyCache = new Map<string, { policy: Policy; fetchedAt: number }>();

  async checkAccess(request: AccessRequest): Promise<AccessDecision> {
    try {
      // Get user's roles and permissions
      const userRoles = await this.getUserRoles(request.userId);
      const delegatedPermissions = await this.getDelegatedPermissions(request.userId);
      
      // Collect all permissions
      const allPermissions: Permission[] = [];
      
      // Add permissions from roles
      for (const role of userRoles) {
        allPermissions.push(...role.permissions);
        
        // Add inherited permissions if hierarchy is enabled
        if (this.config.enableHierarchy && role.parentRoles) {
          const inheritedPermissions = await this.getInheritedPermissions(role.parentRoles);
          allPermissions.push(...inheritedPermissions);
        }
      }
      
      // Add delegated permissions
      if (this.config.enableDelegation) {
        allPermissions.push(...delegatedPermissions);
      }

      // Evaluate permissions
      const decision = await this.evaluatePermissions(
        allPermissions,
        request.resource,
        request.action,
        request.context
      );

      // Apply policies
      const policies = await this.getApplicablePolicies(request.userId, request.resource);
      const policyDecision = await this.evaluatePolicies(policies, request);

      // Combine decisions (policies can override permissions)
      return this.combineDecisions(decision, policyDecision);
    } catch (error) {
      console.error('Access check failed:', error);
      return {
        allowed: false,
        reason: 'Access check failed due to system error',
      };
    }
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/roles`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user roles');
    }

    const assignments: RoleAssignment[] = await response.json();
    const roles: Role[] = [];

    for (const assignment of assignments) {
      const role = await this.getRole(assignment.roleId);
      if (role && this.isAssignmentValid(assignment)) {
        roles.push(role);
      }
    }

    return roles;
  }

  async getRole(roleId: string): Promise<Role | null> {
    // Check cache
    const cached = this.roleCache.get(roleId);
    if (cached && Date.now() - cached.fetchedAt < this.config.cacheTimeout) {
      return cached.role;
    }

    const response = await fetch(`${API_BASE}/rbac/roles/${roleId}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const role: Role = await response.json();
    
    // Cache the role
    this.roleCache.set(roleId, { role, fetchedAt: Date.now() });
    
    return role;
  }

  async createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<Role> {
    const response = await fetch(`${API_BASE}/rbac/roles`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(role),
    });

    if (!response.ok) {
      throw new Error('Failed to create role');
    }

    return response.json();
  }

  async updateRole(roleId: string, updates: Partial<Role>): Promise<Role> {
    const response = await fetch(`${API_BASE}/rbac/roles/${roleId}`, {
      method: 'PATCH',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error('Failed to update role');
    }

    const updatedRole = await response.json();
    
    // Invalidate cache
    this.roleCache.delete(roleId);
    
    return updatedRole;
  }

  async assignRole(userId: string, roleId: string, assignment?: Partial<RoleAssignment>): Promise<RoleAssignment> {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/roles`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId,
        ...assignment,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to assign role');
    }

    return response.json();
  }

  async revokeRole(userId: string, roleId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/rbac/users/${userId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to revoke role');
    }
  }

  async createDelegation(delegation: Omit<Delegation, 'id' | 'approvedAt' | 'isActive'>): Promise<Delegation> {
    const response = await fetch(`${API_BASE}/rbac/delegations`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(delegation),
    });

    if (!response.ok) {
      throw new Error('Failed to create delegation');
    }

    return response.json();
  }

  async approveDelegation(delegationId: string, approverId: string): Promise<Delegation> {
    const response = await fetch(`${API_BASE}/rbac/delegations/${delegationId}/approve`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approverId }),
    });

    if (!response.ok) {
      throw new Error('Failed to approve delegation');
    }

    return response.json();
  }

  private async getDelegatedPermissions(userId: string): Promise<Permission[]> {
    if (!this.config.enableDelegation) {
      return [];
    }

    const response = await fetch(`${API_BASE}/rbac/users/${userId}/delegations`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const delegations: Delegation[] = await response.json();
    const permissions: Permission[] = [];

    for (const delegation of delegations) {
      if (this.isDelegationValid(delegation)) {
        permissions.push(...delegation.permissions);
      }
    }

    return permissions;
  }

  private async getInheritedPermissions(parentRoleIds: string[]): Promise<Permission[]> {
    const permissions: Permission[] = [];
    const visited = new Set<string>();

    const collectPermissions = async (roleIds: string[], depth: number = 0) => {
      if (depth > this.config.maxRoleDepth) {
        return;
      }

      for (const roleId of roleIds) {
        if (visited.has(roleId)) {
          continue;
        }
        
        visited.add(roleId);
        const role = await this.getRole(roleId);
        
        if (role) {
          permissions.push(...role.permissions);
          
          if (role.parentRoles) {
            await collectPermissions(role.parentRoles, depth + 1);
          }
        }
      }
    };

    await collectPermissions(parentRoleIds);
    return permissions;
  }

  private async evaluatePermissions(
    permissions: Permission[],
    resource: Resource,
    action: ActionName,
    context?: AccessContext
  ): Promise<AccessDecision> {
    const matchedPermissions: Permission[] = [];
    const deniedPermissions: Permission[] = [];

    // Sort permissions by priority (higher priority first)
    const sortedPermissions = [...permissions].sort((a, b) => 
      (b.priority || 0) - (a.priority || 0)
    );

    for (const permission of sortedPermissions) {
      if (this.matchesResource(permission.resource, resource) &&
          this.matchesAction(permission.actions, action)) {
        
        // Evaluate conditions
        const conditionResults = await this.evaluateConditions(
          permission.conditions || [],
          context
        );

        const allConditionsMet = conditionResults.every(r => r.result);

        if (allConditionsMet) {
          if (permission.effect === 'allow') {
            matchedPermissions.push(permission);
          } else {
            deniedPermissions.push(permission);
          }
        }
      }
    }

    // Deny takes precedence over allow
    if (deniedPermissions.length > 0) {
      return {
        allowed: false,
        reason: 'Explicitly denied by permission',
        deniedPermissions,
      };
    }

    if (matchedPermissions.length > 0) {
      return {
        allowed: true,
        matchedPermissions,
      };
    }

    return {
      allowed: !this.config.defaultDenyAll,
      reason: this.config.defaultDenyAll ? 'No matching permissions found' : 'Default allow',
    };
  }

  private async getApplicablePolicies(userId: string, resource: Resource): Promise<Policy[]> {
    const response = await fetch(`${API_BASE}/rbac/policies?userId=${userId}&resourceType=${resource.type}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  }

  private async evaluatePolicies(policies: Policy[], request: AccessRequest): Promise<AccessDecision> {
    const appliedPolicies: string[] = [];
    let finalEffect: 'allow' | 'deny' | null = null;

    for (const policy of policies) {
      if (!policy.isActive) continue;

      for (const statement of policy.statements) {
        if (this.statementApplies(statement, request)) {
          appliedPolicies.push(`${policy.id}:${statement.sid}`);
          
          // Evaluate conditions
          const conditionsMet = await this.evaluatePolicyConditions(
            statement.conditions || [],
            request.context
          );

          if (conditionsMet) {
            finalEffect = statement.effect;
            // Deny takes precedence, so stop if we find a deny
            if (finalEffect === 'deny') {
              break;
            }
          }
        }
      }

      if (finalEffect === 'deny') {
        break;
      }
    }

    return {
      allowed: finalEffect === 'allow',
      reason: finalEffect ? `Policy ${finalEffect}` : 'No applicable policies',
      appliedPolicies,
    };
  }

  private combineDecisions(
    permissionDecision: AccessDecision,
    policyDecision: AccessDecision
  ): AccessDecision {
    // Explicit deny from either source results in deny
    if (!permissionDecision.allowed || !policyDecision.allowed) {
      return {
        allowed: false,
        reason: !permissionDecision.allowed 
          ? permissionDecision.reason 
          : policyDecision.reason,
        matchedPermissions: permissionDecision.matchedPermissions,
        deniedPermissions: permissionDecision.deniedPermissions,
        appliedPolicies: policyDecision.appliedPolicies,
      };
    }

    // Both allow
    return {
      allowed: true,
      matchedPermissions: permissionDecision.matchedPermissions,
      appliedPolicies: policyDecision.appliedPolicies,
    };
  }

  private matchesResource(permissionResource: Resource, requestResource: Resource): boolean {
    if (permissionResource.type !== requestResource.type) {
      return false;
    }

    if (permissionResource.id && requestResource.id) {
      return permissionResource.id === requestResource.id || 
             permissionResource.id === '*';
    }

    return true;
  }

  private matchesAction(permissionActions: Action[], requestAction: ActionName): boolean {
    return permissionActions.some(action => 
      action.name === requestAction || action.name === 'manage'
    );
  }

  private async evaluateConditions(
    conditions: Condition[],
    context?: AccessContext
  ): Promise<EvaluatedCondition[]> {
    const results: EvaluatedCondition[] = [];

    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      results.push({ condition, ...result });
    }

    return results;
  }

  private async evaluateCondition(
    condition: Condition,
    context?: AccessContext
  ): Promise<{ result: boolean; reason?: string }> {
    switch (condition.type) {
      case 'time':
        return this.evaluateTimeCondition(condition);
      
      case 'ip':
        return this.evaluateIpCondition(condition, context?.ipAddress);
      
      case 'attribute':
        return this.evaluateAttributeCondition(condition, context?.attributes);
      
      case 'context':
        return this.evaluateContextCondition(condition, context);
      
      default:
        return { result: false, reason: 'Unknown condition type' };
    }
  }

  private evaluateTimeCondition(condition: Condition): { result: boolean; reason?: string } {
    const now = new Date();
    
    switch (condition.operator) {
      case 'between':
        const [start, end] = condition.value;
        const startTime = new Date(start);
        const endTime = new Date(end);
        return {
          result: now >= startTime && now <= endTime,
          reason: 'Time condition evaluated',
        };
      
      default:
        return { result: false, reason: 'Unsupported time operator' };
    }
  }

  private evaluateIpCondition(
    condition: Condition,
    ipAddress?: string
  ): { result: boolean; reason?: string } {
    if (!ipAddress) {
      return { result: false, reason: 'No IP address in context' };
    }

    switch (condition.operator) {
      case 'in':
        return {
          result: condition.value.includes(ipAddress),
          reason: 'IP address check',
        };
      
      case 'matches':
        const regex = new RegExp(condition.value);
        return {
          result: regex.test(ipAddress),
          reason: 'IP pattern match',
        };
      
      default:
        return { result: false, reason: 'Unsupported IP operator' };
    }
  }

  private evaluateAttributeCondition(
    condition: Condition,
    attributes?: Record<string, any>
  ): { result: boolean; reason?: string } {
    if (!attributes || !condition.field) {
      return { result: false, reason: 'Missing attributes or field' };
    }

    const fieldValue = attributes[condition.field];

    switch (condition.operator) {
      case 'equals':
        return {
          result: fieldValue === condition.value,
          reason: 'Attribute equality check',
        };
      
      case 'contains':
        return {
          result: Array.isArray(fieldValue) && fieldValue.includes(condition.value),
          reason: 'Attribute contains check',
        };
      
      default:
        return { result: false, reason: 'Unsupported attribute operator' };
    }
  }

  private evaluateContextCondition(
    condition: Condition,
    context?: AccessContext
  ): { result: boolean; reason?: string } {
    if (!context) {
      return { result: false, reason: 'No context provided' };
    }

    // Custom context evaluation logic
    return { result: true, reason: 'Context condition evaluated' };
  }

  private async evaluatePolicyConditions(
    conditions: PolicyCondition[],
    context?: AccessContext
  ): Promise<boolean> {
    // Policy condition evaluation logic
    return true;
  }

  private statementApplies(statement: PolicyStatement, request: AccessRequest): boolean {
    // Check if the statement applies to this request
    const actionMatches = statement.actions.some((action: string) => 
      action === request.action || action === '*'
    );

    const resourceMatches = statement.resources.some((resource: string) => {
      const [resourceType, resourceId] = resource.split(':');
      return resourceType === request.resource.type && 
             (resourceId === '*' || resourceId === request.resource.id);
    });

    return actionMatches && resourceMatches;
  }

  private isAssignmentValid(assignment: RoleAssignment): boolean {
    const now = new Date();
    
    if (assignment.validFrom && now < assignment.validFrom) {
      return false;
    }
    
    if (assignment.validUntil && now > assignment.validUntil) {
      return false;
    }
    
    return true;
  }

  private isDelegationValid(delegation: Delegation): boolean {
    if (!delegation.isActive) {
      return false;
    }

    const now = new Date();
    return now >= delegation.validFrom && now <= delegation.validUntil;
  }

  private getAuthHeaders(): HeadersInit {
    const { authService } = require('../authService');
    const tokens = authService.getStoredTokens();
    
    return {
      'Authorization': tokens ? `Bearer ${tokens.accessToken}` : '',
    };
  }

  updateConfig(config: Partial<RBACConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RBACConfig {
    return { ...this.config };
  }
}

export const rbacService = new RBACService();