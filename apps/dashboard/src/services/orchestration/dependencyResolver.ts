interface Dependency {
  from: string
  to: string
}

interface DependencyGraph {
  nodes: Set<string>
  edges: Map<string, Set<string>>
  reverseEdges: Map<string, Set<string>>
}

class DependencyResolver {
  buildGraph(nodes: string[], dependencies: Dependency[]): DependencyGraph {
    const graph: DependencyGraph = {
      nodes: new Set(nodes),
      edges: new Map(),
      reverseEdges: new Map()
    }

    // Initialize adjacency lists
    nodes.forEach(node => {
      graph.edges.set(node, new Set())
      graph.reverseEdges.set(node, new Set())
    })

    // Build edges
    dependencies.forEach(dep => {
      if (graph.nodes.has(dep.from) && graph.nodes.has(dep.to)) {
        graph.edges.get(dep.from)!.add(dep.to)
        graph.reverseEdges.get(dep.to)!.add(dep.from)
      }
    })

    return graph
  }

  async detectCycles(nodes: string[], dependencies: Dependency[]): Promise<boolean> {
    const graph = this.buildGraph(nodes, dependencies)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycleDFS = (node: string): boolean => {
      visited.add(node)
      recursionStack.add(node)

      const neighbors = graph.edges.get(node) || new Set()
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleDFS(neighbor)) {
            return true
          }
        } else if (recursionStack.has(neighbor)) {
          return true
        }
      }

      recursionStack.delete(node)
      return false
    }

    for (const node of nodes) {
      if (!visited.has(node)) {
        if (hasCycleDFS(node)) {
          return true
        }
      }
    }

    return false
  }

  async topologicalSort(nodes: string[], dependencies: Dependency[]): Promise<string[]> {
    const graph = this.buildGraph(nodes, dependencies)
    const inDegree = new Map<string, number>()
    const queue: string[] = []
    const sorted: string[] = []

    // Calculate in-degrees
    nodes.forEach(node => {
      inDegree.set(node, (graph.reverseEdges.get(node) || new Set()).size)
    })

    // Find nodes with no dependencies
    nodes.forEach(node => {
      if (inDegree.get(node) === 0) {
        queue.push(node)
      }
    })

    // Process queue
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)

      const neighbors = graph.edges.get(current) || new Set()
      for (const neighbor of neighbors) {
        const degree = inDegree.get(neighbor)! - 1
        inDegree.set(neighbor, degree)
        
        if (degree === 0) {
          queue.push(neighbor)
        }
      }
    }

    if (sorted.length !== nodes.length) {
      throw new Error('Graph contains cycles - topological sort not possible')
    }

    return sorted
  }

  async findDependencies(node: string, nodes: string[], dependencies: Dependency[]): Promise<string[]> {
    const graph = this.buildGraph(nodes, dependencies)
    const deps = new Set<string>()

    const collectDependencies = (current: string) => {
      const predecessors = graph.reverseEdges.get(current) || new Set()
      for (const pred of predecessors) {
        if (!deps.has(pred)) {
          deps.add(pred)
          collectDependencies(pred)
        }
      }
    }

    collectDependencies(node)
    return Array.from(deps)
  }

  async findDependents(node: string, nodes: string[], dependencies: Dependency[]): Promise<string[]> {
    const graph = this.buildGraph(nodes, dependencies)
    const dependents = new Set<string>()

    const collectDependents = (current: string) => {
      const successors = graph.edges.get(current) || new Set()
      for (const succ of successors) {
        if (!dependents.has(succ)) {
          dependents.add(succ)
          collectDependents(succ)
        }
      }
    }

    collectDependents(node)
    return Array.from(dependents)
  }

  async findCriticalPath(
    nodes: string[],
    dependencies: Dependency[],
    nodeDurations: Map<string, number>
  ): Promise<{ path: string[], duration: number }> {
    const graph = this.buildGraph(nodes, dependencies)
    const earliestStart = new Map<string, number>()
    const latestStart = new Map<string, number>()
    const sorted = await this.topologicalSort(nodes, dependencies)

    // Forward pass - calculate earliest start times
    sorted.forEach(node => {
      const predecessors = graph.reverseEdges.get(node) || new Set()
      let maxPredFinish = 0
      
      for (const pred of predecessors) {
        const predFinish = (earliestStart.get(pred) || 0) + (nodeDurations.get(pred) || 0)
        maxPredFinish = Math.max(maxPredFinish, predFinish)
      }
      
      earliestStart.set(node, maxPredFinish)
    })

    // Calculate project duration
    let projectDuration = 0
    sorted.forEach(node => {
      const nodeFinish = (earliestStart.get(node) || 0) + (nodeDurations.get(node) || 0)
      projectDuration = Math.max(projectDuration, nodeFinish)
    })

    // Backward pass - calculate latest start times
    sorted.reverse().forEach(node => {
      const successors = graph.edges.get(node) || new Set()
      
      if (successors.size === 0) {
        // End nodes
        latestStart.set(node, projectDuration - (nodeDurations.get(node) || 0))
      } else {
        let minSuccStart = projectDuration
        for (const succ of successors) {
          minSuccStart = Math.min(minSuccStart, latestStart.get(succ) || projectDuration)
        }
        latestStart.set(node, minSuccStart - (nodeDurations.get(node) || 0))
      }
    })

    // Find critical path (nodes where earliest start = latest start)
    const criticalNodes = nodes.filter(node => 
      earliestStart.get(node) === latestStart.get(node)
    )

    // Build critical path
    const criticalPath: string[] = []
    let current = criticalNodes.find(node => 
      (graph.reverseEdges.get(node) || new Set()).size === 0
    )

    while (current) {
      criticalPath.push(current)
      const successors = Array.from(graph.edges.get(current) || new Set())
      current = successors.find(succ => criticalNodes.includes(succ))
    }

    return {
      path: criticalPath,
      duration: projectDuration
    }
  }

  async detectDeadlocks(
    nodes: string[],
    dependencies: Dependency[],
    resourceRequirements: Map<string, Set<string>>
  ): Promise<{ hasDeadlock: boolean, cycles: string[][] }> {
    // Build resource dependency graph
    const resourceDeps: Dependency[] = []
    const nodesByResource = new Map<string, Set<string>>()

    // Group nodes by resources they require
    resourceRequirements.forEach((resources, node) => {
      resources.forEach(resource => {
        if (!nodesByResource.has(resource)) {
          nodesByResource.set(resource, new Set())
        }
        nodesByResource.get(resource)!.add(node)
      })
    })

    // Create dependencies based on resource conflicts
    nodesByResource.forEach(nodesSet => {
      const nodesList = Array.from(nodesSet)
      for (let i = 0; i < nodesList.length; i++) {
        for (let j = i + 1; j < nodesList.length; j++) {
          // If two nodes require the same resource, they depend on each other
          resourceDeps.push({ from: nodesList[i], to: nodesList[j] })
          resourceDeps.push({ from: nodesList[j], to: nodesList[i] })
        }
      }
    })

    // Combine with existing dependencies
    const allDeps = [...dependencies, ...resourceDeps]
    
    // Detect cycles in combined graph
    const hasCycles = await this.detectCycles(nodes, allDeps)
    
    const cycles: string[][] = []
    if (hasCycles) {
      // Find specific cycles
      const graph = this.buildGraph(nodes, allDeps)
      const visited = new Set<string>()
      const path: string[] = []

      const findCyclesDFS = (node: string): void => {
        if (path.includes(node)) {
          const cycleStart = path.indexOf(node)
          cycles.push(path.slice(cycleStart))
          return
        }

        if (visited.has(node)) return

        visited.add(node)
        path.push(node)

        const neighbors = graph.edges.get(node) || new Set()
        for (const neighbor of neighbors) {
          findCyclesDFS(neighbor)
        }

        path.pop()
      }

      nodes.forEach(node => {
        if (!visited.has(node)) {
          findCyclesDFS(node)
        }
      })
    }

    return { hasDeadlock: hasCycles, cycles }
  }

  async optimizeExecutionOrder(
    nodes: string[],
    dependencies: Dependency[],
    constraints: {
      maxParallel?: number
      resourceLimits?: Map<string, number>
      nodePriorities?: Map<string, number>
    }
  ): Promise<string[][]> {
    const graph = this.buildGraph(nodes, dependencies)
    const levels: string[][] = []
    const assigned = new Set<string>()
    const inDegree = new Map<string, number>()

    // Calculate in-degrees
    nodes.forEach(node => {
      inDegree.set(node, (graph.reverseEdges.get(node) || new Set()).size)
    })

    // Priority queue for node selection
    const priorityCompare = (a: string, b: string): number => {
      const priorityA = constraints.nodePriorities?.get(a) || 0
      const priorityB = constraints.nodePriorities?.get(b) || 0
      return priorityB - priorityA
    }

    while (assigned.size < nodes.length) {
      // Find nodes that can be executed in this level
      const available = nodes.filter(node => 
        !assigned.has(node) && inDegree.get(node) === 0
      ).sort(priorityCompare)

      if (available.length === 0 && assigned.size < nodes.length) {
        throw new Error('Circular dependency detected')
      }

      // Apply parallel execution limit
      const level = constraints.maxParallel 
        ? available.slice(0, constraints.maxParallel)
        : available

      levels.push(level)

      // Update graph for next iteration
      level.forEach(node => {
        assigned.add(node)
        const neighbors = graph.edges.get(node) || new Set()
        neighbors.forEach(neighbor => {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1)
        })
      })
    }

    return levels
  }

  async findBottlenecks(
    nodes: string[],
    dependencies: Dependency[],
    nodeDurations: Map<string, number>
  ): Promise<{ node: string, impact: number }[]> {
    const bottlenecks: { node: string, impact: number }[] = []
    const originalCriticalPath = await this.findCriticalPath(nodes, dependencies, nodeDurations)

    // Test impact of reducing each node's duration
    for (const node of nodes) {
      const originalDuration = nodeDurations.get(node) || 0
      if (originalDuration === 0) continue

      // Reduce duration by 10%
      nodeDurations.set(node, originalDuration * 0.9)
      
      const newCriticalPath = await this.findCriticalPath(nodes, dependencies, nodeDurations)
      const impact = originalCriticalPath.duration - newCriticalPath.duration

      if (impact > 0) {
        bottlenecks.push({ node, impact })
      }

      // Restore original duration
      nodeDurations.set(node, originalDuration)
    }

    // Sort by impact (descending)
    return bottlenecks.sort((a, b) => b.impact - a.impact)
  }
}

export const dependencyResolver = new DependencyResolver()