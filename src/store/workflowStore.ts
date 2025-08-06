import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  Workflow,
  WorkflowExecution,
  WorkflowNode,
  WorkflowEdge
} from '../types/orchestration'

interface WorkflowBuilderState {
  // Canvas state
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  isValidGraph: boolean
  validationErrors: string[]

  // Actions
  addNode: (node: WorkflowNode) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void
  removeNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void

  addEdge: (edge: WorkflowEdge) => void
  updateEdge: (edgeId: string, updates: Partial<WorkflowEdge>) => void
  removeEdge: (edgeId: string) => void
  selectEdge: (edgeId: string | null) => void

  loadWorkflow: (workflow: Workflow) => void
  clearCanvas: () => void
  validateGraph: () => void

  // Node position updates
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  
  // Batch operations
  deleteSelected: () => void
  duplicateSelected: () => void
  
  // Export/Import
  exportWorkflow: () => Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>
  importWorkflow: (definition: WorkflowDefinition) => void
}

interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables?: Record<string, any>
  triggers?: any[]
}

export const useWorkflowStore = create<WorkflowBuilderState>()(
  devtools(
    (set, get) => ({
      // Initial state
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      isValidGraph: true,
      validationErrors: [],

      // Node actions
      addNode: (node) => {
        set((state) => ({
          nodes: [...state.nodes, node],
          selectedNodeId: node.id
        }))
        get().validateGraph()
      },

      updateNode: (nodeId, updates) => {
        set((state) => ({
          nodes: state.nodes.map(node =>
            node.id === nodeId ? { ...node, ...updates } : node
          )
        }))
        get().validateGraph()
      },

      removeNode: (nodeId) => {
        set((state) => ({
          nodes: state.nodes.filter(node => node.id !== nodeId),
          edges: state.edges.filter(edge => 
            edge.source !== nodeId && edge.target !== nodeId
          ),
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
        }))
        get().validateGraph()
      },

      selectNode: (nodeId) => set({ 
        selectedNodeId: nodeId,
        selectedEdgeId: null 
      }),

      // Edge actions
      addEdge: (edge) => {
        const state = get()
        // Prevent duplicate edges
        const exists = state.edges.some(e => 
          e.source === edge.source && e.target === edge.target
        )
        
        if (!exists) {
          set((state) => ({
            edges: [...state.edges, edge],
            selectedEdgeId: edge.id
          }))
          get().validateGraph()
        }
      },

      updateEdge: (edgeId, updates) => {
        set((state) => ({
          edges: state.edges.map(edge =>
            edge.id === edgeId ? { ...edge, ...updates } : edge
          )
        }))
        get().validateGraph()
      },

      removeEdge: (edgeId) => {
        set((state) => ({
          edges: state.edges.filter(edge => edge.id !== edgeId),
          selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId
        }))
        get().validateGraph()
      },

      selectEdge: (edgeId) => set({ 
        selectedEdgeId: edgeId,
        selectedNodeId: null 
      }),

      // Canvas operations
      loadWorkflow: (workflow) => {
        set({
          nodes: workflow.definition.nodes,
          edges: workflow.definition.edges,
          selectedNodeId: null,
          selectedEdgeId: null
        })
        get().validateGraph()
      },

      clearCanvas: () => set({
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        isValidGraph: true,
        validationErrors: []
      }),

      validateGraph: () => {
        const state = get()
        const errors: string[] = []
        
        // Check for orphaned nodes
        const nodesWithIncoming = new Set(state.edges.map(e => e.target))
        const nodesWithOutgoing = new Set(state.edges.map(e => e.source))
        
        state.nodes.forEach(node => {
          // Start nodes should not have incoming edges
          if (node.type === 'task' && !nodesWithIncoming.has(node.id) && !nodesWithOutgoing.has(node.id) && state.nodes.length > 1) {
            errors.push(`Node "${node.name}" is disconnected`)
          }
        })
        
        // Check for cycles
        if (hasCycles(state.nodes, state.edges)) {
          errors.push('Workflow contains circular dependencies')
        }
        
        // Check for invalid edge connections
        state.edges.forEach(edge => {
          const sourceNode = state.nodes.find(n => n.id === edge.source)
          const targetNode = state.nodes.find(n => n.id === edge.target)
          
          if (!sourceNode || !targetNode) {
            errors.push('Invalid edge connection')
          }
        })
        
        set({
          isValidGraph: errors.length === 0,
          validationErrors: errors
        })
      },

      // Node position update
      updateNodePosition: (nodeId, position) => {
        set((state) => ({
          nodes: state.nodes.map(node =>
            node.id === nodeId ? { ...node, position } : node
          )
        }))
      },

      // Batch operations
      deleteSelected: () => {
        const state = get()
        if (state.selectedNodeId) {
          state.removeNode(state.selectedNodeId)
        } else if (state.selectedEdgeId) {
          state.removeEdge(state.selectedEdgeId)
        }
      },

      duplicateSelected: () => {
        const state = get()
        if (state.selectedNodeId) {
          const node = state.nodes.find(n => n.id === state.selectedNodeId)
          if (node) {
            const newNode: WorkflowNode = {
              ...node,
              id: `${node.id}-copy-${Date.now()}`,
              name: `${node.name} (Copy)`,
              position: {
                x: node.position.x + 50,
                y: node.position.y + 50
              }
            }
            state.addNode(newNode)
          }
        }
      },

      // Export/Import
      exportWorkflow: () => {
        const state = get()
        return {
          name: 'Untitled Workflow',
          farmId: '',
          status: 'draft' as const,
          definition: {
            version: '1.0.0',
            nodes: state.nodes,
            edges: state.edges,
            variables: {},
            triggers: []
          }
        }
      },

      importWorkflow: (definition) => {
        set({
          nodes: definition.nodes || [],
          edges: definition.edges || [],
          selectedNodeId: null,
          selectedEdgeId: null
        })
        get().validateGraph()
      }
    })
  )
)

// Helper function to detect cycles in the graph
function hasCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adjacencyList = new Map<string, string[]>()
  
  // Build adjacency list
  nodes.forEach(node => adjacencyList.set(node.id, []))
  edges.forEach(edge => {
    const neighbors = adjacencyList.get(edge.source) || []
    neighbors.push(edge.target)
    adjacencyList.set(edge.source, neighbors)
  })
  
  // DFS to detect cycles
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  
  const hasCycleDFS = (nodeId: string): boolean => {
    visited.add(nodeId)
    recursionStack.add(nodeId)
    
    const neighbors = adjacencyList.get(nodeId) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycleDFS(neighbor)) return true
      } else if (recursionStack.has(neighbor)) {
        return true
      }
    }
    
    recursionStack.delete(nodeId)
    return false
  }
  
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycleDFS(node.id)) return true
    }
  }
  
  return false
}