/**
 * Terminal Demo Page
 *
 * Demonstrates the Advanced Terminal System
 */

import React, { useEffect } from 'react';
import { AdvancedTerminalShowcase } from '@/components/Terminal/AdvancedTerminalShowcase';
import { useAdvancedTerminal } from '@/hooks/useAdvancedTerminal';

export const TerminalDemo: React.FC = () => {
  const sessionId = 'demo-session-' + Date.now();

  // Create demo agents
  const agents = [
    { sessionId, agentId: 1, agentName: 'Agent 1 - Builder' },
    { sessionId, agentId: 2, agentName: 'Agent 2 - Tester' },
    { sessionId, agentId: 3, agentName: 'Agent 3 - Reviewer' },
  ];

  const { pushContent, isReady } = useAdvancedTerminal({
    sessionId,
    agentIds: agents.map((a) => a.agentId),
    autoStart: true,
    streamConfig: {
      targetFPS: 30,
      adaptiveQuality: true,
    },
  });

  // Simulate terminal output for demo
  useEffect(() => {
    if (!isReady) return;

    let lineCount = 0;

    const interval = setInterval(() => {
      const agentId = (lineCount % 3) + 1;
      const messages = [
        `[${new Date().toISOString()}] Processing task #${lineCount}...`,
        `[INFO] Running command: npm test`,
        `[SUCCESS] Tests passed (${Math.floor(Math.random() * 100)}%)`,
        `[DEBUG] Memory usage: ${Math.floor(Math.random() * 500)}MB`,
        `[WARN] Deprecation warning in dependency`,
        `> Building production bundle...`,
        `✓ Compiled successfully in ${Math.floor(Math.random() * 5000)}ms`,
        `[Agent ${agentId}] Task completed`,
      ];

      const message = messages[Math.floor(Math.random() * messages.length)];
      pushContent(agentId, message + '\n');

      lineCount++;

      // Stop after 100 lines per agent
      if (lineCount > 300) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, pushContent]);

  return (
    <div className="h-screen w-full bg-gray-950">
      <AdvancedTerminalShowcase sessionId={sessionId} agents={agents} />
    </div>
  );
};
