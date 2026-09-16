/**
 * LazyComponents - Centralized lazy loading for code splitting
 * Reduces initial bundle size by loading components on demand
 */

import { lazy, ComponentType, LazyExoticComponent } from 'react';

// Retry logic for failed dynamic imports
const retryImport = <T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): Promise<{ default: T }> => {
  return new Promise((resolve, reject) => {
    const attemptImport = (retriesLeft: number) => {
      importFn()
        .then(resolve)
        .catch((error) => {
          if (retriesLeft === 0) {
            reject(error);
            return;
          }

          setTimeout(() => {
            attemptImport(retriesLeft - 1);
          }, delay);
        });
    };

    attemptImport(retries);
  });
};

// Helper to create lazy component with retry logic
const lazyWithRetry = <T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): LazyExoticComponent<T> => {
  return lazy(() => retryImport(importFn));
};

// ============= Heavy Components (Load on demand) =============

// Analytics Components (~300KB)
export const LazyAnalyticsPage = lazyWithRetry(
  () => import(/* webpackChunkName: "analytics" */ '@/components/Analytics/AnalyticsPage')
);

export const LazyAnalyticsDashboard = lazyWithRetry(
  () => import(/* webpackChunkName: "analytics" */ '@/components/Analytics/AnalyticsDashboard')
);

export const LazyReportGenerator = lazyWithRetry(
  () => import(/* webpackChunkName: "analytics" */ '@/components/Analytics/ReportGenerator')
);

export const LazyPredictiveAnalytics = lazyWithRetry(
  () => import(/* webpackChunkName: "analytics" */ '@/components/Analytics/PredictiveAnalytics')
);

// Settings Components (~250KB)
export const LazySettingsPage = lazyWithRetry(
  () => import(/* webpackChunkName: "settings" */ '@/components/Settings/SettingsPage')
);

export const LazyAdminTestingPanel = lazyWithRetry(
  () => import(/* webpackChunkName: "settings" */ '@/components/Settings/AdminTestingPanel')
);

export const LazyAIEngineSetupHub = lazyWithRetry(
  () => import(/* webpackChunkName: "settings" */ '@/components/Settings/AIEngineSetup/AIEngineSetupHub')
);

// Farm Components (~400KB)
export const LazyFarmCreator = lazyWithRetry(
  () => import(/* webpackChunkName: "farm" */ '@/components/Farm/FarmCreator')
);

export const LazyFarmOrchestrator = lazyWithRetry(
  () => import(/* webpackChunkName: "farm" */ '@/components/Farm/FarmOrchestrator')
);

export const LazyWorkflowDesigner = lazyWithRetry(
  () => import(/* webpackChunkName: "farm" */ '@/components/Farm/WorkflowDesigner')
);

export const LazyConceptExplainer = lazyWithRetry(
  () => import(/* webpackChunkName: "farm" */ '@/components/Farm/ConceptExplainer')
);

// Harvest Components (~500KB - largest)
export const LazyHarvestPage = lazyWithRetry(
  () => import(/* webpackChunkName: "harvest" */ '@/components/Harvest/HarvestPage')
);

export const LazyCentralTerminalView = lazyWithRetry(
  () => import(/* webpackChunkName: "harvest" */ '@/components/Harvest/CentralTerminalView')
);

export const LazyHarvestDashboard = lazyWithRetry(
  () => import(/* webpackChunkName: "harvest" */ '@/components/Harvest/HarvestDashboard')
);

export const LazyWorkflowCanvas = lazyWithRetry(
  () => import(/* webpackChunkName: "harvest" */ '@/components/Harvest/WorkflowCanvas')
);

// Terminal Components (~200KB)
export const LazyAdvancedTerminalShowcase = lazyWithRetry(
  () => import(/* webpackChunkName: "terminal" */ '@/components/Terminal/AdvancedTerminalShowcase')
);

export const LazyVirtualTerminal = lazyWithRetry(
  () => import(/* webpackChunkName: "terminal" */ '@/components/Terminal/VirtualTerminal')
);

// Barn Components (~150KB)
export const LazyBarnPage = lazyWithRetry(
  () => import(/* webpackChunkName: "barn" */ '@/components/Barn/BarnPage')
);

