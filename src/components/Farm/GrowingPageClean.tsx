import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketStore } from '../../store/websocketStore';

const growthMessages = [
  "Your farm is sprouting... AI agents are stretching their digital roots!",
  "Watering the neural networks... please wait while your agents bloom!",
  "Applying some algorithmic fertilizer... your harvest will be ready soon!",
  "The AI seeds are germinating... complexity takes time to cultivate!",
  "Your digital crops are photosynthesizing data... almost ready!",
  "Tilling the computational soil... preparing for an abundant harvest!",
  "The farm is growing stronger... patience yields the best results!",
  "Nurturing your AI ecosystem... great things are worth the wait!",
  "Your agents are learning to work together... teamwork makes the dream work!",
  "The harvest moon is rising... your farm will be ready any moment!"
];

export const GrowingPageClean: React.FC = () => {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [currentMessage, setCurrentMessage] = useState(0);
  const [dots, setDots] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const compactorX = useRef(0);
  const hasNavigatedRef = useRef(false);
  
  const { subscribe } = useWebSocketStore();

  // Rotate through messages
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % growthMessages.length);
    }, 4000);

    return () => clearInterval(messageInterval);
  }, []);

  // Animate dots
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  // Listen for harvest ready event
  useEffect(() => {
    if (!farmId) return;

    const handleHarvestReady = (data: any) => {
      console.log('Harvest ready event received:', data);
      
      // Navigate to harvest page when harvest is ready
      if (data.farmId === farmId && !hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        console.log('Navigating to harvest page');
        navigate(`/harvests/${farmId}`, { replace: true });
      }
    };

    // Subscribe to harvest ready event
    const unsubscribe = subscribe('harvest:ready', handleHarvestReady);

    // Also check for any agent output as a trigger
    const handleAgentOutput = (data: any) => {
      if (data.farmId === farmId && !hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        console.log('Agent output detected, navigating to harvest');
        navigate(`/harvests/${farmId}`, { replace: true });
      }
    };

    const unsubscribeAgent = subscribe('agent:output', handleAgentOutput);

    return () => {
      unsubscribe();
      unsubscribeAgent();
    };
  }, [farmId, navigate, subscribe]);

  // Simple canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      canvas.width = 400;
      canvas.height = 300;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw logo placeholder
      ctx.fillStyle = '#10B981';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('MaiFarm', canvas.width / 2, canvas.height / 2);

      // Draw compactor (simple rectangle)
      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(compactorX.current, canvas.height / 2 + 20, 60, 30);

      // Move compactor
      compactorX.current += 2;
      if (compactorX.current > canvas.width) {
        compactorX.current = -60;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-8">
      {/* Farm name */}
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-white">
        Growing Farm
      </h1>

      {/* Canvas Animation */}
      <div className="mb-12 rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-gray-800 p-8">
        <canvas ref={canvasRef} className="block mx-auto" />
      </div>

      {/* Growth message */}
      <div className="text-center max-w-2xl">
        <p className="text-xl text-gray-700 dark:text-gray-300 font-medium mb-2">
          {growthMessages[currentMessage]}
        </p>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Growing your farm{dots}
        </p>
      </div>

      {/* Progress indicators */}
      <div className="mt-12 flex justify-center space-x-8">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
            <span className="text-2xl">🌱</span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Planting</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
            <span className="text-2xl">💧</span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Watering</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-2">
            <span className="text-2xl">☀️</span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Growing</span>
        </div>
      </div>

      {/* Skip button */}
      <div className="mt-12 text-center">
        <button
          onClick={() => navigate(`/harvests/${farmId}`, { replace: true })}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline transition-colors"
        >
          Skip to harvest view →
        </button>
      </div>
    </div>
  );
};