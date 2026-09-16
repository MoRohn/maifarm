export interface CompliancePolicy {
  id: string;
  type: ComplianceType;
  name: string;
  description: string;
  requirements: ComplianceRequirement[];
  controls: ComplianceControl[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: string;
}

export type ComplianceType = 'GDPR' | 'CCPA' | 'SOC2' | 'HIPAA' | 'PCI-DSS' | 'ISO27001';

export interface ComplianceRequirement {
  id: string;
  category: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: ComplianceStatus;
  evidence?: string[];
  dueDate?: Date;
  owner?: string;
}

export type ComplianceStatus = 'compliant' | 'non-compliant' | 'partial' | 'pending' | 'not-applicable';

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  type: ControlType;
  automated: boolean;
  frequency?: ControlFrequency;
  lastExecuted?: Date;
  nextExecution?: Date;
  status: ControlStatus;
}

export type ControlType = 'preventive' | 'detective' | 'corrective' | 'compensating';
export type ControlFrequency = 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type ControlStatus = 'active' | 'inactive' | 'failed' | 'pending';

export interface DataSubjectRequest {
  id: string;
  type: DSRType;
  subjectId: string;
  subjectEmail: string;
  requestDate: Date;
  dueDate: Date;
  status: DSRStatus;
  details: string;
  processedBy?: string;
  processedAt?: Date;
  response?: DSRResponse;
}

export type DSRType = 
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'portability'
  | 'restriction'
  | 'objection'
  | 'opt-out';

export type DSRStatus = 'pending' | 'in-progress' | 'completed' | 'rejected' | 'expired';

export interface DSRResponse {
  type: 'fulfilled' | 'partial' | 'rejected';
  message: string;
  data?: any;
  reason?: string;
  attachments?: string[];
}

export interface ConsentRecord {
  id: string;
  userId: string;
  purpose: string;
  description: string;
  scope: ConsentScope;
  status: 'granted' | 'withdrawn' | 'expired';
  grantedAt: Date;
  expiresAt?: Date;
  withdrawnAt?: Date;
  version: string;
  ipAddress: string;
  userAgent: string;
  preferences?: ConsentPreferences;
}

export interface ConsentScope {
  dataTypes: string[];
  processingActivities: string[];
  thirdParties?: string[];
  retentionPeriod?: number;
}

export interface ConsentPreferences {
  marketing: boolean;
  analytics: boolean;
  personalizedContent: boolean;
  dataSharingWithPartners: boolean;
  productUpdates: boolean;
}

export interface DataRetentionPolicy {
  id: string;
  dataCategory: string;
  description: string;
  retentionPeriod: number; // days
  deletionMethod: 'soft' | 'hard' | 'anonymize';
  legalBasis: string;
  exceptions?: RetentionException[];
  isActive: boolean;
}

export interface RetentionException {
  condition: string;
  extendedPeriod?: number;
  reason: string;
}

export interface PrivacyImpactAssessment {
  id: string;
  projectName: string;
  description: string;
  dataTypes: string[];
  purposes: string[];
  risks: PrivacyRisk[];
  mitigations: RiskMitigation[];
  status: 'draft' | 'in-review' | 'approved' | 'rejected';
  assessedBy: string;
  assessedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface PrivacyRisk {
  id: string;
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  category: string;
  currentScore: number;
  targetScore: number;
}

export type RiskLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface RiskMitigation {
  riskId: string;
  description: string;
  effectiveness: RiskLevel;
  implementationStatus: 'planned' | 'in-progress' | 'completed';
  owner: string;
  dueDate: Date;
}

export interface AuditTrail {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  result: 'success' | 'failure';
  complianceFlags?: string[];
}

export interface ComplianceReport {
  id: string;
  type: ComplianceType;
  period: {
    start: Date;
    end: Date;
  };
  status: ComplianceStatus;
  score: number;
  findings: ComplianceFinding[];
  recommendations: string[];
  generatedAt: Date;
  generatedBy: string;
}

export interface ComplianceFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  affectedResources: string[];
  remediation: string;
  deadline?: Date;
  status: 'open' | 'in-progress' | 'resolved' | 'accepted';
}

export interface DataClassification {
  id: string;
  name: string;
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  description: string;
  handlingRequirements: string[];
  encryptionRequired: boolean;
  accessControls: string[];
  retentionPolicy?: string;
}

export interface ComplianceMetrics {
  overallScore: number;
  byType: Record<ComplianceType, number>;
  openFindings: number;
  criticalFindings: number;
  upcomingDeadlines: number;
  pendingDSRs: number;
  activePolicies: number;
  lastAssessment: Date;
}