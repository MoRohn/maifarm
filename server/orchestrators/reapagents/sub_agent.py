"""
ReapAgents Sub-Agent Definitions
Specialized sub-agents for different tasks in the MaiFarm ecosystem
"""

from typing import Dict, List, Optional, TypedDict, NotRequired, Any
from dataclasses import dataclass

try:
    from langchain_core.tools import tool, InjectedToolCallId, BaseTool
    from langchain_core.messages import ToolMessage
    from typing import Annotated
    from langgraph.types import Command
    from langgraph.prebuilt import InjectedState, create_react_agent
except ImportError:
    # Fallback for when packages not installed
    BaseTool = object
    create_react_agent = lambda *args, **kwargs: None

from .prompts import (
    TASK_DESCRIPTION_PREFIX, 
    TASK_DESCRIPTION_SUFFIX,
    CODE_ARCHITECT_PROMPT,
    CODE_IMPLEMENTER_PROMPT,
    TEST_ENGINEER_PROMPT,
    DOCUMENTATION_WRITER_PROMPT,
    SECURITY_AUDITOR_PROMPT,
    PERFORMANCE_OPTIMIZER_PROMPT,
    HARVEST_COLLECTOR_PROMPT,
    COORDINATOR_PROMPT
)
from .state import MaiFarmState

class SubAgent(TypedDict):
    """Base sub-agent definition"""
    name: str
    description: str
    prompt: str
    tools: NotRequired[List[str]]
    specialization: NotRequired[str]
    priority: NotRequired[int]

class ReapSubAgent(SubAgent):
    """Enhanced sub-agent with MaiFarm features"""
    capabilities: NotRequired[List[str]]
    memory_enabled: NotRequired[bool]
    max_iterations: NotRequired[int]
    confidence_threshold: NotRequired[float]

# ===== Specialized Sub-Agents =====

code_architect_agent: ReapSubAgent = {
    "name": "code-architect",
    "description": "Design system architecture, plan implementations, and create technical specifications",
    "prompt": CODE_ARCHITECT_PROMPT,
    "specialization": "architecture",
    "capabilities": ["system_design", "api_design", "database_schema", "component_planning"],
    "memory_enabled": True,
    "confidence_threshold": 0.8
}

code_implementer_agent: ReapSubAgent = {
    "name": "code-implementer",
    "description": "Implement code based on specifications, write functions, and create features",
    "prompt": CODE_IMPLEMENTER_PROMPT,
    "specialization": "implementation",
    "capabilities": ["code_writing", "refactoring", "bug_fixing", "feature_development"],
    "memory_enabled": True,
    "confidence_threshold": 0.75
}

test_engineer_agent: ReapSubAgent = {
    "name": "test-engineer",
    "description": "Create comprehensive tests, validate implementations, and ensure quality",
    "prompt": TEST_ENGINEER_PROMPT,
    "specialization": "testing",
    "capabilities": ["unit_testing", "integration_testing", "e2e_testing", "test_coverage"],
    "memory_enabled": True,
    "confidence_threshold": 0.85
}

documentation_writer_agent: ReapSubAgent = {
    "name": "documentation-writer",
    "description": "Write technical documentation, API docs, and user guides",
    "prompt": DOCUMENTATION_WRITER_PROMPT,
    "specialization": "documentation",
    "capabilities": ["api_docs", "user_guides", "code_comments", "readme_files"],
    "memory_enabled": False,
    "confidence_threshold": 0.7
}

security_auditor_agent: ReapSubAgent = {
    "name": "security-auditor",
    "description": "Audit code for security vulnerabilities and recommend fixes",
    "prompt": SECURITY_AUDITOR_PROMPT,
    "specialization": "security",
    "capabilities": ["vulnerability_scanning", "security_review", "compliance_check", "threat_modeling"],
    "memory_enabled": True,
    "confidence_threshold": 0.9
}

performance_optimizer_agent: ReapSubAgent = {
    "name": "performance-optimizer",
    "description": "Analyze and optimize code performance, identify bottlenecks",
    "prompt": PERFORMANCE_OPTIMIZER_PROMPT,
    "specialization": "performance",
    "capabilities": ["profiling", "optimization", "caching_strategy", "scalability_analysis"],
    "memory_enabled": True,
    "confidence_threshold": 0.8
}

harvest_collector_agent: ReapSubAgent = {
    "name": "harvest-collector",
    "description": "Collect and organize outputs for harvest, manage artifacts",
    "prompt": HARVEST_COLLECTOR_PROMPT,
    "specialization": "harvest",
    "capabilities": ["file_collection", "artifact_organization", "output_validation", "metadata_generation"],
    "memory_enabled": False,
    "confidence_threshold": 0.7
}

coordinator_agent: ReapSubAgent = {
    "name": "coordinator",
    "description": "Coordinate between agents, manage task distribution, and ensure collaboration",
    "prompt": COORDINATOR_PROMPT,
    "specialization": "coordination",
    "capabilities": ["task_distribution", "conflict_resolution", "progress_tracking", "resource_allocation"],
    "memory_enabled": True,
    "confidence_threshold": 0.85
}

# Default sub-agents list
DEFAULT_SUB_AGENTS = [
    code_architect_agent,
    code_implementer_agent,
    test_engineer_agent,
    documentation_writer_agent,
    security_auditor_agent,
    performance_optimizer_agent,
    harvest_collector_agent,
    coordinator_agent
]

