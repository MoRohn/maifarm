import { WorkflowNode, WorkflowEdge } from '@/types/workflow';

interface DependencyGraph {
  nodes: Map<string, Set<string>>; // nodeId -> set of dependencies
  reverseDependencies: Map<string, Set<string>>; // nodeId -> set of dependents
}

class DependencyManager {
  buildDependencyGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    // Initialize all nodes
    nodes.forEach(node => {
      graph.set(node.id, new Set<string>());
    });
    
    // Build reverse dependency map (target -> sources)
    edges.forEach(edge => {
      if (!graph.has(edge.target)) {
        graph.set(edge.target, new Set<string>());
      }
      graph.get(edge.target)!.add(edge.source);
    });
    
    return graph;
  }

  getDependencies(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges
      .filter(edge => edge.target === nodeId)
      .map(edge => edge.source);
  }

  getDependents(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges
      .filter(edge => edge.source === nodeId)
      .map(edge => edge.target);
  }

  detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const dependents = this.getDependents(nodeId, edges);
      
      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          if (hasCycleDFS(dependent)) {
            return true;
          }
        } else if (recursionStack.has(dependent)) {
          // Found a cycle
          const cycleStart = path.indexOf(dependent);
          return true;
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) {
          return path;
        }
      }
    }

    return null;
  }

  topologicalSort(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): string[] | null {
    const graph = this.buildDependencyGraph(nodes, edges);
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const sorted: string[] = [];

    // Calculate in-degree for each node
    nodes.forEach(node => {
      inDegree.set(node.id, graph.get(node.id)?.size || 0);
    });

    // Find nodes with no dependencies
    nodes.forEach(node => {
      if (inDegree.get(node.id) === 0) {
        queue.push(node.id);
      }
    });

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);

      // Reduce in-degree for dependent nodes
      const dependents = this.getDependents(nodeId, edges);
      dependents.forEach(dependent => {
        const degree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, degree);
        
        if (degree === 0) {
          queue.push(dependent);
        }
      });
    }

    // Check if all nodes were processed (no cycles)
    return sorted.length === nodes.length ? sorted : null;
  }

  findCriticalPath(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    startNodeId: string,
    endNodeId: string
  ): { path: string[]; duration: number } | null {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    
    // Initialize distances
    nodes.forEach(node => {
      distances.set(node.id, node.id === startNodeId ? 0 : -Infinity);
      previous.set(node.id, null);
    });

    // Topological sort
    const sorted = this.topologicalSort(nodes, edges);
    if (!sorted) {
      return null; // Cycle detected
    }

    // Calculate longest path
    for (const nodeId of sorted) {
      const currentDistance = distances.get(nodeId)!;
      const dependents = this.getDependents(nodeId, edges);
      
      dependents.forEach(dependent => {
        const node = nodeMap.get(dependent);
        const weight = this.getNodeWeight(node); // Estimate execution time
        const newDistance = currentDistance + weight;
        
        if (newDistance > distances.get(dependent)!) {
          distances.set(dependent, newDistance);
          previous.set(dependent, nodeId);
        }
      });
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | null = endNodeId;
    
    while (current !== null) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    if (path[0] !== startNodeId) {
      return null; // No path found
    }

    return {
      path,
      duration: distances.get(endNodeId) || 0
    };
  }

  getExecutionOrder(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): string[][] {
    const levels: string[][] = [];
    const graph = this.buildDependencyGraph(nodes, edges);
    const processed = new Set<string>();

    while (processed.size < nodes.length) {
      const currentLevel: string[] = [];

      nodes.forEach(node => {
        if (processed.has(node.id)) return;

        const dependencies = graph.get(node.id) || new Set();
        const allDependenciesProcessed = Array.from(dependencies)
          .every(dep => processed.has(dep));

        if (allDependenciesProcessed) {
          currentLevel.push(node.id);
        }
      });

      if (currentLevel.length === 0) {
        // Remaining nodes have circular dependencies
        break;
      }

      currentLevel.forEach(nodeId => processed.add(nodeId));
      levels.push(currentLevel);
    }

    return levels;
  }

  canExecuteInParallel(
    nodeId1: string,
    nodeId2: string,
    edges: WorkflowEdge[]
  ): boolean {
    // Check if there's a dependency path between the nodes
    const visited = new Set<string>();
    const queue = [nodeId1];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current === nodeId2) {
        return false; // nodeId1 depends on nodeId2
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const dependencies = this.getDependencies(current, edges);
      queue.push(...dependencies);
    }

    // Check reverse direction
    visited.clear();
    queue.push(nodeId2);

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current === nodeId1) {
        return false; // nodeId2 depends on nodeId1
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const dependencies = this.getDependencies(current, edges);
      queue.push(...dependencies);
    }

    return true; // No dependency between nodes
  }

  findIndependentSets(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): string[][] {
    const independentSets: string[][] = [];
    const remaining = new Set(nodes.map(n => n.id));

    while (remaining.size > 0) {
      const currentSet: string[] = [];
      const candidates = Array.from(remaining);

      for (const nodeId of candidates) {
        const canAdd = currentSet.every(existingNode =>
          this.canExecuteInParallel(nodeId, existingNode, edges)
        );

        if (canAdd) {
          currentSet.push(nodeId);
          remaining.delete(nodeId);
        }
      }

      if (currentSet.length > 0) {
        independentSets.push(currentSet);
      } else {
        // Handle remaining nodes that couldn't be grouped
        const leftover = Array.from(remaining);
        if (leftover.length > 0) {
          independentSets.push([leftover[0]]);
          remaining.delete(leftover[0]);
        }
      }
    }

    return independentSets;
  }

  validateDependencies(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // Check for edges referencing non-existent nodes
    edges.forEach(edge => {
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    });

    // Check for cycles
    const cycle = this.detectCycles(nodes, edges);
    if (cycle) {
      errors.push(`Cycle detected in workflow: ${cycle.join(' -> ')}`);
    }

    // Check for unreachable nodes
    const startNodes = nodes.filter(n => n.type === 'start');
    if (startNodes.length === 0) {
      errors.push('No start node found in workflow');
    } else {
      const reachable = this.findReachableNodes(startNodes[0].id, edges);
      nodes.forEach(node => {
        if (!reachable.has(node.id) && node.type !== 'start') {
          errors.push(`Node ${node.id} is unreachable from start`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private findReachableNodes(
    startNodeId: string,
    edges: WorkflowEdge[]
  ): Set<string> {
    const reachable = new Set<string>([startNodeId]);
    const queue = [startNodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = this.getDependents(current, edges);

      dependents.forEach(dependent => {
        if (!reachable.has(dependent)) {
          reachable.add(dependent);
          queue.push(dependent);
        }
      });
    }

    return reachable;
  }

  private getNodeWeight(node?: WorkflowNode): number {
    // Estimate execution time based on node type
    if (!node) return 0;

    switch (node.type) {
      case 'task':
        return 5000; // 5 seconds
      case 'decision':
        return 100; // 0.1 seconds
      case 'wait':
        return node.data.config?.duration || 1000;
      case 'parallel':
        return 500; // 0.5 seconds overhead
      case 'loop':
        return 2000; // 2 seconds per iteration estimate
      default:
        return 1000; // 1 second default
    }
  }
}

export const dependencyManager = new DependencyManager();
export { DependencyManager };