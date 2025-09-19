import { Vector3, Color } from 'three';
import { ExplorationNode } from '@/types/exploration3d';

export const getNodeColor = (node: ExplorationNode, scheme: string): Color => {
  switch (scheme) {
    case 'status':
      switch (node.status) {
        case 'active': return new Color(0x3b82f6); // blue
        case 'completed': return new Color(0x10b981); // green
        case 'failed': return new Color(0xef4444); // red
        case 'pending': return new Color(0x6b7280); // gray
        default: return new Color(0x6b7280);
      }
    
    case 'taskType':
      switch (node.taskType) {
        case 'exploration': return new Color(0x8b5cf6); // purple
        case 'analysis': return new Color(0x3b82f6); // blue
        case 'generation': return new Color(0x10b981); // green
        case 'validation': return new Color(0xf59e0b); // amber
        case 'execution': return new Color(0xef4444); // red
        default: return new Color(0x6b7280);
      }
    
    case 'performance':
      const efficiency = node.metadata.resourceUsage 
        ? (node.metadata.resourceUsage.cpu + node.metadata.resourceUsage.memory) / 2
        : 50;
      const hue = (1 - efficiency / 100) * 0.33; // green to red
      return new Color().setHSL(hue, 0.8, 0.5);
    
    default:
      // Agent-based coloring
      const agentHash = node.agentId.split('').reduce((acc, char) => 
        acc + char.charCodeAt(0), 0);
      return new Color().setHSL((agentHash % 360) / 360, 0.7, 0.5);
  }
};

export const generateNodePosition = (
  index: number, 
  total: number, 
  radius: number = 10
): Vector3 => {
  const phi = Math.acos(1 - 2 * (index + 0.5) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
};

export const interpolatePosition = (
  from: Vector3,
  to: Vector3,
  progress: number
): Vector3 => {
  return new Vector3().lerpVectors(from, to, progress);
};

export const calculateConnectionCurve = (
  start: Vector3,
  end: Vector3,
  curvature: number = 0.3
): Vector3[] => {
  const midPoint = new Vector3().addVectors(start, end).multiplyScalar(0.5);
  const distance = start.distanceTo(end);
  const perpendicular = new Vector3()
    .subVectors(end, start)
    .cross(new Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(distance * curvature);
  
  const controlPoint = midPoint.clone().add(perpendicular);
  
  // Generate curve points
  const points: Vector3[] = [];
  const segments = 20;
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new Vector3();
    
    // Quadratic Bezier curve
    const oneMinusT = 1 - t;
    point.x = oneMinusT * oneMinusT * start.x + 
              2 * oneMinusT * t * controlPoint.x + 
              t * t * end.x;
    point.y = oneMinusT * oneMinusT * start.y + 
              2 * oneMinusT * t * controlPoint.y + 
              t * t * end.y;
    point.z = oneMinusT * oneMinusT * start.z + 
              2 * oneMinusT * t * controlPoint.z + 
              t * t * end.z;
    
    points.push(point);
  }
  
  return points;
};

export const createParticleTrail = (
  position: Vector3,
  velocity: Vector3,
  count: number = 10
): Vector3[] => {
  const trail: Vector3[] = [];
  
  for (let i = 0; i < count; i++) {
    const offset = velocity.clone().multiplyScalar(-i * 0.1);
    const particlePos = position.clone().add(offset);
    
    // Add some randomness
    particlePos.x += (Math.random() - 0.5) * 0.2;
    particlePos.y += (Math.random() - 0.5) * 0.2;
    particlePos.z += (Math.random() - 0.5) * 0.2;
    
    trail.push(particlePos);
  }
  
  return trail;
};