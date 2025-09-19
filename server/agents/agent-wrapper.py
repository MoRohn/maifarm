#!/usr/bin/env python3
"""
MaiFarm Agent Wrapper - Persistent Agent Process Manager

This wrapper maintains a persistent connection between AI agents and the orchestrator,
handling task distribution, execution, and response collection.

Features:
- Persistent process management
- Bidirectional communication via coordination files
- WebSocket integration support
- Automatic reconnection and recovery
- Task queue management
- Real-time status reporting
"""

import asyncio
import json
import logging
import os
import shlex
import signal
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
import tempfile
import traceback

# Configure logging
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("maifarm.agent")


class AgentStatus(Enum):
    """Agent lifecycle states"""
    INITIALIZING = "initializing"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    READY = "ready"
    WORKING = "working"
    IDLE = "idle"
    ERROR = "error"
    DISCONNECTED = "disconnected"
    SHUTTING_DOWN = "shutting_down"


class TaskStatus(Enum):
    """Task execution states"""
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class AgentConfig:
    """Agent configuration"""
    agent_id: str
    agent_index: int
    agent_name: str
    farm_id: str
    session_name: str
    provider: str
    workspace_dir: Path
    coordination_dir: Path
    api_key: Optional[str] = None
    model: Optional[str] = None
    max_retries: int = 3
    heartbeat_interval: int = 5
    task_timeout: int = 300  # 5 minutes default


@dataclass
class Task:
    """Task representation"""
    task_id: str
    prompt: str
    context: Optional[Dict[str, Any]] = None
    priority: int = 0
    created_at: Optional[str] = None
    assigned_at: Optional[str] = None
    completed_at: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    attempts: int = 0


