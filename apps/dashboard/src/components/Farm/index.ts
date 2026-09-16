// Export the new Pro version as the primary orchestrator
export { default as FarmOrchestratorPro } from './FarmOrchestratorPro';
export { default as FarmOrchestrator } from './FarmOrchestratorPro'; // Use Pro as default

// Keep old components available for migration
export { default as FarmOrchestratorLegacy } from './FarmOrchestrator';
export { FarmOrchestratorAdvanced as FarmOrchestratorAdvancedLegacy } from './FarmOrchestratorAdvanced';

// Export other farm components
export { FarmCreator } from './FarmCreator';
export { FarmDetails } from './FarmDetails';
// export { FarmStatusMonitor } from './FarmStatusMonitor'; // File doesn't exist
// export { FarmTemplateSelector } from './FarmTemplateSelector'; // File doesn't exist
// export { AgentPoolManager } from './AgentPoolManager'; // File doesn't exist
export { AgentLifecycle } from './AgentLifecycle';
export { CreateFarmFromSeed } from './CreateFarmFromSeed';
export { CreateFarmFromFarmer } from './CreateFarmFromFarmer';

// Unified Chat Wizard - Enhanced conversational farm creation
export { UnifiedFarmChatWizard } from './UnifiedFarmChatWizard';
export type { FarmMode, UnifiedFarmChatWizardProps } from './UnifiedFarmChatWizard';

// Model-First Reasoning & DEMOCRITUS Causal Models (arxiv 2512.14474, arxiv 2512.07796)
export { ProblemModelViewer } from './ProblemModelViewer';
export { CausalGraphVisualization } from './CausalGraphVisualization';
export { ModelVisualizationPanel } from './ModelVisualizationPanel';

// Blerbz Plugins - Confidence & Continuation (inference-confidenz, inference-continuez)
export { default as ConfidencePanel, ConfidenceBadge } from './ConfidencePanel';
export { default as ContinuezControls } from './ContinuezControls';
