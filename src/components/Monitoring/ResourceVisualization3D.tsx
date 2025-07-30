import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Environment,
  Text,
  Box,
  Sphere,
  Cylinder,
  Line,
  Billboard,
  Float
} from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion-3d';
import { ResourceMetrics, AgentMonitoringData } from '../../types/monitoring';
import { clsx } from 'clsx';

interface ResourceVisualization3DProps {
  metrics: ResourceMetrics;
  agents: AgentMonitoringData[];
  className?: string;
}

export const ResourceVisualization3D: React.FC<ResourceVisualization3DProps> = ({ 
  metrics, 
  agents,
  className 
}) => {
  return (
    <div className={clsx('w-full h-[500px] rounded-apple-xl overflow-hidden bg-gray-900', className)}>
      <Canvas>
        <Suspense fallback={<LoadingFallback />}>
          <Scene metrics={metrics} agents={agents} />
        </Suspense>
      </Canvas>
    </div>
  );
};

const Scene: React.FC<{ metrics: ResourceMetrics; agents: AgentMonitoringData[] }> = ({ 
  metrics, 
  agents 
}) => {
  const { camera } = useThree();

  return (
    <>
      <PerspectiveCamera makeDefault position={[10, 10, 10]} />
      <OrbitControls 
        enablePan={true} 
        enableZoom={true} 
        enableRotate={true}
        minDistance={5}
        maxDistance={30}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      {/* Environment */}
      <Environment preset="city" />
      
      {/* Grid */}
      <gridHelper args={[20, 20, 0x444444, 0x222222]} />
      
      {/* Central Resource Overview */}
      <CentralResourceSphere metrics={metrics} />
      
      {/* Agent Nodes */}
      {agents.map((agent, index) => (
        <AgentNode
          key={agent.id}
          agent={agent}
          position={calculateAgentPosition(index, agents.length)}
        />
      ))}
      
      {/* Resource Flow Lines */}
      <ResourceFlowLines agents={agents} />
      
      {/* Labels and UI */}
      <UIOverlay metrics={metrics} />
    </>
  );
};

const CentralResourceSphere: React.FC<{ metrics: ResourceMetrics }> = ({ metrics }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
    if (materialRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 0.9;
      materialRef.current.emissiveIntensity = pulse;
    }
  });

  const cpuColor = getResourceColor(metrics.overall.cpu);
  const memoryColor = getResourceColor(metrics.overall.memory);
  const networkColor = getResourceColor(metrics.overall.network);

  return (
    <group position={[0, 2, 0]}>
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
        <motion.mesh
          ref={meshRef}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <sphereGeometry args={[2, 32, 32]} />
          <meshStandardMaterial
            ref={materialRef}
            color={cpuColor}
            emissive={cpuColor}
            emissiveIntensity={0.5}
            metalness={0.7}
            roughness={0.3}
            transparent
            opacity={0.8}
          />
        </motion.mesh>
      </Float>
      
      {/* Resource Indicators */}
      <ResourceIndicator
        type="CPU"
        value={metrics.overall.cpu}
        position={[0, 3.5, 0]}
        color={cpuColor}
      />
      <ResourceIndicator
        type="Memory"
        value={metrics.overall.memory}
        position={[-2.5, 2, 0]}
        color={memoryColor}
      />
      <ResourceIndicator
        type="Network"
        value={metrics.overall.network}
        position={[2.5, 2, 0]}
        color={networkColor}
      />
    </group>
  );
};

const AgentNode: React.FC<{ agent: AgentMonitoringData; position: [number, number, number] }> = ({ 
  agent, 
  position 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const isActive = agent.status === 'working';
  
  useFrame((state) => {
    if (meshRef.current && isActive) {
      meshRef.current.rotation.y += 0.02;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  const statusColor = {
    idle: '#6B7280',
    working: '#3B82F6',
    completed: '#10B981',
    error: '#EF4444',
    paused: '#F59E0B'
  }[agent.status];

  return (
    <group position={position}>
      <motion.mesh
        ref={meshRef}
        animate={isActive ? { rotateY: Math.PI * 2 } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={isActive ? 0.5 : 0.2}
          metalness={0.5}
          roughness={0.5}
        />
      </motion.mesh>
      
      {/* Agent Label */}
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 1.5, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {agent.name}
        </Text>
      </Billboard>
      
      {/* Resource Usage Bars */}
      <ResourceBar
        value={agent.cpu}
        position={[-0.6, 0, 0]}
        color="#3B82F6"
        label="CPU"
      />
      <ResourceBar
        value={agent.memory}
        position={[0, 0, 0]}
        color="#8B5CF6"
        label="MEM"
      />
      <ResourceBar
        value={agent.resources.network}
        position={[0.6, 0, 0]}
        color="#10B981"
        label="NET"
      />
    </group>
  );
};

const ResourceBar: React.FC<{
  value: number;
  position: [number, number, number];
  color: string;
  label: string;
}> = ({ value, position, color, label }) => {
  const height = (value / 100) * 2;
  
  return (
    <group position={position}>
      <Cylinder args={[0.1, 0.1, height, 8]} position={[0, height / 2 - 1, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </Cylinder>
      <Text
        position={[0, -1.3, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
      >
        {label}
      </Text>
    </group>
  );
};

const ResourceIndicator: React.FC<{
  type: string;
  value: number;
  position: [number, number, number];
  color: string;
}> = ({ type, value, position, color }) => {
  return (
    <Billboard position={position}>
      <group>
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.4}
          color={color}
          anchorX="center"
          anchorY="middle"
        >
          {value}%
        </Text>
        <Text
          position={[0, -0.1, 0]}
          fontSize={0.2}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {type}
        </Text>
      </group>
    </Billboard>
  );
};

const ResourceFlowLines: React.FC<{ agents: AgentMonitoringData[] }> = ({ agents }) => {
  const activeAgents = agents.filter(a => a.status === 'working');
  
  return (
    <>
      {activeAgents.map((agent, index) => {
        const agentPos = calculateAgentPosition(
          agents.findIndex(a => a.id === agent.id),
          agents.length
        );
        const points = [
          new THREE.Vector3(0, 2, 0),
          new THREE.Vector3(agentPos[0], agentPos[1], agentPos[2])
        ];
        
        return (
          <Line
            key={agent.id}
            points={points}
            color="#3B82F6"
            lineWidth={1}
            dashed
            dashScale={5}
            transparent
            opacity={0.5}
          />
        );
      })}
    </>
  );
};

const UIOverlay: React.FC<{ metrics: ResourceMetrics }> = ({ metrics }) => {
  return (
    <Billboard position={[0, 5, 0]}>
      <group>
        <Text
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          System Resources
        </Text>
        <Text
          position={[0, -0.6, 0]}
          fontSize={0.3}
          color="#9CA3AF"
          anchorX="center"
          anchorY="middle"
        >
          {metrics.predictions.cpuTrend} CPU • {metrics.predictions.memoryTrend} Memory
        </Text>
      </group>
    </Billboard>
  );
};

const LoadingFallback: React.FC = () => {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4B5563" />
    </mesh>
  );
};

// Helper functions
function calculateAgentPosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2;
  const radius = 6;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return [x, 0.5, z];
}

function getResourceColor(value: number): string {
  if (value < 30) return '#10B981';
  if (value < 60) return '#F59E0B';
  if (value < 80) return '#F97316';
  return '#EF4444';
}