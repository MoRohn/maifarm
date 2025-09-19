"""
ReapAgents State Management
Extends deepagents state with MaiFarm-specific features
"""

from typing import Dict, List, Optional, Literal, Annotated, NotRequired, Any
from typing_extensions import TypedDict
from datetime import datetime
from dataclasses import dataclass, field

try:
    from langgraph.prebuilt.chat_agent_executor import AgentState
except ImportError:
    # Fallback for when langgraph is not installed
    class AgentState(TypedDict):
        messages: List[Dict[str, Any]]

class Todo(TypedDict):
    """Enhanced todo with MaiFarm integration"""
    id: str
    content: str
    status: Literal["pending", "in_progress", "completed"]
    agent_id: NotRequired[str]
    created_at: NotRequired[str]
    completed_at: NotRequired[str]
    dependencies: NotRequired[List[str]]
    priority: NotRequired[Literal["low", "medium", "high", "critical"]]

class AgentInfo(TypedDict):
    """Information about an agent in the farm"""
    agent_id: str
    name: str
    type: Literal["main", "sub", "specialist"]
    status: Literal["idle", "planning", "working", "reviewing", "completed", "error"]
    current_task: NotRequired[str]
    specialization: NotRequired[str]

class HarvestData(TypedDict):
    """Harvest collection data"""
    harvest_id: str
    farm_id: str
    files: Dict[str, str]
    artifacts: List[str]
    timestamp: str

class BarnReference(TypedDict):
    """Reference to barn items"""
    item_id: str
    item_type: Literal["template", "resource", "artifact", "knowledge"]
    path: str
    metadata: NotRequired[Dict[str, Any]]

def file_reducer(l, r):
    """Merge file dictionaries"""
    if l is None:
        return r
    elif r is None:
        return l
    else:
        return {**l, **r}

def barn_reducer(l, r):
    """Merge barn references"""
    if l is None:
        return r
    elif r is None:
        return l
    else:
        # Merge lists, avoiding duplicates
        merged = list(l)
        for item in r:
            if item not in merged:
                merged.append(item)
        return merged

class ReapAgentState(AgentState):
    """Base state for ReapAgents with enhanced capabilities"""
    todos: NotRequired[List[Todo]]
    files: Annotated[NotRequired[Dict[str, str]], file_reducer]
    agents: NotRequired[List[AgentInfo]]
    current_phase: NotRequired[Literal["planning", "execution", "review", "completion"]]
    plan: NotRequired[str]
    memory: NotRequired[Dict[str, Any]]
    workspace_path: NotRequired[str]
    coordination_data: NotRequired[Dict[str, Any]]

class MaiFarmState(ReapAgentState):
    """MaiFarm-specific state with full integration"""
    farm_id: str
    harvest_id: NotRequired[str]
    barn_references: Annotated[NotRequired[List[BarnReference]], barn_reducer]
    harvest_data: NotRequired[HarvestData]
    farmer_template: NotRequired[str]
    provider: NotRequired[Literal["claude", "openai", "qwen", "ollama"]]
    metrics: NotRequired[Dict[str, Any]]
    terminal_outputs: NotRequired[Dict[str, List[str]]]
    workspace_files: NotRequired[Dict[str, str]]
    shared_knowledge: NotRequired[Dict[str, Any]]
    execution_timeout: NotRequired[int]
    graceful_shutdown: NotRequired[bool]

@dataclass
class AgentMemory:
    """Persistent memory for agents"""
    agent_id: str
    memories: List[Dict[str, Any]] = field(default_factory=list)
    learned_patterns: Dict[str, Any] = field(default_factory=dict)
    task_history: List[Dict[str, Any]] = field(default_factory=list)
    performance_metrics: Dict[str, float] = field(default_factory=dict)
    
    def add_memory(self, memory_type: str, content: Any, importance: float = 0.5):
        """Add a new memory with importance scoring"""
        self.memories.append({
            "type": memory_type,
            "content": content,
            "importance": importance,
            "timestamp": datetime.now().isoformat(),
            "agent_id": self.agent_id
        })
    
    def get_relevant_memories(self, context: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Retrieve memories relevant to the current context"""
        # Simple implementation - can be enhanced with vector similarity
        sorted_memories = sorted(
            self.memories, 
            key=lambda m: m.get("importance", 0), 
            reverse=True
        )
        return sorted_memories[:limit]
    
    def update_performance(self, metric: str, value: float):
        """Update performance metrics"""
        if metric not in self.performance_metrics:
            self.performance_metrics[metric] = value
        else:
            # Exponential moving average
            alpha = 0.3
            self.performance_metrics[metric] = (
                alpha * value + (1 - alpha) * self.performance_metrics[metric]
            )

@dataclass
class ExecutionContext:
    """Context for agent execution"""
    farm_id: str
    workspace_path: str
    coordination_path: str
    barn_path: str
    harvest_path: str
    timeout: int = 300000  # 5 minutes default
    debug: bool = False
    provider: str = "claude"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "farm_id": self.farm_id,
            "workspace_path": self.workspace_path,
            "coordination_path": self.coordination_path,
            "barn_path": self.barn_path,
            "harvest_path": self.harvest_path,
            "timeout": self.timeout,
            "debug": self.debug,
            "provider": self.provider
        }