export const LazyHarvestDetails = lazyWithRetry(
  () => import(/* webpackChunkName: "barn" */ '@/components/Barn/HarvestDetails')
);

// GoWild Components (~200KB)
export const LazyGoWildModal = lazyWithRetry(
  () => import(/* webpackChunkName: "gowild" */ '@/components/GoWild/GoWildModal')
);

export const LazyGoWildChatWizard = lazyWithRetry(
  () => import(/* webpackChunkName: "gowild" */ '@/components/GoWild/GoWildChatWizard')
);

// Monitoring Components (~100KB)
export const LazyHealthStatus = lazyWithRetry(
  () => import(/* webpackChunkName: "monitoring" */ '@/components/Monitoring/HealthStatus')
);

// Backup Components (~100KB)
export const LazyBackupManager = lazyWithRetry(
  () => import(/* webpackChunkName: "backup" */ '@/components/Backup/BackupManager')
);

// YAML Components (~150KB)
export const LazyYamlEditor = lazyWithRetry(
  () => import(/* webpackChunkName: "yaml" */ '@/components/YamlConfig/YamlEditor')
);

export const LazyYamlGenerator = lazyWithRetry(
  () => import(/* webpackChunkName: "yaml" */ '@/components/YamlGenerator/YamlEditor')
);

// ============= Preload Functions =============

/**
 * Preload heavy components when user is likely to navigate to them
 */
export const preloadAnalytics = () => {
  import(/* webpackChunkName: "analytics" */ '@/components/Analytics/AnalyticsPage');
  import(/* webpackChunkName: "analytics" */ '@/components/Analytics/AnalyticsDashboard');
};

export const preloadSettings = () => {
  import(/* webpackChunkName: "settings" */ '@/components/Settings/SettingsPage');
};

export const preloadHarvest = () => {
  import(/* webpackChunkName: "harvest" */ '@/components/Harvest/HarvestPage');
  import(/* webpackChunkName: "harvest" */ '@/components/Harvest/CentralTerminalView');
};

export const preloadFarmCreation = () => {
  import(/* webpackChunkName: "farm" */ '@/components/Farm/FarmCreator');
  import(/* webpackChunkName: "farm" */ '@/components/Farm/FarmOrchestrator');
};

/**
 * Preload strategy based on user role/preferences
 */
export const setupSmartPreloading = () => {
  // Preload on idle
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Preload most commonly used heavy components
      preloadHarvest();
    }, { timeout: 2000 });
  }

  // Preload on hover/focus of navigation items
  document.addEventListener('mouseenter', (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-preload="analytics"]')) {
      preloadAnalytics();
    } else if (target.closest('[data-preload="settings"]')) {
      preloadSettings();
    } else if (target.closest('[data-preload="harvest"]')) {
      preloadHarvest();
    } else if (target.closest('[data-preload="farm"]')) {
      preloadFarmCreation();
    }
  }, true);
};

/**
 * Bundle size analyzer helper
 */
export const analyzeBundleImpact = () => {
  const components = {
    Analytics: ['AnalyticsPage', 'AnalyticsDashboard', 'ReportGenerator'],
    Settings: ['SettingsPage', 'AdminTestingPanel', 'AIEngineSetupHub'],
    Farm: ['FarmCreator', 'FarmOrchestrator', 'WorkflowDesigner'],
    Harvest: ['HarvestPage', 'CentralTerminalView', 'HarvestDashboard'],
    Terminal: ['AdvancedTerminalShowcase', 'VirtualTerminal'],
    Barn: ['BarnPage', 'HarvestDetails'],
    GoWild: ['GoWildModal', 'GoWildChatWizard'],
  };

  if (process.env.NODE_ENV === 'development') {
    // Log bundle impact in development
    Object.entries(components).forEach(([category, items]) => {
      // This will be replaced by actual bundle analyzer in build process
      if ((window as any).__BUNDLE_STATS__) {
        const stats = (window as any).__BUNDLE_STATS__[category];
        if (stats) {
          // Development logging only
        }
      }
    });
  }

  return components;
};