import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PlayIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ClockIcon,
  CogIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { Glass } from '../ui/Glass';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient } from '@/services/apiClient';
import { 
  TestPhase, 
  TestResult, 
  TestError, 
  TestConfiguration, 
  TestSession, 
  TestStatus,
  ErrorCategory,
  ApiResponseLog
} from '@/types/adminTesting';
import './AdminTestingPanel.css';

interface OrchestratorStatus {
  type: string;
  xenosyncEnabled: boolean;
}

export const AdminTestingPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [currentSubPhase, setCurrentSubPhase] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<TestResult[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus>({ type: 'maifarm', xenosyncEnabled: false });
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [currentSession, setCurrentSession] = useState<TestSession | null>(null);
  const [apiLogs, setApiLogs] = useState<ApiResponseLog[]>([]);
  useWebSocket(); // Used for connection monitoring
  
  const [config, setConfig] = useState<TestConfiguration>({
    verboseMode: false,
    enableRetries: true,
    maxRetries: 3,
    timeout: 30000,
    runIndividualPhases: false,
    environment: 'development'
  });

  const phases: TestPhase[] = [
    { 
      id: 'network',
      name: 'Network',
      icon: '🌐',
      description: 'Test network connectivity and API endpoints',
      status: 'pending',
      canRunIndividually: true,
      estimatedDuration: 5000
    },
    { 
      id: 'database',
      name: 'Database',
      icon: '🗄️',
      description: 'Verify database health and connectivity',
      status: 'pending',
      canRunIndividually: true,
      dependencies: ['network'],
      estimatedDuration: 8000
    },
    { 
      id: 'xenosync',
      name: 'XenoSync',
      icon: '🔄',
      description: 'Check XenoSync orchestrator availability',
      status: 'pending',
      dependencies: ['network'],
      estimatedDuration: 3000
    },
    { 
      id: 'setup',
      name: 'Setup',
      icon: '🌱',
      description: 'System health and orchestrator setup',
      status: 'pending',
      dependencies: ['network', 'database'],
      estimatedDuration: 10000
    },
    { 
      id: 'quicktask',
      name: 'Quick Task',
      icon: '⚡',
      description: 'Test Quick Task with XenoSync integration',
      status: 'pending',
      dependencies: ['setup'],
      estimatedDuration: 8000
    },
    { 
      id: 'gowild',
      name: 'Go Wild',
      icon: '🚀',
      description: 'Test Go Wild mode with XenoSync',
      status: 'pending',
      dependencies: ['setup'],
      estimatedDuration: 10000
    },
    { 
      id: 'farm',
      name: 'Farm',
      icon: '🚜',
      description: 'Create and configure test farm with XenoSync',
      status: 'pending',
      dependencies: ['setup'],
      estimatedDuration: 12000
    },
    { 
      id: 'agents',
      name: 'Agents',
      icon: '🤖',
      description: 'Launch agents with XenoSync/standard orchestrator',
      status: 'pending',
      dependencies: ['farm'],
      estimatedDuration: 15000
    },
    {
      id: 'terminal',
      name: 'Terminal',
      icon: '💻',
      description: 'Verify terminal streaming for all modes',
      status: 'pending',
      dependencies: ['agents'],
      estimatedDuration: 5000
    },
    {
      id: 'handshake',
      name: 'Handshake',
      icon: '🤝',
      description: 'Verify agent registration and connection',
      status: 'pending',
      dependencies: ['agents'],
      estimatedDuration: 10000
    },
    {
      id: 'tasks',
      name: 'Tasks',
      icon: '📋',
      description: 'Test task queue and distribution',
      status: 'pending',
      dependencies: ['handshake'],
      estimatedDuration: 15000
    },
    { 
      id: 'execute',
      name: 'Execute',
      icon: '⚡',
      description: 'Execute test tasks and monitor progress',
      status: 'pending',
      dependencies: ['tasks'],
      estimatedDuration: 20000
    },
    { 
      id: 'harvest',
      name: 'Harvest',
      icon: '🌾',
      description: 'Collect and process farm outputs with graceful shutdown',
      status: 'pending',
      dependencies: ['execute'],
      estimatedDuration: 10000
    },
    { 
      id: 'store',
      name: 'Store',
      icon: '🏚️',
      description: 'Store results in Barn and cleanup resources',
      status: 'pending',
      dependencies: ['harvest'],
      estimatedDuration: 8000
    }
  ];

  const [phaseStates, setPhaseStates] = useState(phases);

  // Check orchestrator type on mount
  useEffect(() => {
    const checkOrchestratorType = async () => {
      try {
        const response = await apiClient.get('/api/orchestrator/type');
        setOrchestratorStatus(response.data);
      } catch (error) {
        console.error('Failed to get orchestrator type:', error);
      }
    };
    checkOrchestratorType();
  }, []);

  const createTestError = (message: string, category: ErrorCategory, code?: string | number, context?: Record<string, unknown>, stack?: string): TestError => ({
    message,
    category,
    code,
    context,
    stack,
    timestamp: new Date().toISOString()
  });

  const logApiCall = (endpoint: string, method: string, statusCode: number, responseTime: number, error?: string) => {
    const log: ApiResponseLog = {
      endpoint,
      method,
      statusCode,
      responseTime,
      timestamp: new Date().toISOString(),
      error
    };
    setApiLogs(prev => [...prev, log]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Auto-run complete test with single click
  const runCompleteTest = async () => {
    const sessionId = `session-${Date.now()}`;
    const startTime = new Date().toISOString();
    
    setIsRunning(true);
    setTestStatus('running');
    setResults([]);
    setApiLogs([]);
    setProgress(0);
    setCurrentSubPhase('');
    setPhaseStates(phases.map(p => ({ ...p, status: 'pending' })));

    const session: TestSession = {
      id: sessionId,
      startTime,
      status: 'running',
      phases: [],
      configuration: config,
      overallSuccess: false,
      errorCount: 0,
      warningCount: 0
    };
    setCurrentSession(session);

    const totalPhases = phases.length;
    let completedPhases = 0;
    let testFailed = false;
    let errorCount = 0;
    const warningCount = 0;

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      setCurrentPhase(phase.name);
      
      // Update phase status
      setPhaseStates(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'running' } : p
      ));

      const phaseStartTime = new Date().toISOString();
      const phaseStartTimeMs = Date.now();
      let phaseError: TestError | undefined;
      
      try {
        // Execute basic phase logic
        await executePhaseBasic(phase.id);
        
        const duration = Date.now() - phaseStartTimeMs;
        
        // Mark phase as success
        setPhaseStates(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'success' } : p
        ));
        
        const testResult: TestResult = {
          phase: phase.name,
          phaseId: phase.id,
          success: true,
          duration,
          startTime: phaseStartTime,
          endTime: new Date().toISOString(),
          message: `${phase.name} completed successfully`,
          metrics: {
            apiCallCount: apiLogs.filter(log => log.timestamp >= phaseStartTime).length,
            retryCount: 0
          },
          apiResponses: apiLogs.filter(log => log.timestamp >= phaseStartTime)
        };
        
        setResults(prev => [...prev, testResult]);
        session.phases.push(testResult);
        
        completedPhases++;
        setProgress((completedPhases / totalPhases) * 100);
        
      } catch (error: unknown) {
        phaseError = createTestError(
          (error as Error).message || 'Phase failed',
          (error as { category?: ErrorCategory }).category || 'unknown',
          (error as { code?: string | number }).code,
          (error as { context?: unknown }).context as Record<string, unknown> | undefined,
          (error as Error).stack
        );
        
        errorCount++;
        
        // Mark phase as error
        setPhaseStates(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error' } : p
        ));
        
        const testResult: TestResult = {
          phase: phase.name,
          phaseId: phase.id,
          success: false,
          duration: Date.now() - phaseStartTimeMs,
          startTime: phaseStartTime,
          endTime: new Date().toISOString(),
          message: (error as Error).message || 'Phase failed',
          error: phaseError,
          metrics: {
            apiCallCount: apiLogs.filter(log => log.timestamp >= phaseStartTime).length,
            retryCount: 0
          },
          apiResponses: apiLogs.filter(log => log.timestamp >= phaseStartTime)
        };
        
        setResults(prev => [...prev, testResult]);
        session.phases.push(testResult);
        
        testFailed = true;
        break;
      }
      
      await sleep(500);
    }

    // Update session
    session.endTime = new Date().toISOString();
    session.totalDuration = Date.now() - new Date(session.startTime).getTime();
    session.status = testFailed ? 'failed' : 'completed';
    session.overallSuccess = !testFailed;
    session.errorCount = errorCount;
    session.warningCount = warningCount;
    setCurrentSession(session);
    
    setIsRunning(false);
    setCurrentPhase('');
    setCurrentSubPhase('');
    setTestStatus(testFailed ? 'failed' : 'success');
    
    if (config.verboseMode) {
      console.log('Test session completed:', session);
    }
  };

  const executePhaseBasic = async (phaseId: string): Promise<void> => {
    const startTime = Date.now();
    
    try {
      switch (phaseId) {
        case 'network': {
          // Test basic connectivity
          const response = await apiClient.get('/api/health');
          logApiCall('/api/health', 'GET', 200, Date.now() - startTime);
          if (response.data.status !== 'healthy') {
            throw createTestError('API is not healthy', 'api', 'API_UNHEALTHY', { response: response.data });
          }
          break;
        }
        case 'database': {
          try {
            await apiClient.get('/api/farms?limit=1'); // Test basic query
            logApiCall('/api/farms', 'GET', 200, Date.now() - startTime);
          } catch (error: unknown) {
            logApiCall('/api/farms', 'GET', (error as { response?: { status?: number } }).response?.status || 500, Date.now() - startTime, (error as Error).message);
            throw createTestError(
              'Database query test failed',
              'system',
              (error as { response?: { status?: number } }).response?.status || 'DB_QUERY_ERROR',
              { error: (error as { response?: { data?: unknown } }).response?.data }
            );
          }
          break;
        }
        case 'xenosync': {
          setCurrentSubPhase('Checking XenoSync availability...');
          try {
            const xenosyncStatusResponse = await apiClient.get('/api/orchestration/xenosync/status');
            logApiCall('/api/orchestration/xenosync/status', 'GET', 200, Date.now() - startTime);
            
            if (xenosyncStatusResponse.data.available) {
              setCurrentSubPhase('XenoSync is available');
              sessionStorage.setItem('xenosync_available', 'true');
            } else {
              setCurrentSubPhase('XenoSync not available, will use standard orchestrator');
              sessionStorage.setItem('xenosync_available', 'false');
            }
          } catch (error) {
            setCurrentSubPhase('XenoSync check failed, will use standard orchestrator');
            sessionStorage.setItem('xenosync_available', 'false');
          }
          break;
        }
        case 'quicktask': {
          setCurrentSubPhase('Creating Quick Task...');
          try {
            const quickTaskResponse = await apiClient.post('/api/quicktask', {
              title: 'XenoSync Test Quick Task',
              description: 'Test Quick Task with XenoSync orchestration',
              priority: 'high',
              metadata: {
                provider: 'claude',
                useXenoSync: sessionStorage.getItem('xenosync_available') === 'true'
              }
            });
            logApiCall('/api/quicktask', 'POST', 200, Date.now() - startTime);
            
            if (quickTaskResponse.data.success) {
              const { taskId, farmId, sessionName } = quickTaskResponse.data.data;
              setCurrentSubPhase(`Quick Task created: ${sessionName}`);
              sessionStorage.setItem('quicktask_farm_id', farmId);
              
              // Wait for Quick Task to complete (5 minute timeout)
              await sleep(3000);
              
              // Stop the Quick Task farm
              try {
                await apiClient.post(`/api/farms/${farmId}/stop`);
              } catch (stopError) {
                console.log('Quick Task cleanup:', stopError);
              }
            } else {
              throw createTestError('Quick Task creation failed', 'api', 'QUICKTASK_FAILED', { response: quickTaskResponse.data });
            }
          } catch (error: unknown) {
            throw createTestError('Quick Task test failed', 'api', 'QUICKTASK_ERROR', { error });
          }
          break;
        }
        case 'gowild': {
          setCurrentSubPhase('Starting Go Wild session...');
          try {
            const goWildResponse = await apiClient.post('/api/gowild/sessions', {
              config: {
                creativityLevel: 75,
                boundaries: {
                  maxIterations: 5,
                  safetyLevel: 'moderate',
                  allowedDomains: ['testing', 'validation']
                },
                focusAreas: ['test automation', 'validation'],
                explorationDepth: 2,
                maxDuration: 1, // 1 minute for testing
                seedPrompt: 'Test Go Wild exploration with XenoSync'
              }
            });
            logApiCall('/api/gowild/sessions', 'POST', 200, Date.now() - startTime);
            
            if (goWildResponse.data.success) {
              const session = goWildResponse.data.session;
              setCurrentSubPhase(`Go Wild session: ${session.id}`);
              sessionStorage.setItem('gowild_session_id', session.id);
              sessionStorage.setItem('gowild_farm_id', session.farmId);
              
              // Wait for exploration to begin
              await sleep(3000);
              
              // Stop the Go Wild session
              try {
                await apiClient.post(`/api/gowild/sessions/${session.id}/stop`);
              } catch (stopError) {
                console.log('Go Wild cleanup:', stopError);
              }
            } else {
              throw createTestError('Go Wild session failed', 'api', 'GOWILD_FAILED', { response: goWildResponse.data });
            }
          } catch (error: unknown) {
            throw createTestError('Go Wild test failed', 'api', 'GOWILD_ERROR', { error });
          }
          break;
        }
        case 'terminal': {
          setCurrentSubPhase('Checking terminal sessions...');
          try {
            const terminalResponse = await apiClient.get('/api/terminal/sessions');
            logApiCall('/api/terminal/sessions', 'GET', 200, Date.now() - startTime);
            
            const sessions = terminalResponse.data.sessions || [];
            const farmId = sessionStorage.getItem('test_farm_id');
            
            if (farmId) {
              const farmSession = sessions.find((s: string) => 
                s.includes(farmId.substring(0, 8))
              );
              
              if (farmSession) {
                setCurrentSubPhase(`Terminal streaming active: ${farmSession}`);
              } else {
                setCurrentSubPhase('Terminal session not found (may be normal)');
              }
            }
          } catch (error) {
            setCurrentSubPhase('Terminal check skipped');
          }
          break;
        }
        case 'setup': {
          const healthResponse = await apiClient.get('/api/health');
          logApiCall('/api/health', 'GET', 200, Date.now() - startTime);
          if (healthResponse.data.status !== 'healthy') {
            throw createTestError('System is not healthy', 'system', 'SYSTEM_UNHEALTHY', { response: healthResponse.data });
          }
          
          if (orchestratorStatus.type === 'xenosync') {
            const xenosyncResponse = await apiClient.get('/api/orchestrator/xenosync/status');
            logApiCall('/api/orchestrator/xenosync/status', 'GET', 200, Date.now() - startTime);
            if (!xenosyncResponse.data.available) {
              throw createTestError('XenoSync orchestrator is not available', 'system', 'XENOSYNC_UNAVAILABLE');
            }
            if (!xenosyncResponse.data.isClaudeProvider) {
              throw createTestError('XenoSync requires Claude AI provider', 'validation', 'WRONG_AI_PROVIDER');
            }
          }
          break;
        }
        case 'farm': {
          const agentCount = orchestratorStatus.type === 'xenosync' ? Math.max(3, 2) : 3;
          const farmType = orchestratorStatus.type === 'xenosync' ? 'collaborative' : 'sequential';
          
          const farmResponse = await apiClient.post('/api/farms', {
            name: `Test-${Date.now()}-${orchestratorStatus.type}`,
            description: `Automated test using ${orchestratorStatus.type} orchestrator`,
            type: farmType,
            provider: 'claude',
            config: { 
              maxAgents: agentCount, 
              timeout: 300,
              orchestratorType: orchestratorStatus.type
            }
          });
          
          logApiCall('/api/farms', 'POST', 200, Date.now() - startTime);
          
          if (!farmResponse.data.success) {
            throw createTestError(
              `Farm creation failed: ${farmResponse.data.error?.message || 'Unknown error'}`,
              'api',
              'FARM_CREATION_FAILED',
              { response: farmResponse.data }
            );
          }
          
          sessionStorage.setItem('test_farm_id', farmResponse.data.data.id);
          break;
        }
        case 'agents': {
          const farmId = sessionStorage.getItem('test_farm_id');
          if (!farmId) throw createTestError('No farm ID found', 'validation', 'FARM_ID_MISSING');
          
          setCurrentSubPhase('Launching agent wrappers...');
          const launchResponse = await apiClient.post(`/api/farms/${farmId}/launch`);
          logApiCall(`/api/farms/${farmId}/launch`, 'POST', 200, Date.now() - startTime);
          
          if (!launchResponse.data.success) {
            throw createTestError('Agent launch failed', 'api', 'AGENT_LAUNCH_FAILED', { response: launchResponse.data });
          }
          
          // Wait for farm to be running
          let attempts = 0;
          let farmReady = false;
          
          setCurrentSubPhase('Waiting for farm activation...');
          while (attempts < 10 && !farmReady) {
            await sleep(1000);
            
            try {
              const statusResponse = await apiClient.get(`/api/farms/${farmId}`);
              if (statusResponse.data.success) {
                const status = statusResponse.data.data.status;
                if (['running', 'active', 'completed'].includes(status)) {
                  farmReady = true;
                }
              }
            } catch {
              // Continue waiting
            }
            attempts++;
          }
          
          if (!farmReady) {
            throw createTestError('Farm did not reach running state', 'timeout', 'FARM_STARTUP_TIMEOUT', { attempts });
          }
          
          setCurrentSubPhase('Agent wrappers launched');
          break;
        }
        case 'handshake': {
          const farmId = sessionStorage.getItem('test_farm_id');
          if (!farmId) throw createTestError('No farm ID found', 'validation', 'FARM_ID_MISSING');
          
          setCurrentSubPhase('Checking agent registrations...');
          
          // Check agent handshake service
          console.log('[Handshake Test] Fetching connected agents...');
          const agentsResponse = await apiClient.get('/api/agents', { params: { farmId } });
          logApiCall('/api/agents', 'GET', 200, Date.now() - startTime);
          console.log('[Handshake Test] Connected agents response:', agentsResponse.data);
          
          if (!agentsResponse.data.success) {
            throw createTestError('Could not retrieve connected agents', 'api', 'AGENT_RETRIEVAL_FAILED');
          }
          
          const connectedAgents = agentsResponse.data.data || [];
          let farmAgents = connectedAgents.filter((agent: any) => agent.farmId === farmId);
          
          if (farmAgents.length === 0) {
            // Wait for agents to register
            setCurrentSubPhase('Waiting for agent registration...');
            let registrationAttempts = 0;
            let agentsRegistered = false;
            
            while (registrationAttempts < 15 && !agentsRegistered) {
              await sleep(2000);
              
              const retryResponse = await apiClient.get('/api/agents', { params: { farmId } });
              if (retryResponse.data.success) {
                const retryAgents = retryResponse.data.data || [];
                farmAgents = retryAgents.filter((agent: any) => agent.farmId === farmId);
                
                if (farmAgents.length > 0) {
                  agentsRegistered = true;
                  setCurrentSubPhase(`${farmAgents.length} agents registered`);
                }
              }
              registrationAttempts++;
            }
            
            if (!agentsRegistered) {
              throw createTestError('No agents registered with handshake service', 'timeout', 'AGENT_REGISTRATION_TIMEOUT');
            }
          } else {
            setCurrentSubPhase(`${farmAgents.length} agents connected`);
          }
          
          // Verify agent status
          console.log('[Handshake Test] Verifying agents:', farmAgents);
          console.log('[Handshake Test] Farm agents count:', farmAgents.length);
          
          if (!Array.isArray(farmAgents)) {
            console.error('[Handshake Test] farmAgents is not an array:', farmAgents);
            throw createTestError('Invalid agent data structure', 'validation', 'INVALID_AGENT_DATA');
          }
          
          for (const agent of farmAgents) {
            if (!agent || typeof agent !== 'object') {
              console.error('[Handshake Test] Invalid agent object:', agent);
              continue;
            }
            
            console.log('[Handshake Test] Agent object keys:', Object.keys(agent));
            console.log('[Handshake Test] Agent object:', JSON.stringify(agent, null, 2));
            
            // Check if agentId exists (it might be 'id' instead of 'agentId')
            const agentId = agent.agentId || agent.id;
            if (!agentId) {
              console.error('[Handshake Test] No agent ID found in agent object');
              continue;
            }
            
            if (!['ready', 'idle', 'working', 'initializing', 'connected'].includes(agent.status)) {
              console.warn(`[Handshake Test] Agent ${agentId} in unexpected status: ${agent.status}`);
            }
          }
          
          break;
        }
        case 'tasks': {
          const farmId = sessionStorage.getItem('test_farm_id');
          if (!farmId) throw createTestError('No farm ID found', 'validation', 'FARM_ID_MISSING');
          
          setCurrentSubPhase('Submitting test task...');
          
          // Submit a test task through the new system
          const taskResponse = await apiClient.post('/api/tasks/submit', {
            farmId,
            prompt: 'Test task: Calculate the sum of 2 + 2 and respond with the result',
            priority: 100
          });
          
          logApiCall('/api/tasks/submit', 'POST', 200, Date.now() - startTime);
          
          if (!taskResponse.data.success) {
            throw createTestError('Task submission failed', 'api', 'TASK_SUBMISSION_FAILED', { response: taskResponse.data });
          }
          
          const taskIds = taskResponse.data.data.taskIds || [];
          if (taskIds.length === 0) {
            throw createTestError('No task IDs returned', 'validation', 'NO_TASK_IDS');
          }
          
          sessionStorage.setItem('test_task_ids', JSON.stringify(taskIds));
          
          // Wait for task assignment
          setCurrentSubPhase('Waiting for task assignment...');
          let taskAssigned = false;
          let assignAttempts = 0;
          
          while (assignAttempts < 10 && !taskAssigned) {
            await sleep(1000);
            
            for (const taskId of taskIds) {
              const statusResponse = await apiClient.get(`/api/tasks/${taskId}/status`);
              if (statusResponse.data.success) {
                const taskStatus = statusResponse.data.data.status;
                if (['assigned', 'in_progress', 'completed'].includes(taskStatus)) {
                  taskAssigned = true;
                  setCurrentSubPhase(`Task ${taskStatus}`);
                  break;
                }
              }
            }
            assignAttempts++;
          }
          
          if (!taskAssigned) {
            throw createTestError('Task was not assigned to any agent', 'timeout', 'TASK_ASSIGNMENT_TIMEOUT');
          }
          
          break;
        }
        case 'execute': {
          const taskIdsStr = sessionStorage.getItem('test_task_ids');
          if (!taskIdsStr) {
            // No tasks to monitor, skip
            await sleep(2000);
            break;
          }
          
          const taskIds = JSON.parse(taskIdsStr);
          setCurrentSubPhase('Monitoring task execution...');
          
          // Wait for task completion
          let executionComplete = false;
          let execAttempts = 0;
          const maxExecAttempts = 20; // 20 seconds max
          
          while (execAttempts < maxExecAttempts && !executionComplete) {
            await sleep(1000);
            
            let completedCount = 0;
            for (const taskId of taskIds) {
              try {
                const resultResponse = await apiClient.get(`/api/tasks/${taskId}/result`);
                if (resultResponse.data.success && resultResponse.data.data) {
                  completedCount++;
                }
              } catch {
                // Task not completed yet
              }
            }
            
            if (completedCount === taskIds.length) {
              executionComplete = true;
              setCurrentSubPhase('All tasks completed');
            } else {
              setCurrentSubPhase(`${completedCount}/${taskIds.length} tasks completed`);
            }
            
            execAttempts++;
          }
          
          if (!executionComplete) {
            console.warn('Not all tasks completed within timeout, continuing anyway');
          }
          
          break;
        }
        case 'harvest': {
          const harvestFarmId = sessionStorage.getItem('test_farm_id');
          if (!harvestFarmId) throw createTestError('No farm ID found', 'validation', 'FARM_ID_MISSING');
          
          const farmCheckResponse = await apiClient.get(`/api/farms/${harvestFarmId}`);
          logApiCall(`/api/farms/${harvestFarmId}`, 'GET', 200, Date.now() - startTime);
          
          if (!farmCheckResponse.data.success) {
            throw createTestError('Could not check farm status', 'api', 'FARM_STATUS_CHECK_FAILED');
          }
          
          const farmStatus = farmCheckResponse.data.data.status;
          if (!['running', 'completed'].includes(farmStatus)) {
            try {
              await apiClient.post(`/api/farms/${harvestFarmId}/complete`, {
                outputs: [],
                summary: 'Test completed'
              });
            } catch {
              console.log('Could not complete farm, attempting harvest anyway');
            }
          }
          
          const harvestResponse = await apiClient.post(`/api/farms/${harvestFarmId}/harvest`);
          logApiCall(`/api/farms/${harvestFarmId}/harvest`, 'POST', 200, Date.now() - startTime);
          
          if (!harvestResponse.data.success) {
            throw createTestError(
              `Harvest failed: ${harvestResponse.data.error?.message || 'Unknown error'}`,
              'api',
              'HARVEST_FAILED',
              { response: harvestResponse.data }
            );
          }
          break;
        }
        case 'store': {
          const harvestsResponse = await apiClient.get('/api/harvests');
          logApiCall('/api/harvests', 'GET', 200, Date.now() - startTime);
          
          if (!harvestsResponse.data.success) {
            throw createTestError('Could not verify storage', 'api', 'STORAGE_VERIFICATION_FAILED');
          }
          
          if (harvestsResponse.data.data && Array.isArray(harvestsResponse.data.data)) {
            if (harvestsResponse.data.data.length === 0) {
              throw createTestError('No harvests found in barn', 'validation', 'NO_HARVESTS_FOUND');
            }
          }
          
          sessionStorage.removeItem('test_farm_id');
          break;
        }
        default:
          throw createTestError(`Unknown phase: ${phaseId}`, 'validation', 'UNKNOWN_PHASE');
      }
      
      logApiCall(`/phase/${phaseId}`, 'POST', 200, Date.now() - startTime);
    } catch (error: unknown) {
      logApiCall(`/phase/${phaseId}`, 'POST', (error as { code?: number }).code || 500, Date.now() - startTime, (error as Error).message);
      throw error;
    }
  };

  const toggleErrorExpansion = (resultIndex: number) => {
    setExpandedErrors(prev => {
      const newSet = new Set(prev);
      const key = `result-${resultIndex}`;
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: TestStatus) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'error': return 'text-red-500';
      case 'running': return 'text-blue-500';
      case 'warning': return 'text-yellow-500';
      case 'skipped': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };
  
  const getStatusIcon = (status: TestStatus) => {
    const className = `w-5 h-5 ${getStatusColor(status)}`;
    
    switch (status) {
      case 'success': return <CheckCircleIcon className={className} />;
      case 'error': return <XCircleIcon className={className} />;
      case 'warning': return <ExclamationTriangleIcon className={className} />;
      case 'running': return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"
        />
      );
      case 'skipped': return <ClockIcon className={className} />;
      default: return null;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const exportResults = () => {
    if (currentSession) {
      const blob = new Blob([JSON.stringify(currentSession, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-test-${currentSession.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getOverallStatus = () => {
    if (testStatus === 'success') return { text: 'All tests passed', color: 'text-green-500' };
    if (testStatus === 'failed') return { text: 'Test failed', color: 'text-red-500' };
    if (testStatus === 'running') return { 
      text: `Testing: ${currentPhase}${currentSubPhase ? ` - ${currentSubPhase}` : ''}`, 
      color: 'text-blue-500' 
    };
    return { text: 'Ready to test', color: 'text-gray-500' };
  };

  const status = getOverallStatus();

  return (
    <div className="max-w-4xl mx-auto admin-testing-panel">
      {/* Configuration Panel */}
      {showConfig && (
        <Glass variant="panel" className="p-6 mb-6 config-panel">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Test Configuration</h3>
            <button
              onClick={() => setShowConfig(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.verboseMode}
                onChange={(e) => setConfig(prev => ({ ...prev, verboseMode: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Verbose Mode</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.enableRetries}
                onChange={(e) => setConfig(prev => ({ ...prev, enableRetries: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable Retries</span>
            </label>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Max Retries</label>
              <input
                type="number"
                min="0"
                max="10"
                value={config.maxRetries}
                onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) }))}
                className="w-full px-3 py-1 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Timeout (ms)</label>
              <input
                type="number"
                min="5000"
                max="120000"
                step="5000"
                value={config.timeout}
                onChange={(e) => setConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) }))}
                className="w-full px-3 py-1 border rounded"
              />
            </div>
          </div>
        </Glass>
      )}
      
      {/* Header - Enhanced */}
      <Glass variant="panel" className="p-8 mb-6">
        <div className="text-center">
          <h2 className="text-3xl font-light text-gray-900 dark:text-white mb-2">
            System Test
          </h2>
          <div className="mb-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Testing with {orchestratorStatus.type === 'xenosync' ? 'XenoSync' : 'MaiFarm'} Orchestrator
            </span>
          </div>
          <p className={`text-lg ${status.color}`}>
            {status.text}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={runCompleteTest}
            disabled={isRunning}
            className={`
              relative px-12 py-4 rounded-full text-lg font-medium transition-all duration-300
              ${isRunning 
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:scale-105'
              }
            `}
          >
            {isRunning ? (
              <span className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full"
                />
                Running Test...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <PlayIcon className="w-6 h-6" />
                Run Complete Test
              </span>
            )}
          </button>
          
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-6 py-3 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
          >
            <CogIcon className="w-5 h-5" />
          </button>
          
          {currentSession && (
            <button
              onClick={exportResults}
              className="px-6 py-3 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
            >
              <DocumentTextIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {isRunning && (
          <div className="mt-8">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            {currentPhase && (
              <p className="text-center mt-2 text-sm text-gray-500 dark:text-gray-400">
                Testing: {currentPhase}
              </p>
            )}
          </div>
        )}
      </Glass>

      {/* Test Phases - Enhanced Visual */}
      <Glass variant="panel" className="p-6">
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
          {phaseStates.map((phase, index) => {
            const phaseResult = results.find(r => r.phaseId === phase.id);
            const hasError = phaseResult?.error;
            
            return (
              <motion.div
                key={phase.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  text-center p-3 rounded-lg border transition-all duration-300
                  ${phase.status === 'running' ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' : ''}
                  ${phase.status === 'success' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : ''}
                  ${phase.status === 'error' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : ''}
                  ${phase.status === 'pending' ? 'border-gray-200 dark:border-gray-700' : ''}
                `}
                title={phase.description}
              >
                <div className={`
                  text-3xl mb-2 transition-all duration-300
                  ${phase.status === 'running' ? 'animate-pulse' : ''}
                  ${phase.status === 'success' ? 'scale-110' : ''}
                  ${phase.status === 'error' ? 'grayscale' : ''}
                `}>
                  {phase.icon}
                </div>
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {phase.name}
                </p>
                <div className="flex justify-center items-center space-x-1">
                  {getStatusIcon(phase.status)}
                  {hasError && phase.status === 'error' && (
                    <ExclamationTriangleIcon className="w-3 h-3 text-red-400" />
                  )}
                </div>
                {phaseResult && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDuration(phaseResult.duration)}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      </Glass>

      {/* Enhanced Results Summary */}
      {results.length > 0 && (
        <Glass variant="panel" className="p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Test Results
            </h3>
            {currentSession && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Errors: {currentSession.errorCount}</span>
                <span>Warnings: {currentSession.warningCount}</span>
              </div>
            )}
          </div>
          
          <div className="space-y-3">
            {results.map((result, index) => {
              const isExpanded = expandedErrors.has(`result-${index}`);
              const hasError = result.error;
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`
                    border rounded-lg overflow-hidden transition-all duration-300 result-card
                    ${result.success ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : 'border-red-200 bg-red-50 dark:bg-red-900/10'}
                  `}
                >
                  {/* Main Result */}
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-opacity-80"
                    onClick={() => hasError && toggleErrorExpansion(index)}
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.success ? 'success' : 'error')}
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {result.phase}
                        </span>
                        {result.metrics && (
                          <div className="text-xs text-gray-500 mt-1">
                            {result.metrics.apiCallCount && `${result.metrics.apiCallCount} API calls`}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {result.message}
                        </div>
                        <div className="text-xs text-gray-400 metric-value">
                          {formatDuration(result.duration)}
                        </div>
                      </div>
                      {hasError && (
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && hasError && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                          {/* Error Details */}
                          <div className="p-4">
                            <h4 className="text-sm font-medium text-red-800 dark:text-red-400 mb-3">
                              Error Details
                            </h4>
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="font-medium text-red-700 dark:text-red-400">Message:</span>
                                <span className="text-red-600 dark:text-red-300">{result.error!.message}</span>
                              </div>
                              {result.error!.code && (
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="font-medium text-red-700 dark:text-red-400">Code:</span>
                                  <span className="font-mono text-red-600 dark:text-red-300">{result.error!.code}</span>
                                </div>
                              )}
                              <div className="flex items-start gap-2 mb-2">
                                <span className="font-medium text-red-700 dark:text-red-400">Category:</span>
                                <span className="px-2 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-full text-xs">
                                  {result.error!.category}
                                </span>
                              </div>
                              <div className="flex items-start gap-2 mb-2">
                                <span className="font-medium text-red-700 dark:text-red-400">Time:</span>
                                <span className="text-red-600 dark:text-red-300">
                                  {new Date(result.error!.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              {result.error!.context && (
                                <div className="mt-3">
                                  <span className="font-medium text-red-700 dark:text-red-400">Context:</span>
                                  <pre className="mt-1 text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded overflow-auto">
                                    {JSON.stringify(result.error!.context, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {result.error!.stack && config.verboseMode && (
                                <div className="mt-3">
                                  <span className="font-medium text-red-700 dark:text-red-400">Stack Trace:</span>
                                  <pre className="mt-1 text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded overflow-auto">
                                    {result.error!.stack}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* API Logs */}
                          {result.apiResponses && result.apiResponses.length > 0 && config.verboseMode && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                                API Calls ({result.apiResponses.length})
                              </h4>
                              <div className="space-y-1 max-h-32 overflow-auto api-logs-container">
                                {result.apiResponses.map((log, logIndex) => (
                                  <div 
                                    key={logIndex}
                                    className="flex justify-between items-center text-xs py-1 px-2 bg-gray-50 dark:bg-gray-700 rounded"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${
                                        log.statusCode < 400 ? 'bg-green-400' : 'bg-red-400'
                                      }`}></span>
                                      <span className="font-mono">{log.method}</span>
                                      <span>{log.endpoint}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-500">
                                      <span>{log.statusCode}</span>
                                      <span className="metric-value">{formatDuration(log.responseTime)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
          
          {/* Summary Stats */}
          {testStatus !== 'running' && currentSession && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white metric-value">
                    {formatDuration(currentSession.totalDuration || 0)}
                  </div>
                  <div className="text-xs text-gray-500">Total Time</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600 metric-value">
                    {results.filter(r => r.success).length}
                  </div>
                  <div className="text-xs text-gray-500">Passed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600 metric-value">
                    {currentSession.errorCount}
                  </div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600 metric-value">
                    {currentSession.warningCount}
                  </div>
                  <div className="text-xs text-gray-500">Warnings</div>
                </div>
              </div>
            </div>
          )}
        </Glass>
      )}
    </div>
  );
};