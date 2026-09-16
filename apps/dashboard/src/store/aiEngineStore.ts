/**
 * AI Engine Management Store
 * Zustand store for managing AI engine state, models, versions, and costs
 *
 * Features:
 * - Engine status tracking
 * - Model management
 * - Version tracking
 * - Cost metrics
 * - Real-time updates
 *
 * @module store/aiEngineStore
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  aiEngineService,
  type EngineStatus as ServiceEngineStatus,
  type AIModelInfo as ServiceAIModelInfo,
  type ModelChangeResponse,
  type UpgradeResponse,
  type CostSummary as ServiceCostSummary,
  type EngineId as ServiceEngineId
} from '@/services/aiEngineService';

export type EngineStatus = ServiceEngineStatus;
export type AIModelInfo = ServiceAIModelInfo;
export type CostSummary = ServiceCostSummary;
export type EngineId = ServiceEngineId;
type RemoteEngineId = Extract<EngineId, 'claude' | 'openai'>;

/**
 * Budget Information
 */
export interface Budget {
  id: number;
  scopeType: 'farm' | 'user' | 'global';
  scopeId?: string;
  provider?: string;
  budgetPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly';
  budgetAmount: number;
  currentSpend: number;
  warningThreshold: number;
  criticalThreshold: number;
  isActive: boolean;
}

/**
 * Model Change Request
 */
export interface ModelChangeRequest {
  provider: 'claude' | 'openai';
  modelId: string;
  validateCompatibility?: boolean;
}

/**
 * Upgrade Request
 */
export interface UpgradeRequest {
  provider: 'claude' | 'openai';
  targetVersion: string;
  forceUpgrade?: boolean;
  backupConfig?: boolean;
}

/**
 * Store State
 */
interface AIEngineState {
  // Engine status
  engines: EngineStatus[];
  defaultProvider: EngineId | null;
  loading: boolean;
  error: string | null;

  // Models
  availableModels: Map<RemoteEngineId, AIModelInfo[]>;
  currentModels: Map<RemoteEngineId, string>;
  loadingModels: Set<RemoteEngineId>;

  // Costs
  costSummary: CostSummary | null;
  budgets: Budget[];
  loadingCosts: boolean;

  // UI State
  upgradeInProgress: boolean;
  modelChangeInProgress: boolean;

  // Actions
  fetchEngineStatus: () => Promise<void>;
  setDefaultProvider: (provider: EngineId) => Promise<void>;
  fetchAvailableModels: (
    provider: 'claude' | 'openai',
    filters?: {
      capabilities?: string[];
      maxCostPerRequest?: number;
      minContextWindow?: number;
      includeDeprecated?: boolean;
    }
  ) => Promise<void>;
  changeModel: (request: ModelChangeRequest) => Promise<ModelChangeResponse>;
  upgradeEngine: (request: UpgradeRequest) => Promise<UpgradeResponse>;
  validateApiKey: (provider: 'claude' | 'openai', apiKey: string) => Promise<boolean>;
  fetchCosts: (provider?: 'claude' | 'openai', startDate?: string, endDate?: string) => Promise<void>;
  fetchBudgets: () => Promise<void>;
  reset: () => void;
}

/**
 * Create AI Engine Store
 */
