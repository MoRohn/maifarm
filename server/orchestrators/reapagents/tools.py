"""
ReapAgents Tools - MaiFarm-specific tools for deep agents
"""

import os
import json
import yaml
import subprocess
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional, Annotated
from datetime import datetime

try:
    from langchain_core.tools import tool, InjectedToolCallId
    from langgraph.types import Command
    from langchain_core.messages import ToolMessage
    from langgraph.prebuilt import InjectedState
except ImportError:
    # Fallback decorators when packages not installed
    def tool(description=""):
        def decorator(func):
            func.description = description
            return func
        return decorator
    
    InjectedToolCallId = str
    InjectedState = Dict[str, Any]
    Command = Dict[str, Any]
    ToolMessage = lambda content, tool_call_id: {"content": content, "tool_call_id": tool_call_id}

from .state import ReapAgentState, MaiFarmState, Todo

# ===== Core Planning Tools =====

@tool(description="Update the todo list for task tracking and planning")
def write_todos(
    todos: List[Todo], 
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Update todo list with MaiFarm integration"""
    return Command(
        update={
            "todos": todos,
            "messages": [
                ToolMessage(f"Updated todo list with {len(todos)} items", tool_call_id=tool_call_id)
            ],
        }
    )

@tool(description="Create or update the execution plan")
def update_plan(
    plan: str,
    phase: str,
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Update the execution plan and phase"""
    return Command(
        update={
            "plan": plan,
            "current_phase": phase,
            "messages": [
                ToolMessage(f"Updated plan for phase: {phase}", tool_call_id=tool_call_id)
            ],
        }
    )

# ===== MaiFarm Workspace Tools =====

@tool(description="List files in the farm workspace")
def ls_workspace(
    path: str = "",
    state: Annotated[MaiFarmState, InjectedState]
) -> List[str]:
    """List files in the workspace"""
    workspace_path = Path(state.get("workspace_path", "/tmp/workspace"))
    target_path = workspace_path / path
    
    if not target_path.exists():
        return [f"Error: Path '{path}' not found in workspace"]
    
    try:
        files = []
        for item in target_path.iterdir():
            if item.is_dir():
                files.append(f"{item.name}/")
            else:
                files.append(item.name)
        return sorted(files)
    except Exception as e:
        return [f"Error listing files: {str(e)}"]

@tool(description="Read a file from the workspace")
def read_workspace_file(
    file_path: str,
    state: Annotated[MaiFarmState, InjectedState],
    offset: int = 0,
    limit: int = 2000,
) -> str:
    """Read file from workspace"""
    workspace_path = Path(state.get("workspace_path", "/tmp/workspace"))
    full_path = workspace_path / file_path
    
    if not full_path.exists():
        return f"Error: File '{file_path}' not found in workspace"
    
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if not content:
            return "System reminder: File exists but has empty contents"
        
        lines = content.splitlines()
        start_idx = offset
        end_idx = min(start_idx + limit, len(lines))
        
        if start_idx >= len(lines):
            return f"Error: Line offset {offset} exceeds file length ({len(lines)} lines)"
        
        result_lines = []
        for i in range(start_idx, end_idx):
            line_content = lines[i]
            if len(line_content) > 2000:
                line_content = line_content[:2000]
            line_number = i + 1
            result_lines.append(f"{line_number:6d}\t{line_content}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error reading file: {str(e)}"

@tool(description="Write a file to the workspace")
def write_workspace_file(
    file_path: str,
    content: str,
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Write file to workspace"""
    workspace_path = Path(state.get("workspace_path", "/tmp/workspace"))
    full_path = workspace_path / file_path
    
    try:
        # Create parent directories if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Update workspace files in state
        workspace_files = state.get("workspace_files", {})
        workspace_files[file_path] = content
        
        return Command(
            update={
                "workspace_files": workspace_files,
                "messages": [
                    ToolMessage(f"Written file to workspace: {file_path}", tool_call_id=tool_call_id)
                ],
            }
        )
    except Exception as e:
        return Command(
            update={
                "messages": [
                    ToolMessage(f"Error writing file: {str(e)}", tool_call_id=tool_call_id)
                ],
            }
        )

# ===== Barn Integration Tools =====

@tool(description="Access items from the MaiFarm barn catalog")
def access_barn_item(
    item_id: str,
    state: Annotated[MaiFarmState, InjectedState]
) -> Dict[str, Any]:
    """Access an item from the barn"""
    barn_path = Path(state.get("barn_path", "/tmp/maibarn/barn"))
    item_path = barn_path / "items" / item_id
    
    if not item_path.exists():
        return {"error": f"Barn item '{item_id}' not found"}
    
    try:
        # Check if it's a JSON metadata file
        metadata_file = item_path / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
        else:
            metadata = {"id": item_id, "type": "resource"}
        
        # List contents
        contents = []
        for item in item_path.iterdir():
            if item.is_file():
                contents.append(item.name)
        
        return {
            "id": item_id,
            "metadata": metadata,
            "contents": contents,
            "path": str(item_path)
        }
    except Exception as e:
        return {"error": f"Failed to access barn item: {str(e)}"}

@tool(description="List available items in the barn")
def list_barn_items(
    state: Annotated[MaiFarmState, InjectedState]
) -> List[Dict[str, str]]:
    """List all available barn items"""
    barn_path = Path(state.get("barn_path", "/tmp/maibarn/barn"))
    items_path = barn_path / "items"
    
    if not items_path.exists():
        return []
    
    items = []
    try:
        for item_dir in items_path.iterdir():
            if item_dir.is_dir():
                metadata_file = item_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                    items.append({
                        "id": item_dir.name,
                        "name": metadata.get("name", item_dir.name),
                        "type": metadata.get("type", "resource"),
                        "description": metadata.get("description", "")
                    })
                else:
                    items.append({
                        "id": item_dir.name,
                        "name": item_dir.name,
                        "type": "resource",
                        "description": ""
                    })
        return items
    except Exception as e:
        return [{"error": f"Failed to list barn items: {str(e)}"}]

# ===== Harvest Collection Tools =====

@tool(description="Add files to the harvest collection")
def add_to_harvest(
    files: Dict[str, str],
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Add files to harvest collection"""
    harvest_data = state.get("harvest_data", {
        "harvest_id": state.get("harvest_id", ""),
        "farm_id": state.get("farm_id", ""),
        "files": {},
        "artifacts": [],
        "timestamp": datetime.now().isoformat()
    })
    
    # Merge files
    harvest_data["files"].update(files)
    
    return Command(
        update={
            "harvest_data": harvest_data,
            "messages": [
                ToolMessage(f"Added {len(files)} files to harvest", tool_call_id=tool_call_id)
            ],
        }
    )

# ===== Coordination Tools =====

@tool(description="Share information with other agents in the farm")
def broadcast_to_agents(
    message: str,
    data: Dict[str, Any],
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Broadcast information to other agents"""
    coordination_path = Path(state.get("coordination_path", "/tmp/maibarn/coordination"))
    farm_id = state.get("farm_id", "unknown")
    
    try:
        # Write to coordination file
        coord_file = coordination_path / f"farm_{farm_id}_broadcast.json"
        coord_file.parent.mkdir(parents=True, exist_ok=True)
        
        broadcast_data = {
            "message": message,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "farm_id": farm_id
        }
        
        with open(coord_file, 'w') as f:
            json.dump(broadcast_data, f, indent=2)
        
        # Update coordination data in state
        coord_data = state.get("coordination_data", {})
        coord_data["last_broadcast"] = broadcast_data
        
        return Command(
            update={
                "coordination_data": coord_data,
                "messages": [
                    ToolMessage(f"Broadcast sent: {message}", tool_call_id=tool_call_id)
                ],
            }
        )
    except Exception as e:
        return Command(
            update={
                "messages": [
                    ToolMessage(f"Failed to broadcast: {str(e)}", tool_call_id=tool_call_id)
                ],
            }
        )

@tool(description="Read coordination messages from other agents")
def read_agent_coordination(
    state: Annotated[MaiFarmState, InjectedState]
) -> List[Dict[str, Any]]:
    """Read coordination messages from other agents"""
    coordination_path = Path(state.get("coordination_path", "/tmp/maibarn/coordination"))
    farm_id = state.get("farm_id", "unknown")
    
    messages = []
    try:
        # Read all coordination files for this farm
        for coord_file in coordination_path.glob(f"farm_{farm_id}_*.json"):
            with open(coord_file, 'r') as f:
                data = json.load(f)
                messages.append(data)
        
        # Sort by timestamp
        messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return messages[:10]  # Return latest 10 messages
    except Exception as e:
        return [{"error": f"Failed to read coordination: {str(e)}"}]

# ===== Execution Tools =====

@tool(description="Execute a shell command in the workspace")
def execute_command(
    command: str,
    working_dir: Optional[str] = None,
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Execute a shell command"""
    workspace_path = Path(state.get("workspace_path", "/tmp/workspace"))
    
    if working_dir:
        cwd = workspace_path / working_dir
    else:
        cwd = workspace_path
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            cwd=str(cwd),
            timeout=30  # 30 second timeout
        )
        
        output = result.stdout if result.returncode == 0 else result.stderr
        
        # Store terminal output
        terminal_outputs = state.get("terminal_outputs", {})
        if "commands" not in terminal_outputs:
            terminal_outputs["commands"] = []
        terminal_outputs["commands"].append({
            "command": command,
            "output": output,
            "returncode": result.returncode,
            "timestamp": datetime.now().isoformat()
        })
        
        return Command(
            update={
                "terminal_outputs": terminal_outputs,
                "messages": [
                    ToolMessage(f"Command executed: {command}\nOutput: {output[:500]}", 
                              tool_call_id=tool_call_id)
                ],
            }
        )
    except subprocess.TimeoutExpired:
        return Command(
            update={
                "messages": [
                    ToolMessage(f"Command timed out: {command}", tool_call_id=tool_call_id)
                ],
            }
        )
    except Exception as e:
        return Command(
            update={
                "messages": [
                    ToolMessage(f"Command failed: {str(e)}", tool_call_id=tool_call_id)
                ],
            }
        )

# ===== Memory Tools =====

@tool(description="Store information in agent memory for future reference")
def store_memory(
    key: str,
    value: Any,
    memory_type: str = "general",
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Store information in agent memory"""
    memory = state.get("memory", {})
    
    if memory_type not in memory:
        memory[memory_type] = {}
    
    memory[memory_type][key] = {
        "value": value,
        "timestamp": datetime.now().isoformat()
    }
    
    return Command(
        update={
            "memory": memory,
            "messages": [
                ToolMessage(f"Stored in memory: {key} ({memory_type})", tool_call_id=tool_call_id)
            ],
        }
    )

@tool(description="Retrieve information from agent memory")
def retrieve_memory(
    key: str,
    memory_type: str = "general",
    state: Annotated[MaiFarmState, InjectedState]
) -> Any:
    """Retrieve information from agent memory"""
    memory = state.get("memory", {})
    
    if memory_type in memory and key in memory[memory_type]:
        return memory[memory_type][key]["value"]
    
    return None

# ===== Performance Monitoring Tools =====

@tool(description="Update performance metrics")
def update_metrics(
    metric_name: str,
    value: float,
    state: Annotated[MaiFarmState, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId]
) -> Command:
    """Update performance metrics"""
    metrics = state.get("metrics", {})
    
    if metric_name not in metrics:
        metrics[metric_name] = []
    
    metrics[metric_name].append({
        "value": value,
        "timestamp": datetime.now().isoformat()
    })
    
    # Keep only last 100 measurements
    if len(metrics[metric_name]) > 100:
        metrics[metric_name] = metrics[metric_name][-100:]
    
    return Command(
        update={
            "metrics": metrics,
            "messages": [
                ToolMessage(f"Updated metric: {metric_name} = {value}", tool_call_id=tool_call_id)
            ],
        }
    )