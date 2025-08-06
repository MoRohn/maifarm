/**
 * YAML Store - State management for YAML configurations
 */

import { create } from 'zustand';
import { YamlConfig } from '../types/yamlGenerator';
import { 
  YamlVersion, 
  ExtendedValidationResult,
  DeploymentStatus,
  ApprovalWorkflow 
} from '../types/yamlPipeline';
import yamlGeneratorService from '../services/yamlGeneratorService';
import yamlValidationService from '../services/yamlValidationService';
import yamlVersioningService from '../services/yamlVersioningService';
import yamlAuditService from '../services/yamlAuditService';
import yamlCicdService from '../services/yamlCicdService';

interface YamlStore {
  // Current YAML state
  currentYaml: YamlConfig | null;
  rawYaml: string;
  isGenerating: boolean;
  isValidating: boolean;
  
  // Validation state
  validationResult: ExtendedValidationResult | null;
  validationInProgress: boolean;
  
  // Version control state
  versions: YamlVersion[];
  currentVersion: YamlVersion | null;
  selectedVersions: string[]; // For diff view
  
  // Deployment state
  deployments: DeploymentStatus[];
  activeDeployment: DeploymentStatus | null;
  
  // Approval state
  pendingApprovals: ApprovalWorkflow[];
  
  // Actions
  generateYaml: (prompt: string, options?: any) => Promise<void>;
  validateYaml: (yaml?: string) => Promise<void>;
  saveVersion: (message: string, author: string) => Promise<void>;
  loadVersion: (versionId: string) => Promise<void>;
  compareVersions: (fromId: string, toId: string) => Promise<void>;
  deployYaml: (environment: string, pipeline: string) => Promise<void>;
  approveWorkflow: (workflowId: string, decision: 'approve' | 'reject', comment?: string) => Promise<void>;
  
  // UI state
  showDiffView: boolean;
  showVersionHistory: boolean;
  showDeploymentLogs: boolean;
  selectedTab: 'editor' | 'preview' | 'validation' | 'versions' | 'deployments';
  
  // UI actions
  setShowDiffView: (show: boolean) => void;
  setShowVersionHistory: (show: boolean) => void;
  setShowDeploymentLogs: (show: boolean) => void;
  setSelectedTab: (tab: YamlStore['selectedTab']) => void;
  
  // Utility actions
  clearValidation: () => void;
  refreshVersions: () => Promise<void>;
  refreshDeployments: () => Promise<void>;
  exportYaml: (format: 'yaml' | 'json') => void;
}