export const useAIEngineStore = create<AIEngineState>()(
  devtools(
    (set, get) => ({
      // Initial State
      engines: [],
      defaultProvider: null,
      loading: false,
      error: null,
      availableModels: new Map(),
      currentModels: new Map(),
      loadingModels: new Set(),
      costSummary: null,
      budgets: [],
      loadingCosts: false,
      upgradeInProgress: false,
      modelChangeInProgress: false,

      /**
       * Fetch engine status with enhanced error handling
       */
      fetchEngineStatus: async () => {
        set({ loading: true, error: null });

        try {
          const result = await aiEngineService.getEngineStatus();

          // Handle both success flag and engines array presence
          if (result.success || result.engines) {
            const currentModels = new Map<RemoteEngineId, string>();
            const engines = result.engines || [];

            engines.forEach((engine) => {
              if (engine.provider === 'claude' || engine.provider === 'openai') {
                currentModels.set(engine.provider, engine.model);
              }
            });

            set({
              engines,
              defaultProvider: result.defaultProvider ?? null,
              currentModels,
              loading: false,
              error: null
            });
          } else {
            set({
              loading: false,
              error: result.error || 'Failed to fetch engine status',
              defaultProvider: null
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ loading: false, error: message, defaultProvider: null });
          throw error;
        }
      },

      /**
       * Set default AI provider
       */
      setDefaultProvider: async (provider: EngineId) => {
        set({ loading: true, error: null });

        try {
          const result = await aiEngineService.setDefaultProvider(provider);

          if (result.success) {
            set({
              defaultProvider: provider as EngineId,
              loading: false,
              error: null
            });

            // Refresh engine status to reflect changes
            await get().fetchEngineStatus();
          } else {
            set({
              loading: false,
              error: result.message || 'Failed to set default provider'
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ loading: false, error: message });
          throw error;
        }
      },

      /**
       * Fetch available models for a provider
       */
      fetchAvailableModels: async (provider, filters = {}) => {
        const currentLoading = new Set(get().loadingModels);
        currentLoading.add(provider);
        set({ loadingModels: currentLoading });

        try {
          const data = await aiEngineService.getAvailableModels(provider, filters);

          if (data.success) {
            const availableModels = new Map(get().availableModels);
            const currentModels = new Map(get().currentModels);

            availableModels.set(provider, data.models);
            if (data.currentModel) {
              currentModels.set(provider, data.currentModel);
            }

            currentLoading.delete(provider);

            set({
              availableModels,
              currentModels,
              loadingModels: currentLoading
            });
          } else {
            currentLoading.delete(provider);
            set({
              loadingModels: currentLoading,
              error: data.error || 'Failed to load models'
            });
          }
        } catch (error) {
          currentLoading.delete(provider);
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ loadingModels: currentLoading, error: message });
          throw error;
        }
      },

      /**
       * Change model for a provider
       */
      changeModel: async (request) => {
        set({ modelChangeInProgress: true, error: null });

        try {
          const data = await aiEngineService.changeModel(
            request.provider,
            request.modelId,
            request.validateCompatibility ?? true
          );

          const currentModels = new Map(get().currentModels);
          currentModels.set(request.provider, data.newModel);

          set({
            currentModels,
            modelChangeInProgress: false
          });

          await get().fetchEngineStatus();

          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ modelChangeInProgress: false, error: message });
          throw error;
        }
      },

      /**
       * Upgrade engine version
       */
      upgradeEngine: async (request) => {
        set({ upgradeInProgress: true, error: null });

        try {
          const data = await aiEngineService.upgradeEngine(
            request.provider,
            request.targetVersion,
            request.forceUpgrade ?? false,
            request.backupConfig ?? true
          );

          set({ upgradeInProgress: false });
          await get().fetchEngineStatus();

          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ upgradeInProgress: false, error: message });
          throw error;
        }
      },

      /**
       * Validate API key
       */
      validateApiKey: async (provider, apiKey) => {
        try {
          const data = await aiEngineService.validateApiKey(provider, apiKey);
          return data.success && data.valid;
        } catch (error) {
          console.error('Failed to validate API key:', error);
          return false;
        }
      },

      /**
       * Fetch costs
       */
      fetchCosts: async (provider, startDate, endDate) => {
        set({ loadingCosts: true, error: null });

        try {
          const data = await aiEngineService.getCosts(provider, startDate, endDate);

          if (data.success) {
            set({
              costSummary: data.summary,
              loadingCosts: false,
              error: null
            });
          } else {
            set({
              loadingCosts: false,
              error: data.error || 'Failed to fetch costs'
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ loadingCosts: false, error: message });
          throw error;
        }
      },

      /**
       * Fetch budgets
       */
      fetchBudgets: async () => {
        try {
          const response = await fetch('/api/cost-budgets');
          const data = await response.json();

          if (data.success) {
            set({ budgets: data.budgets });
          }
        } catch (error) {
          console.error('Failed to fetch budgets:', error);
        }
      },

      /**
       * Reset store
       */
      reset: () => {
        set({
          engines: [],
          defaultProvider: null,
          loading: false,
          error: null,
          availableModels: new Map(),
          currentModels: new Map(),
          loadingModels: new Set(),
          costSummary: null,
          budgets: [],
          loadingCosts: false,
          upgradeInProgress: false,
          modelChangeInProgress: false
        });
      }
    }),
    { name: 'AIEngineStore' }
  )
);

/**
 * Selectors for optimized component re-renders
 */
export const selectEngineByProvider = (provider: 'claude' | 'openai') => (state: AIEngineState) =>
  state.engines.find(e => e.provider === provider);

export const selectModelsForProvider = (provider: 'claude' | 'openai') => (state: AIEngineState) =>
  state.availableModels.get(provider) || [];

export const selectCurrentModel = (provider: 'claude' | 'openai') => (state: AIEngineState) =>
  state.currentModels.get(provider);

export const selectIsLoadingModels = (provider: 'claude' | 'openai') => (state: AIEngineState) =>
  state.loadingModels.has(provider);
