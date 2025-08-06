import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Text, 
  Line,
  Sphere,
  Trail,
  Environment,
  Effects
} from '@react-three/drei';
import { Vector3, Color, BufferGeometry } from 'three';
// import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { 
  ExplorationNode, 
  ExplorationPath, 
  VisualizationSettings 
} from '../../types/exploration3d';
import { 
  getNodeColor, 
  calculateConnectionCurve,
  createParticleTrail 
} from '../../utils/3dHelpers';
import { GlassPanel } from '../common/GlassPanel';

interface ExplorationVisualization3DProps {
  path: ExplorationPath;
  settings: VisualizationSettings;
  onNodeClick?: (node: ExplorationNode) => void;
  className?: string;
}

interface NodeMeshProps {
  node: ExplorationNode;
  settings: VisualizationSettings;
  onClick?: () => void;
}

const NodeMesh: React.FC<NodeMeshProps> = ({ node, settings, onClick }) => {
  const meshRef = useRef<any>();
  const [hovered, setHovered] = useState(false);
  const color = useMemo(() => getNodeColor(node, settings.colorScheme), [node, settings.colorScheme]);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Pulse effect for active nodes
      if (node.status === 'active') {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
        meshRef.current.scale.setScalar(scale);
      }
      
      // Rotation for hover
      if (hovered) {
        meshRef.current.rotation.y += 0.02;
      }
    }
  });

  return (
    <group position={node.position}>
      <Sphere
        ref={meshRef}
        args={[0.5, 32, 32]}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={node.status === 'active' ? 0.5 : 0.2}
          metalness={0.8}
          roughness={0.2}
        />
      </Sphere>
      
      {settings.showLabels && (
        <Text
          position={[0, 1, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {node.agentName}
        </Text>
      )}
      
      {settings.particleEffects && node.status === 'active' && (
        <Trail
          width={2}
          length={10}
          color={color}
          attenuation={(t) => t * t}
        >
          <mesh>
            <sphereGeometry args={[0.1]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </Trail>
      )}
    </group>
  );
};

interface ConnectionLineProps {
  start: Vector3;
  end: Vector3;
  color?: Color;
  animated?: boolean;
}

const ConnectionLine: React.FC<ConnectionLineProps> = ({ 
  start, 
  end, 
  color = new Color(0x3b82f6),
  animated = true 
}) => {
  const points = useMemo(() => calculateConnectionCurve(start, end), [start, end]);
  const lineRef = useRef<any>();
  
  useFrame((state) => {
    if (lineRef.current && animated) {
      lineRef.current.material.dashOffset = -state.clock.elapsedTime * 2;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={2}
      dashed={animated}
      dashScale={50}
      dashSize={1}
      dashOffset={0}
      transparent
      opacity={0.6}
    />
  );
};

const Scene: React.FC<{ 
  path: ExplorationPath; 
  settings: VisualizationSettings;
  onNodeClick?: (node: ExplorationNode) => void;
}> = ({ path, settings, onNodeClick }) => {
  const { camera } = useThree();
  
  useFrame(() => {
    if (settings.autoRotate && camera) {
      camera.position.x = Math.sin(Date.now() * 0.0001) * 20;
      camera.position.z = Math.cos(Date.now() * 0.0001) * 20;
      camera.lookAt(0, 0, 0);
    }
  });

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
      
      {/* Nodes */}
      {path.nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          settings={settings}
          onClick={() => onNodeClick?.(node)}
        />
      ))}
      
      {/* Connections */}
      {settings.showConnections && path.nodes.map((node) => 
        node.connections.map((targetId) => {
          const targetNode = path.nodes.find(n => n.id === targetId);
          if (!targetNode) return null;
          
          return (
            <ConnectionLine
              key={`${node.id}-${targetId}`}
              start={node.position}
              end={targetNode.position}
              color={new Color(0x3b82f6)}
              animated={node.status === 'active' || targetNode.status === 'active'}
            />
          );
        })
      )}
      
      {/* Grid helper */}
      <gridHelper args={[30, 30, 0x444444, 0x222222]} />
    </>
  );
};

export const ExplorationVisualization3D: React.FC<ExplorationVisualization3DProps> = ({
  path,
  settings,
  onNodeClick,
  className
}) => {
  return (
    <GlassPanel variant="dark" className={cn('relative h-[600px]', className)}>
      <Canvas>
        <PerspectiveCamera makeDefault position={[15, 10, 15]} />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={5}
          maxDistance={50}
        />
        
        <Scene path={path} settings={settings} onNodeClick={onNodeClick} />
        
        {settings.particleEffects && (
          <>{/* <EffectComposer>
            <Bloom 
              intensity={0.5}
              luminanceThreshold={0.5}
              luminanceSmoothing={0.9}
            />
          </EffectComposer> */}</>
        )}
        
        <Environment preset="city" />
      </Canvas>
      
      {/* Performance Overlay */}
      {settings.showResourceMetrics && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 p-4 bg-black/50 backdrop-blur-md rounded-lg text-white"
        >
          <h4 className="text-sm font-semibold mb-2">Performance</h4>
          <div className="space-y-1 text-xs">
            <div>Tasks: {path.metrics.completedTasks}/{path.metrics.totalTasks}</div>
            <div>Efficiency: {path.metrics.resourceEfficiency.toFixed(1)}%</div>
            <div>Avg Time: {path.metrics.averageTaskTime.toFixed(1)}s</div>
          </div>
        </motion.div>
      )}
    </GlassPanel>
  );
};