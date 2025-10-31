import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFarmStore } from '@/store/farmStore';
import { api } from '@/services/apiClient';
import { ConceptExplainerModal } from '../Harvest/ConceptExplainerModal';


export const ConceptExplainer: React.FC = () => {
  const { farmId: paramFarmId, mode } = useParams<{ farmId: string; mode: string }>();
  const navigate = useNavigate();
  const { socket, connected } = useWebSocket();
  const { farms, updateFarm } = useFarmStore();
  const [farmStatus, setFarmStatus] = useState<string>('launching');
  const [showModal, setShowModal] = useState(true);
  const [farmName, setFarmName] = useState<string>();
  const hasRedirected = useRef(false);

  // Use the param farmId directly - React Router should handle this
  const farmId = paramFarmId;

  // Validate farmId and handle missing cases
  useEffect(() => {
    if (!farmId) {
      console.error('[ConceptExplainer] No farmId provided in route params');
      // Give a brief moment for React Router to update
      const timeout = setTimeout(() => {
        if (!farmId) {
          console.error('[ConceptExplainer] Still no farmId after timeout, redirecting to home');
          navigate('/home');
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [farmId, navigate]);

  // Fetch initial farm status
  useEffect(() => {
    if (farmId) {
      // Check if this is an offline/fallback farm
      if (farmId.startsWith('qt-')) {
        console.log('[ConceptExplainer] Offline/fallback farm detected:', farmId);
        setFarmStatus('active');
        setFarmName('Quick Task (Offline)');
        // Proceed immediately for offline farms
        if (!hasRedirected.current) {
          handleFarmActive();
        }
        return;
      }
      
      api.get(`/api/farms/${farmId}`)
        .then(response => {
          const farm = response.data;
          setFarmStatus(farm.status);
          setFarmName(farm.name);
          updateFarm(farmId, { status: farm.status });
          
          // If already active, redirect immediately
          if ((farm.status === 'active' || farm.status === 'running') && !hasRedirected.current) {
            handleFarmActive();
          }
        })
        .catch(error => {
          console.error('Failed to fetch farm status:', error);
          // If API fails but we have a farmId, assume it's offline and proceed
          if (!hasRedirected.current) {
            setFarmStatus('active');
            setFarmName('Quick Task');
            handleFarmActive();
          }
        });
    }
  }, [farmId]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!socket || !connected || !farmId) return;

    const handleFarmStatus = (data: any) => {
      if (data.farmId === farmId) {
        console.log(`[ConceptExplainer] Farm ${farmId} status changed to:`, data.status);
        setFarmStatus(data.status);
        updateFarm(farmId, { status: data.status });
        
        if ((data.status === 'active' || data.status === 'running') && !hasRedirected.current) {
          handleFarmActive();
        }
      }
    };

    const handleAgentStatus = (data: any) => {
      if (data.farmId === farmId && data.status === 'ready') {
        console.log(`[ConceptExplainer] Agent ready in farm ${farmId}`);
        // Check if all agents are ready
        checkFarmReadiness();
      }
    };

    socket.on('farm:status', handleFarmStatus);
    socket.on('agent:status', handleAgentStatus);
    socket.on('agent:updated', handleAgentStatus);

    return () => {
      socket.off('farm:status', handleFarmStatus);
      socket.off('agent:status', handleAgentStatus);
      socket.off('agent:updated', handleAgentStatus);
    };
  }, [socket, connected, farmId]);

  const checkFarmReadiness = async () => {
    if (!farmId) return;
    
    try {
      const response = await api.get(`/api/farms/${farmId}`);
      const farm = response.data;
      
      // Check if farm is ready (active/running with agents)
      if ((farm.status === 'active' || farm.status === 'running') && 
          farm.agents && farm.agents.length > 0) {
        const allAgentsReady = farm.agents.every((agent: any) => 
          agent.status === 'ready' || agent.status === 'running'
        );
        
        if (allAgentsReady && !hasRedirected.current) {
          handleFarmActive();
        }
      }
    } catch (error) {
      console.error('Failed to check farm readiness:', error);
    }
  };

  const handleFarmActive = () => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    
    // Modal will handle the redirect via onContinue
    console.log(`[ConceptExplainer] Farm ${farmId} is active, showing modal`);
  };

  const handleContinue = () => {
    // farmId should now be available from either params or extraction
    if (!farmId) {
      console.error('[ConceptExplainer] No farmId available in handleContinue', {
        mode,
        farmId,
        location: window.location.pathname
      });
      // Should not happen anymore, but fallback to home
      navigate('/home');
      return;
    }
    console.log(`[ConceptExplainer] Continue clicked - farmId: ${farmId}, mode: ${mode}`);
    console.log(`[ConceptExplainer] Navigating to: /harvest/${farmId}`);
    
    // Mark that the modal has been seen to prevent showing it again in HarvestPage
    sessionStorage.setItem(`concept-modal-seen-${farmId}`, 'true');
    
    setShowModal(false);
    // Add a small delay to ensure modal closes before navigation
    setTimeout(() => {
      console.log(`[ConceptExplainer] Executing navigation to /harvest/${farmId}`);
      navigate(`/harvest/${farmId}`);
    }, 100);
  };

  const handleClose = () => {
    setShowModal(false);
    // farmId should now be available from either params or extraction
    if (!farmId) {
      console.error('[ConceptExplainer] No farmId available in handleClose', {
        mode,
        farmId,
        location: window.location.pathname
      });
      // Should not happen anymore, but fallback to home
      navigate('/home');
      return;
    }
    
    // Mark that the modal has been seen to prevent showing it again in HarvestPage
    sessionStorage.setItem(`concept-modal-seen-${farmId}`, 'true');
    
    // Also redirect on close to harvest page
    console.log(`[ConceptExplainer] Modal closed, redirecting to harvest page for farm ${farmId}`);
    // Add a small delay to ensure modal closes before navigation
    setTimeout(() => {
      navigate(`/harvest/${farmId}`);
    }, 100);
  };

  // Remove the automatic redirect on modal close - let the handlers manage it
  // This was causing conflicts with the button handlers

  // Don't render anything if no farmId
  if (!farmId) {
    return null;
  }

  return (
    <ConceptExplainerModal
      isOpen={showModal}
      onClose={handleClose}
      onContinue={handleContinue}
      farmName={farmName}
    />
  );
};