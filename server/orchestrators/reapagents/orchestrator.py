"""
ReapAgents Orchestrator
Main orchestration engine for ReapAgents in MaiFarm
"""

import os
import sys
import json
import time
import signal
import logging
import subprocess
import threading
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from .config import ReapConfig, config_manager
from .graph import ReapAgentOrchestrator
from .sub_agent import DEFAULT_SUB_AGENTS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s'
)
logger = logging.getLogger("reapagents.orchestrator")

class ReapOrchestrator:
    """
    Main orchestrator for ReapAgents
    Manages farm lifecycle, agent coordination, and harvest collection
    """
    
    def __init__(self, config: ReapConfig):
        """
        Initialize the orchestrator
        
        Args:
            config: ReapAgent configuration
        """
        self.config = config
        self.agent_orchestrator: Optional[ReapAgentOrchestrator] = None
        self.tmux_session: Optional[str] = None
        self.start_time = datetime.now()
        self.shutdown_requested = False
        self.executor = ThreadPoolExecutor(max_workers=config.num_agents)
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)
        
        # Configure logging
        log_level = getattr(logging, config.log_level.upper(), logging.INFO)
        logging.getLogger("reapagents").setLevel(log_level)
        
        logger.info(f"Initialized ReapOrchestrator for farm {config.farm_id}")
    
    def _handle_signal(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")
        self.shutdown_requested = True
        self.shutdown()
    
    def setup_workspace(self):
        """Setup the workspace and directories"""
        logger.info("Setting up workspace...")
        
        # Create necessary directories
        for path_attr in ["workspace_path", "harvest_path"]:
            path = Path(getattr(self.config, path_attr))
            path.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Created directory: {path}")
        
        # Link barn to workspace if needed
        workspace = Path(self.config.workspace_path)
        barn_link = workspace / "barn"
        barn_path = Path(self.config.barn_path)
        
        if barn_path.exists() and not barn_link.exists():
            try:
                barn_link.symlink_to(barn_path)
                logger.info(f"Linked barn to workspace: {barn_link} -> {barn_path}")
            except Exception as e:
                logger.warning(f"Failed to link barn: {e}")
    
    def setup_tmux_session(self) -> bool:
        """
        Setup tmux session for agent terminals
        
        Returns:
            True if successful, False otherwise
        """
        if not self.config.parallel_execution:
            logger.info("Parallel execution disabled, skipping tmux setup")
            return True
        
        self.tmux_session = f"reap-{self.config.farm_id}"
        
        try:
            # Check if tmux is available
            result = subprocess.run(["which", "tmux"], capture_output=True)
            if result.returncode != 0:
                logger.warning("tmux not found, agents will run without terminal visualization")
                return False
            
            # Kill existing session if it exists
            subprocess.run(
                ["tmux", "kill-session", "-t", self.tmux_session],
                capture_output=True
            )
            
            # Create new session
            subprocess.run(
                ["tmux", "new-session", "-d", "-s", self.tmux_session],
                check=True,
                capture_output=True
            )
            
            # Create panes for each agent
            for i in range(1, self.config.num_agents):
                subprocess.run(
                    ["tmux", "split-window", "-t", f"{self.tmux_session}:0", "-h"],
                    check=True,
                    capture_output=True
                )
            
            # Balance panes
            subprocess.run(
                ["tmux", "select-layout", "-t", f"{self.tmux_session}:0", "tiled"],
                check=True,
                capture_output=True
            )
            
            logger.info(f"Created tmux session: {self.tmux_session}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup tmux session: {e}")
            return False
    
    def create_agents(self, instructions: str, tools: Optional[List[Any]] = None):
        """
        Create the ReapAgents
        
        Args:
            instructions: Instructions for agents
            tools: Additional tools to provide
        """
        logger.info(f"Creating {self.config.num_agents} ReapAgents...")
        
        # Create the agent orchestrator
        self.agent_orchestrator = ReapAgentOrchestrator(
            farm_id=self.config.farm_id,
            num_agents=self.config.num_agents,
            provider=self.config.provider,
            config=self.config.get_farm_config()
        )
        
        # Determine which sub-agents to use
        subagents = []
        if self.config.enable_sub_agents:
            for agent_name in self.config.sub_agents:
                # Find matching sub-agent from defaults
                for default_agent in DEFAULT_SUB_AGENTS:
                    if default_agent["name"] == agent_name:
                        subagents.append(default_agent)
                        break
        
        # Create the agents
        self.agent_orchestrator.create_agents(
            instructions=instructions,
            tools=tools or [],
            subagents=subagents if subagents else None
        )
        
        logger.info(f"Created {self.config.num_agents} agents with {len(subagents)} sub-agent types")
    
    def execute_task(self, task: str) -> List[Dict[str, Any]]:
        """
        Execute a task across all agents
        
        Args:
            task: The task to execute
        
        Returns:
            Results from all agents
        """
        if not self.agent_orchestrator:
            raise RuntimeError("Agents not created. Call create_agents first.")
        
        logger.info(f"Executing task: {task[:100]}...")
        
        # Set timeout timer
        if self.config.timeout > 0:
            def timeout_handler():
                time.sleep(self.config.timeout / 1000)  # Convert ms to seconds
                if not self.shutdown_requested:
                    logger.warning("Execution timeout reached, initiating shutdown")
                    self.shutdown_requested = True
            
            timeout_thread = threading.Thread(target=timeout_handler, daemon=True)
            timeout_thread.start()
        
        # Execute task
        results = self.agent_orchestrator.execute_task(
            task=task,
            collaborative=self.config.collaborative,
            timeout=self.config.timeout
        )
        
        return results
    
    def execute_parallel(self, task: str) -> List[Dict[str, Any]]:
        """
        Execute task in parallel across agents
        
        Args:
            task: The task to execute
        
        Returns:
            Results from all agents
        """
        if not self.agent_orchestrator:
            raise RuntimeError("Agents not created. Call create_agents first.")
        
        logger.info(f"Executing task in parallel across {self.config.num_agents} agents")
        
        futures = []
        results = []
        
        # Submit tasks for each agent
        for i in range(self.config.num_agents):
            future = self.executor.submit(
                self._execute_agent_task,
                agent_index=i,
                task=task
            )
            futures.append((i, future))
            
            # Stagger agent launches
            if self.config.stagger_delay > 0 and i < self.config.num_agents - 1:
                time.sleep(self.config.stagger_delay)
        
        # Collect results as they complete
        for future in as_completed([f[1] for f in futures]):
            for idx, f in futures:
                if f == future:
                    try:
                        result = future.result(timeout=self.config.timeout / 1000)
                        results.append(result)
                        logger.info(f"Agent {idx + 1} completed")
                    except Exception as e:
                        logger.error(f"Agent {idx + 1} failed: {e}")
                        results.append({
                            "agent_index": idx,
                            "status": "error",
                            "error": str(e)
                        })
        
        return results
    
    def _execute_agent_task(self, agent_index: int, task: str) -> Dict[str, Any]:
        """
        Execute task for a single agent
        
        Args:
            agent_index: Index of the agent
            task: Task to execute
        
        Returns:
            Agent result
        """
        if not self.agent_orchestrator:
            raise RuntimeError("Agent orchestrator not initialized")
        
        agent = self.agent_orchestrator.agents[agent_index]
        state = self.agent_orchestrator.states[agent_index]
        
        # Update tmux pane if available
        if self.tmux_session:
            try:
                subprocess.run(
                    ["tmux", "send-keys", "-t", f"{self.tmux_session}:0.{agent_index}",
                     f"echo 'Agent {agent_index + 1} starting task...'", "Enter"],
                    capture_output=True
                )
            except:
                pass
        
        # Add task to state
        state["messages"] = [{"role": "user", "content": task}]
        
        # Execute
        try:
            result = agent.invoke(state)
            
            # Update state
            self.agent_orchestrator.states[agent_index] = result
            
            return {
                "agent_index": agent_index,
                "status": "completed",
                "todos_completed": len([t for t in result.get("todos", []) if t["status"] == "completed"]),
                "files_created": len(result.get("files", {})),
                "final_message": result.get("messages", [])[-1].content if result.get("messages") else None
            }
        except Exception as e:
            return {
                "agent_index": agent_index,
                "status": "error",
                "error": str(e)
            }
    
    def collect_harvest(self) -> Dict[str, Any]:
        """
        Collect harvest from all agents
        
        Returns:
            Combined harvest data
        """
        if not self.agent_orchestrator:
            return {"error": "No agents to harvest from"}
        
        logger.info("Collecting harvest...")
        
        harvest = self.agent_orchestrator.get_harvest()
        
        # Save harvest to file
        harvest_file = Path(self.config.harvest_path) / f"harvest_{self.config.farm_id}.json"
        harvest_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(harvest_file, 'w') as f:
            json.dump(harvest, f, indent=2, default=str)
        
        logger.info(f"Harvest saved to {harvest_file}")
        
        # Save individual agent outputs
        for i, state in enumerate(self.agent_orchestrator.states):
            agent_harvest = Path(self.config.harvest_path) / f"agent_{i}_output.json"
            with open(agent_harvest, 'w') as f:
                json.dump({
                    "agent_index": i,
                    "todos": state.get("todos", []),
                    "files": list(state.get("files", {}).keys()),
                    "plan": state.get("plan", ""),
                    "phase": state.get("current_phase", ""),
                    "metrics": state.get("metrics", {})
                }, f, indent=2, default=str)
        
        return harvest
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get execution metrics
        
        Returns:
            Metrics dictionary
        """
        if not self.agent_orchestrator:
            return {}
        
        metrics = {
            "farm_id": self.config.farm_id,
            "num_agents": self.config.num_agents,
            "provider": self.config.provider,
            "start_time": self.start_time.isoformat(),
            "duration": (datetime.now() - self.start_time).total_seconds(),
            "agents": []
        }
        
        for i, state in enumerate(self.agent_orchestrator.states):
            agent_metrics = {
                "index": i,
                "todos_total": len(state.get("todos", [])),
                "todos_completed": len([t for t in state.get("todos", []) if t["status"] == "completed"]),
                "files_created": len(state.get("files", {})),
                "workspace_files": len(state.get("workspace_files", {})),
                "harvest_files": len(state.get("harvest_data", {}).get("files", {})),
                "phase": state.get("current_phase", "unknown"),
                "metrics": state.get("metrics", {})
            }
            metrics["agents"].append(agent_metrics)
        
        return metrics
    
    def shutdown(self):
        """Gracefully shutdown the orchestrator"""
        logger.info("Shutting down ReapOrchestrator...")
        
        # Collect harvest if auto-harvest enabled
        if self.config.auto_harvest and self.agent_orchestrator:
            try:
                self.collect_harvest()
            except Exception as e:
                logger.error(f"Failed to collect harvest: {e}")
        
        # Save metrics
        if self.config.metrics_enabled:
            try:
                metrics = self.get_metrics()
                metrics_file = Path(self.config.harvest_path) / f"metrics_{self.config.farm_id}.json"
                with open(metrics_file, 'w') as f:
                    json.dump(metrics, f, indent=2, default=str)
                logger.info(f"Metrics saved to {metrics_file}")
            except Exception as e:
                logger.error(f"Failed to save metrics: {e}")
        
        # Clean up tmux session
        if self.tmux_session:
            try:
                subprocess.run(
                    ["tmux", "kill-session", "-t", self.tmux_session],
                    capture_output=True
                )
                logger.info(f"Cleaned up tmux session: {self.tmux_session}")
            except:
                pass
        
        # Shutdown agent orchestrator
        if self.agent_orchestrator:
            self.agent_orchestrator.shutdown()
        
        # Shutdown executor
        self.executor.shutdown(wait=True)
        
        logger.info("ReapOrchestrator shutdown complete")

def run_reap_orchestrator(
    farm_id: str,
    task: str,
    num_agents: int = 3,
    provider: str = "claude",
    timeout: int = 300000,
    **kwargs
) -> Dict[str, Any]:
    """
    Run a ReapAgent orchestration
    
    Args:
        farm_id: Unique farm identifier
        task: Task to execute
        num_agents: Number of agents
        provider: AI provider
        timeout: Execution timeout in ms
        **kwargs: Additional configuration
    
    Returns:
        Execution results
    """
    # Create configuration
    config = ReapConfig(
        farm_id=farm_id,
        num_agents=num_agents,
        provider=provider,
        timeout=timeout,
        **kwargs
    )
    
    # Validate configuration
    errors = config.validate()
    if errors:
        return {"status": "error", "errors": errors}
    
    # Create and run orchestrator
    orchestrator = ReapOrchestrator(config)
    
    try:
        # Setup
        orchestrator.setup_workspace()
        orchestrator.setup_tmux_session()
        
        # Create agents
        orchestrator.create_agents(instructions=task)
        
        # Execute task
        if config.parallel_execution:
            results = orchestrator.execute_parallel(task)
        else:
            results = orchestrator.execute_task(task)
        
        # Collect harvest
        harvest = orchestrator.collect_harvest()
        
        # Get metrics
        metrics = orchestrator.get_metrics()
        
        return {
            "status": "success",
            "results": results,
            "harvest": harvest,
            "metrics": metrics
        }
        
    except Exception as e:
        logger.error(f"Orchestration failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }
    finally:
        orchestrator.shutdown()