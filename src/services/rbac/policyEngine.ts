import {
  Policy,
  PolicyStatement,
  PolicyCondition,
  AccessRequest,
  AccessContext,
  Principal,
} from '../../types/rbac';

export class PolicyEngine {
  private policyCache = new Map<string, Policy>();
  private compiledPolicies = new Map<string, CompiledPolicy>();

  async evaluatePolicy(
    policy: Policy,
    request: AccessRequest,
    principals: Principal[]
  ): Promise<PolicyEvaluationResult> {
    if (!policy.isActive) {
      return {
        effect: 'none',
        matched: false,
        reason: 'Policy is inactive',
      };
    }

    const compiledPolicy = this.compilePolicy(policy);
    const results: StatementEvaluationResult[] = [];

    for (const statement of compiledPolicy.statements) {
      const result = await this.evaluateStatement(statement, request, principals);
      results.push(result);

      // Explicit deny short-circuits evaluation
      if (result.matched && result.effect === 'deny') {
        return {
          effect: 'deny',
          matched: true,
          reason: `Denied by statement ${statement.sid}`,
          evaluatedStatements: results,
        };
      }
    }

    // Check if any statement allowed
    const allowedStatement = results.find(r => r.matched && r.effect === 'allow');
    if (allowedStatement) {
      return {
        effect: 'allow',
        matched: true,
        reason: `Allowed by statement ${allowedStatement.statementId}`,
        evaluatedStatements: results,
      };
    }

    return {
      effect: 'none',
      matched: false,
      reason: 'No matching statements',
      evaluatedStatements: results,
    };
  }

  private compilePolicy(policy: Policy): CompiledPolicy {
    const cached = this.compiledPolicies.get(policy.id);
    if (cached && cached.version === policy.version) {
      return cached;
    }

    const compiled: CompiledPolicy = {
      id: policy.id,
      version: policy.version,
      statements: policy.statements.map(statement => this.compileStatement(statement)),
    };

    this.compiledPolicies.set(policy.id, compiled);
    return compiled;
  }

  private compileStatement(statement: PolicyStatement): CompiledStatement {
    return {
      sid: statement.sid,
      effect: statement.effect,
      principalMatcher: this.compilePrincipalMatcher(statement.principals),
      actionMatcher: this.compileActionMatcher(statement.actions),
      resourceMatcher: this.compileResourceMatcher(statement.resources),
      conditionEvaluator: statement.conditions 
        ? this.compileConditionEvaluator(statement.conditions)
        : null,
    };
  }

  private async evaluateStatement(
    statement: CompiledStatement,
    request: AccessRequest,
    principals: Principal[]
  ): Promise<StatementEvaluationResult> {
    // Check if principals match
    const principalMatch = statement.principalMatcher(principals);
    if (!principalMatch) {
      return {
        statementId: statement.sid,
        effect: statement.effect,
        matched: false,
        reason: 'Principal does not match',
      };
    }

    // Check if action matches
    const actionMatch = statement.actionMatcher(request.action);
    if (!actionMatch) {
      return {
        statementId: statement.sid,
        effect: statement.effect,
        matched: false,
        reason: 'Action does not match',
      };
    }

    // Check if resource matches
    const resourceMatch = statement.resourceMatcher(request.resource);
    if (!resourceMatch) {
      return {
        statementId: statement.sid,
        effect: statement.effect,
        matched: false,
        reason: 'Resource does not match',
      };
    }

    // Evaluate conditions
    if (statement.conditionEvaluator) {
      const conditionResult = await statement.conditionEvaluator(request.context);
      if (!conditionResult.met) {
        return {
          statementId: statement.sid,
          effect: statement.effect,
          matched: false,
          reason: `Condition not met: ${conditionResult.reason}`,
        };
      }
    }

    return {
      statementId: statement.sid,
      effect: statement.effect,
      matched: true,
      reason: 'All criteria matched',
    };
  }

  private compilePrincipalMatcher(principals: Principal[]): PrincipalMatcher {
    return (requestPrincipals: Principal[]) => {
      for (const principal of principals) {
        // Wildcard principal
        if (principal.id === '*') {
          return true;
        }

        // Check if any request principal matches
        const match = requestPrincipals.some(rp => 
          rp.type === principal.type && rp.id === principal.id
        );

        if (match) {
          return true;
        }
      }
      return false;
    };
  }

