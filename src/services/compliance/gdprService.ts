import {
  DataSubjectRequest,
  DSRType,
  DSRStatus,
  DSRResponse,
  ConsentRecord,
  DataRetentionPolicy,
  PrivacyImpactAssessment,
  ComplianceStatus,
} from '../../types/compliance';
import { User } from '../../types/auth';
import { encryptionService } from '../encryptionService';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class GDPRService {
  // Article 15 - Right of access
  async handleAccessRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    try {
      const userData = await this.collectUserData(request.subjectId);
      const anonymizedData = await this.anonymizeSensitiveData(userData);
      
      return {
        type: 'fulfilled',
        message: 'Your data access request has been fulfilled.',
        data: anonymizedData,
        attachments: await this.generateDataReport(request.subjectId),
      };
    } catch (error) {
      return {
        type: 'rejected',
        message: 'Unable to process access request',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Article 16 - Right to rectification
  async handleRectificationRequest(
    request: DataSubjectRequest,
    corrections: Record<string, any>
  ): Promise<DSRResponse> {
    try {
      await this.validateCorrections(corrections);
      const updated = await this.updateUserData(request.subjectId, corrections);
      
      await this.logDataChange(request.subjectId, 'rectification', corrections);
      
      return {
        type: 'fulfilled',
        message: 'Your data has been corrected as requested.',
        data: updated,
      };
    } catch (error) {
      return {
        type: 'rejected',
        message: 'Unable to process rectification request',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Article 17 - Right to erasure (Right to be forgotten)
  async handleErasureRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    try {
      // Check if erasure is legally allowed
      const canErase = await this.checkErasureEligibility(request.subjectId);
      
      if (!canErase.eligible) {
        return {
          type: 'rejected',
          message: 'Unable to fulfill erasure request',
          reason: canErase.reason,
        };
      }

      // Perform erasure
      await this.eraseUserData(request.subjectId);
      
      // Notify third parties
      await this.notifyThirdPartiesOfErasure(request.subjectId);
      
      return {
        type: 'fulfilled',
        message: 'Your data has been erased from our systems.',
      };
    } catch (error) {
      return {
        type: 'rejected',
        message: 'Unable to process erasure request',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Article 20 - Right to data portability
  async handlePortabilityRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    try {
      const portableData = await this.collectPortableData(request.subjectId);
      const formats = ['json', 'csv', 'xml'];
      const files: string[] = [];
      
      for (const format of formats) {
        const file = await this.exportDataInFormat(portableData, format);
        files.push(file);
      }
      
      return {
        type: 'fulfilled',
        message: 'Your data has been prepared for portability.',
        data: portableData,
        attachments: files,
      };
    } catch (error) {
      return {
        type: 'rejected',
        message: 'Unable to process portability request',
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Article 7 - Consent management
  async recordConsent(
    userId: string,
    purpose: string,
    scope: any,
    preferences?: any
  ): Promise<ConsentRecord> {
    const consent: ConsentRecord = {
      id: crypto.randomUUID(),
      userId,
      purpose,
      description: this.generateConsentDescription(purpose, scope),
      scope,
      status: 'granted',
      grantedAt: new Date(),
      version: '1.0',
      ipAddress: await this.getUserIpAddress(userId),
      userAgent: await this.getUserAgent(userId),
      preferences,
    };

    await this.storeConsentRecord(consent);
    return consent;
  }

  async withdrawConsent(
    userId: string,
    consentId: string
  ): Promise<void> {
    const consent = await this.getConsentRecord(consentId);
    
    if (consent.userId !== userId) {
      throw new Error('Unauthorized consent withdrawal');
    }

    consent.status = 'withdrawn';
    consent.withdrawnAt = new Date();
    
    await this.updateConsentRecord(consent);
    await this.processConsentWithdrawal(consent);
  }

  // Data retention
  async applyRetentionPolicies(): Promise<void> {
    const policies = await this.getActiveRetentionPolicies();
    
    for (const policy of policies) {
      await this.processRetentionPolicy(policy);
    }
  }

  private async processRetentionPolicy(policy: DataRetentionPolicy): Promise<void> {
    const expiredData = await this.findExpiredData(policy);
    
    for (const data of expiredData) {
      switch (policy.deletionMethod) {
        case 'hard':
          await this.hardDeleteData(data);
          break;
        case 'soft':
          await this.softDeleteData(data);
          break;
        case 'anonymize':
          await this.anonymizeData(data);
          break;
      }
    }
  }

  // Privacy by design
  async createPrivacyImpactAssessment(
    projectName: string,
    dataTypes: string[],
    purposes: string[]
  ): Promise<PrivacyImpactAssessment> {
    const assessment: PrivacyImpactAssessment = {
      id: crypto.randomUUID(),
      projectName,
      description: '',
      dataTypes,
      purposes,
      risks: await this.identifyPrivacyRisks(dataTypes, purposes),
      mitigations: [],
      status: 'draft',
      assessedBy: 'system',
      assessedAt: new Date(),
    };

    await this.savePIA(assessment);
    return assessment;
  }

  // Data breach notification
  async handleDataBreach(breach: {
    discoveredAt: Date;
    affectedUsers: string[];
    dataTypes: string[];
    severity: 'low' | 'medium' | 'high';
  }): Promise<void> {
    // Log the breach
    await this.logDataBreach(breach);

    // Assess notification requirements
    const requiresNotification = breach.severity !== 'low' || 
                               breach.dataTypes.some(type => this.isSensitiveData(type));

    if (requiresNotification) {
      // Notify supervisory authority within 72 hours
      await this.notifySupervisoryAuthority(breach);

      // Notify affected individuals if high risk
      if (breach.severity === 'high') {
        await this.notifyAffectedUsers(breach);
      }
    }
  }

  // Helper methods
  private async collectUserData(userId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/gdpr/users/${userId}/data`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to collect user data');
    }

    return response.json();
  }

  private async anonymizeSensitiveData(data: any): Promise<any> {
    // Implementation would anonymize PII
    return {
      ...data,
      email: this.hashEmail(data.email),
      phone: data.phone ? this.maskPhone(data.phone) : null,
      ipAddresses: data.ipAddresses?.map((ip: string) => this.anonymizeIp(ip)),
    };
  }

  private async generateDataReport(userId: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/gdpr/users/${userId}/report`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to generate data report');
    }

    const { reportUrls } = await response.json();
    return reportUrls;
  }

  private async checkErasureEligibility(userId: string): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    // Check legal obligations, legitimate interests, etc.
    const response = await fetch(`${API_BASE}/gdpr/users/${userId}/erasure-eligibility`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to check erasure eligibility');
    }

    return response.json();
  }

  private async eraseUserData(userId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/gdpr/users/${userId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to erase user data');
    }
  }

  private async notifyThirdPartiesOfErasure(userId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/gdpr/third-parties/notify-erasure`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      console.error('Failed to notify third parties of erasure');
    }
  }

  private async collectPortableData(userId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/gdpr/users/${userId}/portable-data`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to collect portable data');
    }

    return response.json();
  }

  private async exportDataInFormat(data: any, format: string): Promise<string> {
    const response = await fetch(`${API_BASE}/gdpr/export`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data, format }),
    });

    if (!response.ok) {
      throw new Error(`Failed to export data in ${format} format`);
    }

    const { fileUrl } = await response.json();
    return fileUrl;
  }

  private generateConsentDescription(purpose: string, scope: any): string {
    return `Consent for ${purpose} covering ${scope.dataTypes.join(', ')}`;
  }

  private async storeConsentRecord(consent: ConsentRecord): Promise<void> {
    const response = await fetch(`${API_BASE}/gdpr/consent`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(consent),
    });

    if (!response.ok) {
      throw new Error('Failed to store consent record');
    }
  }

  private async getActiveRetentionPolicies(): Promise<DataRetentionPolicy[]> {
    const response = await fetch(`${API_BASE}/gdpr/retention-policies?active=true`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch retention policies');
    }

    return response.json();
  }

  private hashEmail(email: string): string {
    // Simple hash for demonstration - use proper hashing in production
    return email.split('@').map((part, i) => 
      i === 0 ? part.substring(0, 2) + '***' : part
    ).join('@');
  }

  private maskPhone(phone: string): string {
    return phone.replace(/\d(?=\d{4})/g, '*');
  }

  private anonymizeIp(ip: string): string {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
    return ip;
  }

  private isSensitiveData(dataType: string): boolean {
    const sensitiveTypes = [
      'health',
      'biometric',
      'genetic',
      'racial_ethnic',
      'political_opinions',
      'religious_beliefs',
      'sexual_orientation',
      'criminal_records',
    ];
    return sensitiveTypes.includes(dataType.toLowerCase());
  }

  private getAuthHeaders(): HeadersInit {
    const { authService } = require('../authService');
    const tokens = authService.getStoredTokens();
    
    return {
      'Authorization': tokens ? `Bearer ${tokens.accessToken}` : '',
    };
  }

  private async getUserIpAddress(userId: string): Promise<string> {
    // Implementation would get actual IP
    return '0.0.0.0';
  }

  private async getUserAgent(userId: string): Promise<string> {
    // Implementation would get actual user agent
    return navigator.userAgent;
  }

  private async getConsentRecord(consentId: string): Promise<ConsentRecord> {
    const response = await fetch(`${API_BASE}/gdpr/consent/${consentId}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Consent record not found');
    }

    return response.json();
  }

  private async updateConsentRecord(consent: ConsentRecord): Promise<void> {
    const response = await fetch(`${API_BASE}/gdpr/consent/${consent.id}`, {
      method: 'PUT',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(consent),
    });

    if (!response.ok) {
      throw new Error('Failed to update consent record');
    }
  }

  private async processConsentWithdrawal(consent: ConsentRecord): Promise<void> {
    // Stop processing for withdrawn purposes
    // Delete data if no other legal basis exists
    // Notify relevant systems
  }

  private async findExpiredData(policy: DataRetentionPolicy): Promise<any[]> {
    const response = await fetch(
      `${API_BASE}/gdpr/data/expired?category=${policy.dataCategory}&days=${policy.retentionPeriod}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) {
      throw new Error('Failed to find expired data');
    }

    return response.json();
  }

  private async hardDeleteData(data: any): Promise<void> {
    await fetch(`${API_BASE}/gdpr/data/${data.id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
  }

  private async softDeleteData(data: any): Promise<void> {
    await fetch(`${API_BASE}/gdpr/data/${data.id}/soft-delete`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
  }

  private async anonymizeData(data: any): Promise<void> {
    await fetch(`${API_BASE}/gdpr/data/${data.id}/anonymize`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
  }

  private async identifyPrivacyRisks(dataTypes: string[], purposes: string[]): Promise<any[]> {
    // Risk assessment logic
    return [];
  }

  private async savePIA(assessment: PrivacyImpactAssessment): Promise<void> {
    await fetch(`${API_BASE}/gdpr/pia`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assessment),
    });
  }

  private async logDataBreach(breach: any): Promise<void> {
    await fetch(`${API_BASE}/gdpr/breaches`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(breach),
    });
  }

  private async notifySupervisoryAuthority(breach: any): Promise<void> {
    // Implementation would notify relevant authorities
  }

  private async notifyAffectedUsers(breach: any): Promise<void> {
    // Implementation would notify users
  }

  private async logDataChange(userId: string, type: string, changes: any): Promise<void> {
    await fetch(`${API_BASE}/gdpr/audit`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        type,
        changes,
        timestamp: new Date(),
      }),
    });
  }

  private async updateUserData(userId: string, corrections: Record<string, any>): Promise<any> {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corrections),
    });

    if (!response.ok) {
      throw new Error('Failed to update user data');
    }

    return response.json();
  }

  private async validateCorrections(corrections: Record<string, any>): Promise<void> {
    // Validate that corrections are allowed and properly formatted
    const allowedFields = ['name', 'email', 'phone', 'address'];
    
    for (const field of Object.keys(corrections)) {
      if (!allowedFields.includes(field)) {
        throw new Error(`Field ${field} cannot be modified`);
      }
    }
  }
}

export const gdprService = new GDPRService();