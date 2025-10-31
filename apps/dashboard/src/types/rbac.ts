export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  parentRoles?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  isSystem: boolean;
}

export interface Permission {
  id: string;
  resource: Resource;
  actions: Action[];
  conditions?: Condition[];
  effect: 'allow' | 'deny';
  priority?: number;
}

export interface Resource {
  type: ResourceType;
  id?: string;
  attributes?: Record<string, any>;
}

export type ResourceType = 
  | 'agent'
  | 'farm'
  | 'workflow'
  | 'configuration'
  | 'analytics'
  | 'system'
  | 'user'
  | 'audit'
  | 'api';

export interface Action {
  name: ActionName;
  scope?: ActionScope;
}

export type ActionName = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'manage'
  | 'approve'
  | 'export'
  | 'import';

export type ActionScope = 'own' | 'team' | 'all';

export interface Condition {
  type: ConditionType;
  operator: ConditionOperator;
  value: any;
  field?: string;
}

export type ConditionType = 
  | 'time'
  | 'ip'
  | 'attribute'
  | 'context'
  | 'ownership'
  | 'delegation';

export type ConditionOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'matches'
  | 'between';

export interface Policy {
  id: string;
  name: string;
  description: string;
  statements: PolicyStatement[];
  version: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyStatement {
  sid: string;
  effect: 'allow' | 'deny';
  principals: Principal[];
  actions: string[];
  resources: string[];
  conditions?: PolicyCondition[];
}

export interface Principal {
  type: 'user' | 'role' | 'group' | 'service';
  id: string;
}

export interface PolicyCondition {
  key: string;
  operator: string;
  values: any[];
}

export interface AccessRequest {
  userId: string;
  resource: Resource;
  action: ActionName;
  context?: AccessContext;
}

export interface AccessContext {
  ipAddress?: string;
  timestamp?: Date;
  sessionId?: string;
  deviceId?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  attributes?: Record<string, any>;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  appliedPolicies?: string[];
  matchedPermissions?: Permission[];
  deniedPermissions?: Permission[];
  conditions?: EvaluatedCondition[];
}

export interface EvaluatedCondition {
  condition: Condition;
  result: boolean;
  reason?: string;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  scope?: ResourceScope;
  validFrom?: Date;
  validUntil?: Date;
  assignedBy: string;
  assignedAt: Date;
  metadata?: Record<string, any>;
}

export interface ResourceScope {
  type: ResourceType;
  ids?: string[];
  attributes?: Record<string, any>;
}

export interface Delegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  permissions: Permission[];
  validFrom: Date;
  validUntil: Date;
  reason: string;
  approvedBy?: string;
  approvedAt?: Date;
  isActive: boolean;
}

export interface RBACConfig {
  enableHierarchy: boolean;
  enableDelegation: boolean;
  enableTimeBasedAccess: boolean;
  enableAttributeBasedAccess: boolean;
  defaultDenyAll: boolean;
  maxRoleDepth: number;
  sessionTimeout: number;
  cacheTimeout: number;
}

export interface PermissionMatrix {
  roles: Role[];
  resources: Resource[];
  matrix: PermissionCell[][];
}

export interface PermissionCell {
  roleId: string;
  resourceId: string;
  actions: ActionName[];
  inherited: boolean;
  source?: string;
}