class ProviderInterface:
    """Base interface for AI provider interactions"""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        
    async def execute_prompt(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Execute a prompt and return the response"""
        raise NotImplementedError


class ClaudeProvider(ProviderInterface):
    """Claude AI provider implementation"""
    
    async def execute_prompt(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Execute prompt using Claude CLI"""
        try:
            # Check for Claude binary
            claude_bin = self._find_claude_binary()
            if not claude_bin:
                raise Exception("Claude CLI not found")
            
            # Write prompt to temporary file to avoid escaping issues
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write(prompt)
                prompt_file = f.name
            
            try:
                # Build command with proper environment
                env = os.environ.copy()
                if self.config.api_key:
                    env['ANTHROPIC_API_KEY'] = self.config.api_key
                
                # Use --print flag to get output that we can display
                cmd = f'cat {shlex.quote(prompt_file)} | {claude_bin} --print'
                
                # Execute command
                result = await asyncio.create_subprocess_shell(
                    cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                    cwd=str(self.config.workspace_dir)
                )
                
                stdout, stderr = await asyncio.wait_for(
                    result.communicate(),
                    timeout=self.config.task_timeout
                )
                
                if result.returncode != 0:
                    error_msg = stderr.decode('utf-8').strip()
                    raise Exception(f"Claude execution failed: {error_msg}")
                
                return stdout.decode('utf-8').strip()
                
            finally:
                # Clean up temp file
                try:
                    os.unlink(prompt_file)
                except:
                    pass
                    
        except asyncio.TimeoutError:
            raise Exception(f"Task execution timeout ({self.config.task_timeout}s)")
        except Exception as e:
            logger.error(f"Claude execution error: {e}")
            raise
    
    def _find_claude_binary(self) -> Optional[str]:
        """Find Claude CLI binary"""
        # Check environment variable first
        if claude_bin := os.environ.get('CLAUDE_BIN'):
            if os.path.exists(claude_bin):
                return claude_bin
        
        # Check common locations
        for path in ['/usr/local/bin/claude', '/usr/bin/claude', 'claude']:
            try:
                result = subprocess.run(['which', path], capture_output=True, text=True)
                if result.returncode == 0:
                    return result.stdout.strip()
            except:
                pass
        
        return None


class MockProvider(ProviderInterface):
    """Mock provider for testing"""
    
    async def execute_prompt(self, prompt: str, context: Optional[Dict] = None) -> str:
        """Simulate prompt execution"""
        logger.info(f"[MOCK] Executing prompt: {prompt[:100]}...")
        
        # Print mock processing to terminal
        print(f"[MOCK] {self.config.agent_name} is thinking...")
        await asyncio.sleep(2)  # Simulate processing time
        
        response = f"""[MOCK RESPONSE]
Received prompt: {prompt[:200]}...
Context: {json.dumps(context) if context else 'None'}
Simulated response from {self.config.agent_name}
Task completed successfully at {datetime.now().isoformat()}
"""
        
        return response


class AgentWrapper:
    """Main agent wrapper managing lifecycle and task execution"""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.status = AgentStatus.INITIALIZING
        self.current_task: Optional[Task] = None
        self.task_queue: List[Task] = []
        self.completed_tasks: List[Task] = []
        self.provider: ProviderInterface = self._create_provider()
        self.running = False
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.status_file = self.config.coordination_dir / f"agent_{self.config.agent_id}_status.json"
        self.queue_file = self.config.coordination_dir / f"agent_{self.config.agent_id}_queue.json"
        self.response_dir = self.config.coordination_dir / "agent_responses"
        self.response_dir.mkdir(parents=True, exist_ok=True)
        
        # Signal handlers
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)
    
    def _create_provider(self) -> ProviderInterface:
        """Create appropriate provider instance"""
        provider_map = {
            'claude': ClaudeProvider,
            'mock': MockProvider,
            # Add more providers as needed
        }
        
        provider_class = provider_map.get(self.config.provider, MockProvider)
        return provider_class(self.config)
    
    def _handle_signal(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.status = AgentStatus.SHUTTING_DOWN
        self.running = False
    
    async def start(self):
        """Start the agent wrapper"""
        # Print startup message to terminal so it's visible in tmux
        print(f"\n{'='*60}")
        print(f"Starting {self.config.agent_name}")
        print(f"Agent ID: {self.config.agent_id}")
        print(f"Provider: {self.config.provider}")
        print(f"Workspace: {self.config.workspace_dir}")
        print(f"{'='*60}\n")
        
        logger.info(f"Starting agent {self.config.agent_name} ({self.config.agent_id})")
        
        try:
            # Initialize
            await self._initialize()
            
            # Start heartbeat
            self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            
            # Main execution loop
            self.running = True
            await self._main_loop()
            
        except Exception as e:
            logger.error(f"Agent startup failed: {e}")
            print(f"\n[ERROR] Agent startup failed: {e}")
            self.status = AgentStatus.ERROR
            await self._update_status(error=str(e))
        finally:
            await self._cleanup()
    
    async def _initialize(self):
        """Initialize agent and establish connection"""
        logger.info("Initializing agent...")
        self.status = AgentStatus.CONNECTING
        
        # Register with orchestrator
        await self._register_agent()
        
        # Load any pending tasks
        await self._load_pending_tasks()
        
        self.status = AgentStatus.CONNECTED
        logger.info("Agent initialized successfully")
    
    async def _register_agent(self):
        """Register agent with orchestrator"""
        registration = {
            "agent_id": self.config.agent_id,
            "agent_name": self.config.agent_name,
            "farm_id": self.config.farm_id,
            "session_name": self.config.session_name,
            "status": self.status.value,
            "provider": self.config.provider,
            "registered_at": datetime.now().isoformat(),
            "capabilities": {
                "provider": self.config.provider,
                "model": self.config.model,
                "max_context": 200000 if self.config.provider == "claude" else 8000
            }
        }
        
        # Write registration to coordination directory
        reg_file = self.config.coordination_dir / "agent_registrations.json"
        registrations = []
        
        if reg_file.exists():
            try:
                with open(reg_file, 'r') as f:
                    registrations = json.load(f)
            except:
                registrations = []
        
        # Update or add registration
        registrations = [r for r in registrations if r.get("agent_id") != self.config.agent_id]
        registrations.append(registration)
        
        # Atomic write
        self._atomic_write_json(reg_file, registrations)
        logger.info(f"Registered agent {self.config.agent_id} with orchestrator")
    
    async def _heartbeat_loop(self):
        """Send periodic heartbeat updates"""
        while self.running:
            try:
                await self._update_status()
                await asyncio.sleep(self.config.heartbeat_interval)
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
    
    async def _update_status(self, error: Optional[str] = None):
        """Update agent status file"""
        status_data = {
            "agent_id": self.config.agent_id,
            "agent_name": self.config.agent_name,
            "status": self.status.value,
            "current_task": asdict(self.current_task) if self.current_task else None,
            "queue_length": len(self.task_queue),
            "completed_tasks": len(self.completed_tasks),
            "last_update": datetime.now().isoformat(),
            "error": error
        }
        
        self._atomic_write_json(self.status_file, status_data)
    
    async def _main_loop(self):
        """Main task execution loop"""
        logger.info("Entering main execution loop")
        self.status = AgentStatus.READY
        
        while self.running:
            try:
                # Check for new tasks
                await self._check_for_tasks()
                
                # Process next task if available
                if self.task_queue and self.status == AgentStatus.READY:
                    await self._process_next_task()
                
                # Small delay to prevent CPU spinning
                await asyncio.sleep(1)
                
            except Exception as e:
                logger.error(f"Main loop error: {e}")
                await asyncio.sleep(5)  # Back off on error
    
    async def _check_for_tasks(self):
        """Check for new tasks in queue file"""
        if not self.queue_file.exists():
            return
        
        try:
            with open(self.queue_file, 'r') as f:
                queue_data = json.load(f)
            
            # Process new tasks
            for task_data in queue_data:
                task_id = task_data.get('task_id')
                if not any(t.task_id == task_id for t in self.task_queue):
                    task = Task(
                        task_id=task_data.get('task_id', str(uuid.uuid4())),
                        prompt=task_data.get('prompt', ''),
                        context=task_data.get('context'),
                        priority=task_data.get('priority', 0),
                        created_at=task_data.get('created_at', datetime.now().isoformat())
                    )
                    self.task_queue.append(task)
                    logger.info(f"Added new task {task.task_id} to queue")
            
            # Sort by priority
            self.task_queue.sort(key=lambda t: t.priority, reverse=True)
            
            # Clear the queue file after processing
            self._atomic_write_json(self.queue_file, [])
            
        except Exception as e:
            logger.error(f"Error checking for tasks: {e}")
    
    async def _process_next_task(self):
        """Process the next task in queue"""
        if not self.task_queue:
            return
        
        task = self.task_queue.pop(0)
        self.current_task = task
        self.status = AgentStatus.WORKING
        
        logger.info(f"Processing task {task.task_id}")
        task.status = TaskStatus.IN_PROGRESS
        task.assigned_at = datetime.now().isoformat()
        task.attempts += 1
        
        try:
            # Print task prompt to terminal
            print(f"\n{'='*60}")
            print(f"[{self.config.agent_name}] Processing task: {task.task_id}")
            print(f"Prompt: {task.prompt[:200]}..." if len(task.prompt) > 200 else f"Prompt: {task.prompt}")
            print(f"{'='*60}\n")
            
            # Execute the task
            result = await self.provider.execute_prompt(task.prompt, task.context)
            
            # Print Claude's response to terminal so it shows in tmux pane
            print(f"\n[{self.config.agent_name}] Response:")
            print(f"{'-'*60}")
            print(result)
            print(f"{'-'*60}\n")
            
            # Mark as completed
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now().isoformat()
            task.result = result
            
            # Save response
            await self._save_response(task)
            
            logger.info(f"Task {task.task_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Task {task.task_id} failed: {e}")
            task.status = TaskStatus.FAILED
            task.error = str(e)
            
            # Retry logic
            if task.attempts < self.config.max_retries:
                logger.info(f"Retrying task {task.task_id} (attempt {task.attempts + 1})")
                self.task_queue.insert(0, task)  # Re-add to front of queue
        
        finally:
            self.completed_tasks.append(task)
            self.current_task = None
            self.status = AgentStatus.READY
            await self._update_status()
    
    async def _save_response(self, task: Task):
        """Save task response to file"""
        response_file = self.response_dir / f"{task.task_id}_response.json"
        response_data = {
            "task": asdict(task),
            "agent_id": self.config.agent_id,
            "agent_name": self.config.agent_name,
            "saved_at": datetime.now().isoformat()
        }
        
        self._atomic_write_json(response_file, response_data)
        logger.info(f"Saved response for task {task.task_id}")
    
    async def _load_pending_tasks(self):
        """Load any pending tasks from queue file"""
        await self._check_for_tasks()
    
    async def _cleanup(self):
        """Clean up resources on shutdown"""
        logger.info("Cleaning up agent resources...")
        
        # Cancel heartbeat
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
        
        # Update final status
        self.status = AgentStatus.DISCONNECTED
        await self._update_status()
        
        logger.info(f"Agent {self.config.agent_name} shutdown complete")
    
    def _atomic_write_json(self, path: Path, data: Any):
        """Atomically write JSON data to file"""
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_file = path.with_suffix('.tmp')
        
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        temp_file.replace(path)


async def main():
    """Main entry point"""
    # Print that the wrapper was invoked
    print(f"[AGENT-WRAPPER] Started with {len(sys.argv)} arguments")
    print(f"[AGENT-WRAPPER] Args: {sys.argv}")
    
    # Parse command line arguments
    if len(sys.argv) < 8:
        print("Usage: agent-wrapper.py <agent_id> <agent_index> <agent_name> <farm_id> <session_name> <provider> <workspace_dir> <coordination_dir> [api_key]")
        sys.exit(1)
    
    agent_id = sys.argv[1]
    agent_index = int(sys.argv[2])
    agent_name = sys.argv[3]
    farm_id = sys.argv[4]
    session_name = sys.argv[5]
    provider = sys.argv[6]
    workspace_dir = Path(sys.argv[7])
    coordination_dir = Path(sys.argv[8])
    api_key = sys.argv[9] if len(sys.argv) > 9 else os.environ.get('ANTHROPIC_API_KEY')
    
    # Create agent configuration
    config = AgentConfig(
        agent_id=agent_id,
        agent_index=agent_index,
        agent_name=agent_name,
        farm_id=farm_id,
        session_name=session_name,
        provider=provider,
        workspace_dir=workspace_dir,
        coordination_dir=coordination_dir,
        api_key=api_key
    )
    
    # Create and start agent
    agent = AgentWrapper(config)
    await agent.start()


if __name__ == "__main__":
    asyncio.run(main())