  private compileActionMatcher(actions: string[]): ActionMatcher {
    const patterns = actions.map(action => this.compilePattern(action));
    
    return (requestAction: string) => {
      return patterns.some(pattern => pattern.test(requestAction));
    };
  }

  private compileResourceMatcher(resources: string[]): ResourceMatcher {
    const matchers = resources.map(resource => this.compileResourcePattern(resource));
    
    return (requestResource: any) => {
      return matchers.some(matcher => matcher(requestResource));
    };
  }

  private compileResourcePattern(pattern: string): (resource: any) => boolean {
    const parts = pattern.split(':');
    const [service, resourceType, ...resourcePath] = parts;

    return (resource: any) => {
      // Match service
      if (service !== '*' && service !== 'maifarm') {
        return false;
      }

      // Match resource type
      if (resourceType !== '*' && resourceType !== resource.type) {
        return false;
      }

      // Match resource path/ID
      if (resourcePath.length > 0) {
        const pathPattern = resourcePath.join(':');
        if (pathPattern !== '*' && pathPattern !== resource.id) {
          // Support wildcard patterns like "farm-*"
          const regex = new RegExp('^' + pathPattern.replace(/\*/g, '.*') + '$');
          return regex.test(resource.id || '');
        }
      }

      return true;
    };
  }

  private compileConditionEvaluator(conditions: PolicyCondition[]): ConditionEvaluator {
    return async (context?: AccessContext) => {
      for (const condition of conditions) {
        const result = await this.evaluateCondition(condition, context);
        if (!result.met) {
          return result;
        }
      }
      return { met: true };
    };
  }

  private async evaluateCondition(
    condition: PolicyCondition,
    context?: AccessContext
  ): Promise<ConditionResult> {
    if (!context) {
      return { met: false, reason: 'No context provided' };
    }

    const contextValue = this.getContextValue(condition.key, context);
    
    switch (condition.operator) {
      case 'StringEquals':
        return {
          met: contextValue === condition.values[0],
          reason: `${condition.key} equality check`,
        };

      case 'StringNotEquals':
        return {
          met: contextValue !== condition.values[0],
          reason: `${condition.key} inequality check`,
        };

      case 'StringLike':
        const pattern = new RegExp(condition.values[0].replace(/\*/g, '.*'));
        return {
          met: pattern.test(String(contextValue)),
          reason: `${condition.key} pattern match`,
        };

      case 'IpAddress':
        return {
          met: condition.values.includes(contextValue),
          reason: 'IP address check',
        };

      case 'DateGreaterThan':
        const date = new Date(contextValue as string);
        const compareDate = new Date(condition.values[0]);
        return {
          met: date > compareDate,
          reason: 'Date comparison',
        };

      case 'Bool':
        return {
          met: Boolean(contextValue) === (condition.values[0] === 'true'),
          reason: 'Boolean check',
        };

      case 'NumericEquals':
        return {
          met: Number(contextValue) === Number(condition.values[0]),
          reason: 'Numeric equality check',
        };

      case 'NumericLessThan':
        return {
          met: Number(contextValue) < Number(condition.values[0]),
          reason: 'Numeric comparison',
        };

      case 'NumericGreaterThan':
        return {
          met: Number(contextValue) > Number(condition.values[0]),
          reason: 'Numeric comparison',
        };

      case 'ForAllValues:StringEquals':
        if (!Array.isArray(contextValue)) {
          return { met: false, reason: 'Expected array value' };
        }
        return {
          met: (contextValue as any[]).every(v => condition.values.includes(v)),
          reason: 'All values check',
        };

      case 'ForAnyValue:StringEquals':
        if (!Array.isArray(contextValue)) {
          return { met: false, reason: 'Expected array value' };
        }
        return {
          met: (contextValue as any[]).some(v => condition.values.includes(v)),
          reason: 'Any value check',
        };

      default:
        return { met: false, reason: `Unknown operator: ${condition.operator}` };
    }
  }

