"""
ReapAgents Graph - Core agent creation and orchestration
"""

from typing import Sequence, Union, Callable, Any, Optional, List, Dict
import os
import logging

try:
    from langchain_core.tools import BaseTool
    from langchain_core.language_models import LanguageModelLike
    from langgraph.prebuilt import create_react_agent
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    BaseTool = object
    LanguageModelLike = Any
    create_react_agent = lambda *args, **kwargs: None

from .sub_agent import create_task_tool, ReapSubAgent, DEFAULT_SUB_AGENTS
from .model import get_model_for_provider
from .tools import (
    write_todos, update_plan, ls_workspace, read_workspace_file, write_workspace_file,
    access_barn_item, list_barn_items, add_to_harvest, broadcast_to_agents,
    read_agent_coordination, execute_command, store_memory, retrieve_memory,
    update_metrics
)
from .state import MaiFarmState, ReapAgentState
from .prompts import BASE_REAP_PROMPT, MAIFARM_INTEGRATION_PROMPT

logger = logging.getLogger("reapagents")

# Default built-in tools for all ReapAgents
BUILT_IN_TOOLS = [
    write_todos,
    update_plan,
    ls_workspace,
    read_workspace_file,
    write_workspace_file,
    access_barn_item,
    list_barn_items,
    add_to_harvest,
    broadcast_to_agents,
    read_agent_coordination,
    execute_command,
    store_memory,
    retrieve_memory,
    update_metrics
]

def create_reap_agent(
    tools: Sequence[Union[BaseTool, Callable, Dict[str, Any]]],
    instructions: str,
    model: Optional[Union[str, LanguageModelLike]] = None,
    subagents: Optional[List[ReapSubAgent]] = None,
    state_schema: type = MaiFarmState,
    provider: str = "claude",
    farm_config: Optional[Dict[str, Any]] = None
):
    """
    Create a ReapAgent with MaiFarm integration
    
    Args:
        tools: Additional tools the agent should have access to
        instructions: Custom instructions for the agent
        model: The language model to use (or name of model)
        subagents: List of sub-agents to make available
        state_schema: The state schema to use (default: MaiFarmState)
        provider: AI provider to use (claude, openai, qwen, ollama)
        farm_config: MaiFarm-specific configuration
    
    Returns:
        A configured ReapAgent ready for execution
    """
    
    if not LANGGRAPH_AVAILABLE:
        raise ImportError(
            "LangGraph is required for ReapAgents. Install with: pip install langgraph langchain"
        )
    
    # Get or create model
    if model is None:
        model = get_model_for_provider(provider)
    elif isinstance(model, str):
        model = get_model_for_provider(provider, model_name=model)
    
    # Use default sub-agents if none provided
    if subagents is None:
        subagents = DEFAULT_SUB_AGENTS
    
    # Build the full prompt
    base_prompt = BASE_REAP_PROMPT + "\n\n" + instructions
    
    # Add MaiFarm integration context if config provided
    if farm_config:
        integration_prompt = MAIFARM_INTEGRATION_PROMPT.format(
            workspace_path=farm_config.get("workspace_path", "/tmp/workspace"),
            barn_path=farm_config.get("barn_path", "/tmp/maibarn/barn"),
            coordination_path=farm_config.get("coordination_path", "/tmp/maibarn/coordination"),
            harvest_path=farm_config.get("harvest_path", "/tmp/maibarn/harvests"),
            timeout_ms=farm_config.get("timeout", 300000),
            provider=provider,
            farm_id=farm_config.get("farm_id", "unknown"),
            debug=farm_config.get("debug", False)
        )
        base_prompt = base_prompt + "\n\n" + integration_prompt
    
    # Combine built-in tools with custom tools
    all_base_tools = BUILT_IN_TOOLS + list(tools)
    
    # Create the task tool for sub-agent coordination
    task_tool = create_task_tool(
        all_base_tools,
        instructions,
        subagents,
        model,
        state_schema
    )
    
    # All tools available to the main agent
    all_tools = all_base_tools + [task_tool]
    
    logger.info(f"Creating ReapAgent with {len(all_tools)} tools and {len(subagents)} sub-agents")
    
    # Create the main agent
    agent = create_react_agent(
        model,
        prompt=base_prompt,
        tools=all_tools,
        state_schema=state_schema,
    )
    
    return agent