def create_task_tool(
    tools: List[Any],
    instructions: str,
    subagents: List[ReapSubAgent],
    model: Any,
    state_schema: type = MaiFarmState
):
    """Create the task tool that manages sub-agents"""
    
    agents = {
        "general-purpose": create_react_agent(model, prompt=instructions, tools=tools, state_schema=state_schema)
    }
    
    # Convert tools to dictionary for lookup
    tools_by_name = {}
    for tool_ in tools:
        if hasattr(tool_, 'name'):
            tools_by_name[tool_.name] = tool_
    
    # Create specialized sub-agents
    for agent_config in subagents:
        if "tools" in agent_config:
            # Use specified tools
            agent_tools = [tools_by_name[t] for t in agent_config["tools"] if t in tools_by_name]
        else:
            # Use all tools
            agent_tools = tools
        
        # Create the sub-agent
        agents[agent_config["name"]] = create_react_agent(
            model, 
            prompt=agent_config["prompt"], 
            tools=agent_tools,
            state_schema=state_schema
        )
    
    # Build agent descriptions for the prompt
    other_agents_string = [
        f"- {agent['name']}: {agent['description']}" 
        for agent in subagents
    ]
    
    @tool(
        description=TASK_DESCRIPTION_PREFIX.format(other_agents="\n".join(other_agents_string))
        + TASK_DESCRIPTION_SUFFIX
    )
    def task(
        description: str,
        subagent_type: str,
        state: Annotated[MaiFarmState, InjectedState],
        tool_call_id: Annotated[str, InjectedToolCallId],
    ):
        """Execute a task using a sub-agent"""
        
        if subagent_type not in agents:
            available = list(agents.keys())
            return f"Error: Unknown agent type '{subagent_type}'. Available: {available}"
        
        # Get the sub-agent
        sub_agent = agents[subagent_type]
        
        # Prepare state for sub-agent
        sub_state = dict(state)
        sub_state["messages"] = [{"role": "user", "content": description}]
        
        # Track agent activity
        agents_list = state.get("agents", [])
        agents_list.append({
            "agent_id": f"{subagent_type}_{tool_call_id[:8]}",
            "name": subagent_type,
            "type": "sub",
            "status": "working",
            "current_task": description[:100]
        })
        
        try:
            # Execute sub-agent
            result = sub_agent.invoke(sub_state)
            
            # Update agent status
            for agent in agents_list:
                if agent["agent_id"] == f"{subagent_type}_{tool_call_id[:8]}":
                    agent["status"] = "completed"
            
            # Extract results
            return Command(
                update={
                    "files": result.get("files", {}),
                    "workspace_files": result.get("workspace_files", {}),
                    "harvest_data": result.get("harvest_data"),
                    "agents": agents_list,
                    "messages": [
                        ToolMessage(
                            result["messages"][-1].content if result.get("messages") else "Task completed",
                            tool_call_id=tool_call_id
                        )
                    ],
                }
            )
        except Exception as e:
            # Update agent status on error
            for agent in agents_list:
                if agent["agent_id"] == f"{subagent_type}_{tool_call_id[:8]}":
                    agent["status"] = "error"
            
            return Command(
                update={
                    "agents": agents_list,
                    "messages": [
                        ToolMessage(f"Sub-agent error: {str(e)}", tool_call_id=tool_call_id)
                    ],
                }
            )
    
    return task

@dataclass
class SubAgentManager:
    """Manages sub-agent lifecycle and coordination"""
    
    agents: Dict[str, ReapSubAgent]
    active_agents: Dict[str, Dict[str, Any]]
    
    def __init__(self, agents: Optional[List[ReapSubAgent]] = None):
        """Initialize with default or custom agents"""
        if agents is None:
            agents = DEFAULT_SUB_AGENTS
        
        self.agents = {agent["name"]: agent for agent in agents}
        self.active_agents = {}
    
    def get_agent(self, name: str) -> Optional[ReapSubAgent]:
        """Get agent configuration by name"""
        return self.agents.get(name)
    
    def get_agents_by_capability(self, capability: str) -> List[ReapSubAgent]:
        """Find agents with specific capability"""
        matching = []
        for agent in self.agents.values():
            if capability in agent.get("capabilities", []):
                matching.append(agent)
        return matching
    
    def get_agents_by_specialization(self, specialization: str) -> List[ReapSubAgent]:
        """Find agents by specialization"""
        matching = []
        for agent in self.agents.values():
            if agent.get("specialization") == specialization:
                matching.append(agent)
        return matching
    
    def activate_agent(self, name: str, task: str) -> str:
        """Activate an agent for a task"""
        import uuid
        agent_id = str(uuid.uuid4())[:8]
        
        self.active_agents[agent_id] = {
            "name": name,
            "task": task,
            "status": "active",
            "started_at": None
        }
        
        return agent_id
    
    def deactivate_agent(self, agent_id: str):
        """Deactivate an agent"""
        if agent_id in self.active_agents:
            self.active_agents[agent_id]["status"] = "completed"
    
    def get_active_agents(self) -> List[Dict[str, Any]]:
        """Get list of active agents"""
        return [
            {**info, "id": agent_id}
            for agent_id, info in self.active_agents.items()
            if info["status"] == "active"
        ]