const useYamlStore = create<YamlStore>((set, get) => ({
  // Initial state
  currentYaml: null,
  rawYaml: '',
  isGenerating: false,
  isValidating: false,
  validationResult: null,
  validationInProgress: false,
  versions: [],
  currentVersion: null,
  selectedVersions: [],
  deployments: [],
  activeDeployment: null,
  pendingApprovals: [],
  showDiffView: false,
  showVersionHistory: false,
  showDeploymentLogs: false,
  selectedTab: 'editor',

  // Generate YAML from prompt
  generateYaml: async (prompt: string, options?: any) => {
    set({ isGenerating: true });
    try {
      const result = await yamlGeneratorService.generateYaml({ 
        prompt, 
        mode: 'guided',
        options 
      });
      
      if (result.success && result.yaml && result.raw_yaml) {
        set({ 
          currentYaml: result.yaml,
          rawYaml: result.raw_yaml,
          validationResult: null
        });
        
        // Auto-validate after generation
        await get().validateYaml();
        
        // Log generation
        await yamlAuditService.logAudit(
          'create',
          result.yaml.name,
          '1.0.0',
          'current-user', // In real app, get from auth
          'Current User',
          { prompt, generatedBy: 'AI' }
        );
      }
    } catch (error) {
      console.error('Failed to generate YAML:', error);
    } finally {
      set({ isGenerating: false });
    }
  },

  // Validate YAML
  validateYaml: async (yaml?: string) => {
    set({ isValidating: true, validationInProgress: true });
    try {
      const yamlToValidate = yaml || get().rawYaml;
      const result = await yamlValidationService.validateYamlString(yamlToValidate);
      set({ validationResult: result });
    } catch (error) {
      console.error('Failed to validate YAML:', error);
    } finally {
      set({ isValidating: false, validationInProgress: false });
    }
  },

  // Save as new version
  saveVersion: async (message: string, author: string) => {
    const { currentYaml, currentVersion } = get();
    if (!currentYaml) return;

    try {
      const newVersion = await yamlVersioningService.createVersion(
        currentYaml,
        author,
        message,
        currentVersion || undefined
      );
      
      set(state => ({
        currentVersion: newVersion,
        versions: [newVersion, ...state.versions]
      }));
      
      // Log version creation
      await yamlAuditService.logAudit(
        'update',
        currentYaml.name,
        newVersion.version,
        'current-user',
        author,
        { message }
      );
    } catch (error) {
      console.error('Failed to save version:', error);
    }
  },

  // Load a specific version
  loadVersion: async (versionId: string) => {
    try {
      const version = await yamlVersioningService.getVersion(versionId);
      if (version) {
        set({
          currentYaml: version.config,
          rawYaml: version.rawYaml,
          currentVersion: version,
          validationResult: null
        });
        
        // Auto-validate loaded version
        await get().validateYaml();
      }
    } catch (error) {
      console.error('Failed to load version:', error);
    }
  },

  // Compare two versions
  compareVersions: async (fromId: string, toId: string) => {
    try {
      const diff = await yamlVersioningService.compareVersions(fromId, toId);
      set({ 
        selectedVersions: [fromId, toId],
        showDiffView: true 
      });
    } catch (error) {
      console.error('Failed to compare versions:', error);
    }
  },

  // Deploy YAML
  deployYaml: async (environment: string, pipeline: string) => {
    const { currentYaml, currentVersion } = get();
    if (!currentYaml || !currentVersion) return;

    try {
      const deploymentConfig = {
        id: `config-${Date.now()}`,
        yamlId: currentYaml.name,
        version: currentVersion.id,
        environment: environment as any,
        pipeline: pipeline as any,
        settings: {
          autoApprove: false,
          rollbackOnFailure: true,
          healthCheckEndpoint: '/health'
        }
      };

      const deployment = await yamlCicdService.deploy(
        currentYaml.name,
        currentVersion.version,
        deploymentConfig,
        'current-user',
        'Current User'
      );

      set(state => ({
        deployments: [deployment, ...state.deployments],
        activeDeployment: deployment,
        showDeploymentLogs: true
      }));
    } catch (error) {
      console.error('Failed to deploy:', error);
    }
  },

  // Approve workflow
  approveWorkflow: async (workflowId: string, decision: 'approve' | 'reject', comment?: string) => {
    try {
      await yamlAuditService.recordApproval(
        workflowId,
        'current-user',
        'Current User',
        decision,
        comment
      );
      
      // Refresh approvals
      await get().refreshVersions();
    } catch (error) {
      console.error('Failed to record approval:', error);
    }
  },

  // UI actions
  setShowDiffView: (show) => set({ showDiffView: show }),
  setShowVersionHistory: (show) => set({ showVersionHistory: show }),
  setShowDeploymentLogs: (show) => set({ showDeploymentLogs: show }),
  setSelectedTab: (tab) => set({ selectedTab: tab }),

  // Utility actions
  clearValidation: () => set({ validationResult: null }),

  refreshVersions: async () => {
    const { currentYaml } = get();
    if (!currentYaml) return;

    try {
      const versions = await yamlVersioningService.getVersionHistory(currentYaml.name);
      set({ versions });
    } catch (error) {
      console.error('Failed to refresh versions:', error);
    }
  },

  refreshDeployments: async () => {
    const { currentYaml } = get();
    if (!currentYaml) return;

    try {
      const deployments = yamlCicdService.getDeploymentHistory(currentYaml.name);
      set({ deployments });
    } catch (error) {
      console.error('Failed to refresh deployments:', error);
    }
  },

  exportYaml: (format: 'yaml' | 'json') => {
    const { currentYaml, rawYaml } = get();
    if (!currentYaml) return;

    const content = format === 'yaml' ? rawYaml : JSON.stringify(currentYaml, null, 2);
    const blob = new Blob([content], { 
      type: format === 'yaml' ? 'text/yaml' : 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentYaml.name}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}));

export default useYamlStore;