class ReapAgentOrchestrator:
    """
    Orchestrates multiple ReapAgents in a farm
    """
    
    def __init__(
        self,
        farm_id: str,
        num_agents: int,
        provider: str = "claude",
        config: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the orchestrator
        
        Args:
            farm_id: Unique identifier for this farm
            num_agents: Number of agents to create
            provider: AI provider to use
            config: Additional configuration
        """
        self.farm_id = farm_id
        self.num_agents = num_agents
        self.provider = provider
        self.config = config or {}
        self.agents: List[Any] = []
        self.states: List[MaiFarmState] = []
        
        logger.info(f"Initializing ReapAgentOrchestrator for farm {farm_id} with {num_agents} agents")
    
    def create_agents(
        self,
        instructions: str,
        tools: Optional[List[Any]] = None,
        subagents: Optional[List[ReapSubAgent]] = None
    ):
        """
        Create the ReapAgents for this farm
        
        Args:
            instructions: Instructions for all agents
            tools: Additional tools to provide
            subagents: Sub-agents to make available
        """
        tools = tools or []
        
        for i in range(self.num_agents):
            # Create farm config for this agent
            farm_config = {
                **self.config,
                "farm_id": self.farm_id,
                "agent_index": i,
                "agent_name": f"Agent-{i+1}"
            }
            
            # Create the agent
            agent = create_reap_agent(
                tools=tools,
                instructions=instructions,
                provider=self.provider,
                subagents=subagents,
                farm_config=farm_config
            )
            
            self.agents.append(agent)
            
            # Initialize state for this agent
            state = MaiFarmState(
                farm_id=self.farm_id,
                provider=self.provider,
                messages=[],
                todos=[],
                files={},
                agents=[{
                    "agent_id": f"agent_{i}",
                    "name": f"Agent-{i+1}",
                    "type": "main",
                    "status": "idle"
                }],
                current_phase="planning",
                workspace_path=self.config.get("workspace_path", f"/tmp/workspace_{self.farm_id}"),
                coordination_data={},
                metrics={}
            )
            
            self.states.append(state)
        
        logger.info(f"Created {len(self.agents)} ReapAgents")
    
    def execute_task(
        self,
        task: str,
        collaborative: bool = True,
        timeout: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a task across all agents
        
        Args:
            task: The task to execute
            collaborative: Whether agents should collaborate
            timeout: Execution timeout in milliseconds
        
        Returns:
            List of results from each agent
        """
        results = []
        
        for i, (agent, state) in enumerate(zip(self.agents, self.states)):
            logger.info(f"Agent {i+1} starting task: {task[:100]}...")
            
            # Add task to agent's messages
            state["messages"] = [{"role": "user", "content": task}]
            
            # Set timeout if provided
            if timeout:
                state["execution_timeout"] = timeout
            
            try:
                # Execute the agent
                result = agent.invoke(state)
                
                # Update state with results
                self.states[i] = result
                
                # Extract key results
                agent_result = {
                    "agent_index": i,
                    "status": "completed",
                    "todos_completed": len([t for t in result.get("todos", []) if t["status"] == "completed"]),
                    "files_created": len(result.get("files", {})),
                    "harvest_items": len(result.get("harvest_data", {}).get("files", {})),
                    "final_message": result.get("messages", [])[-1].content if result.get("messages") else None
                }
                
                results.append(agent_result)
                logger.info(f"Agent {i+1} completed successfully")
                
            except Exception as e:
                logger.error(f"Agent {i+1} failed: {str(e)}")
                results.append({
                    "agent_index": i,
                    "status": "error",
                    "error": str(e)
                })
        
        return results
    
    def get_harvest(self) -> Dict[str, Any]:
        """
        Collect harvest data from all agents
        
        Returns:
            Combined harvest data
        """
        combined_harvest = {
            "farm_id": self.farm_id,
            "files": {},
            "artifacts": [],
            "metrics": {},
            "agent_outputs": []
        }
        
        for i, state in enumerate(self.states):
            harvest_data = state.get("harvest_data", {})
            
            # Merge files
            combined_harvest["files"].update(harvest_data.get("files", {}))
            
            # Collect artifacts
            combined_harvest["artifacts"].extend(harvest_data.get("artifacts", []))
            
            # Aggregate metrics
            agent_metrics = state.get("metrics", {})
            for metric, values in agent_metrics.items():
                if metric not in combined_harvest["metrics"]:
                    combined_harvest["metrics"][metric] = []
                combined_harvest["metrics"][metric].extend(values)
            
            # Add agent-specific output
            combined_harvest["agent_outputs"].append({
                "agent_index": i,
                "todos": state.get("todos", []),
                "plan": state.get("plan", ""),
                "phase": state.get("current_phase", "unknown")
            })
        
        return combined_harvest
    
    def shutdown(self):
        """
        Gracefully shutdown the orchestrator
        """
        logger.info(f"Shutting down ReapAgentOrchestrator for farm {self.farm_id}")
        
        # Set graceful shutdown flag in all states
        for state in self.states:
            state["graceful_shutdown"] = True
        
        # Clear agents
        self.agents.clear()
        self.states.clear()