  private getContextValue(key: string, context: AccessContext): any {
    const parts = key.split(':');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part as keyof typeof value];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private compilePattern(pattern: string): RegExp {
    // Convert wildcard pattern to regex
    const regexPattern = '^' + pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') + '$';
    return new RegExp(regexPattern);
  }

  async validatePolicy(policy: Policy): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check policy structure
    if (!policy.name || policy.name.trim() === '') {
      errors.push('Policy name is required');
    }

    if (!policy.version || !this.isValidVersion(policy.version)) {
      errors.push('Invalid policy version format');
    }

    if (!policy.statements || policy.statements.length === 0) {
      errors.push('Policy must contain at least one statement');
    }

    // Validate each statement
    policy.statements.forEach((statement, index) => {
      const stmtErrors = this.validateStatement(statement);
      errors.push(...stmtErrors.map(e => `Statement ${index}: ${e}`));
    });

    // Check for conflicting statements
    const conflicts = this.findConflictingStatements(policy.statements);
    if (conflicts.length > 0) {
      warnings.push(...conflicts);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateStatement(statement: PolicyStatement): string[] {
    const errors: string[] = [];

    if (!statement.sid || statement.sid.trim() === '') {
      errors.push('Statement ID (sid) is required');
    }

    if (!['allow', 'deny'].includes(statement.effect)) {
      errors.push('Effect must be either "allow" or "deny"');
    }

    if (!statement.principals || statement.principals.length === 0) {
      errors.push('At least one principal is required');
    }

    if (!statement.actions || statement.actions.length === 0) {
      errors.push('At least one action is required');
    }

    if (!statement.resources || statement.resources.length === 0) {
      errors.push('At least one resource is required');
    }

    return errors;
  }

  private findConflictingStatements(statements: PolicyStatement[]): string[] {
    const warnings: string[] = [];

    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        const stmt1 = statements[i];
        const stmt2 = statements[j];

        if (stmt1.effect !== stmt2.effect &&
            this.hasOverlappingScope(stmt1, stmt2)) {
          warnings.push(
            `Statements ${stmt1.sid} and ${stmt2.sid} have conflicting effects on overlapping resources`
          );
        }
      }
    }

    return warnings;
  }

  private hasOverlappingScope(stmt1: PolicyStatement, stmt2: PolicyStatement): boolean {
    // Simple overlap detection - could be enhanced
    const actionOverlap = stmt1.actions.some(a1 => 
      stmt2.actions.some(a2 => a1 === a2 || a1 === '*' || a2 === '*')
    );

    const resourceOverlap = stmt1.resources.some(r1 => 
      stmt2.resources.some(r2 => r1 === r2 || r1.includes('*') || r2.includes('*'))
    );

    return actionOverlap && resourceOverlap;
  }

  private isValidVersion(version: string): boolean {
    // Validate version format (e.g., "2024-01-01" or "1.0.0")
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const semverPattern = /^\d+\.\d+\.\d+$/;
    return datePattern.test(version) || semverPattern.test(version);
  }
}

// Type definitions for compiled policies
interface CompiledPolicy {
  id: string;
  version: string;
  statements: CompiledStatement[];
}

interface CompiledStatement {
  sid: string;
  effect: 'allow' | 'deny';
  principalMatcher: PrincipalMatcher;
  actionMatcher: ActionMatcher;
  resourceMatcher: ResourceMatcher;
  conditionEvaluator: ConditionEvaluator | null;
}

type PrincipalMatcher = (principals: Principal[]) => boolean;
type ActionMatcher = (action: string) => boolean;
type ResourceMatcher = (resource: any) => boolean;
type ConditionEvaluator = (context?: AccessContext) => Promise<ConditionResult>;

interface PolicyEvaluationResult {
  effect: 'allow' | 'deny' | 'none';
  matched: boolean;
  reason: string;
  evaluatedStatements?: StatementEvaluationResult[];
}

interface StatementEvaluationResult {
  statementId: string;
  effect: 'allow' | 'deny';
  matched: boolean;
  reason: string;
}

interface ConditionResult {
  met: boolean;
  reason?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const policyEngine = new PolicyEngine();