#!/usr/bin/env python3
"""
MaiFarm ReapAgents Hybrid Orchestrator

Integrates the advanced ReapAgents deep agent system with MaiFarm's existing
multi-Claude orchestration capabilities. Provides intelligent mode selection
based on task complexity and seamless switching between orchestration engines.

Usage:
    # Use ReapAgents mode (default for complex tasks)
    python orchestrator_reap.py -n 3 -p "Build a complete web application" --mode reap
    
    # Use traditional multi-Claude mode
    python orchestrator_reap.py -n 5 -p "Fix TypeScript errors" --mode traditional
    
    # Auto-select mode based on task analysis
    python orchestrator_reap.py -n 3 -p "Implement feature X" --mode auto
"""

import argparse
import json
import logging
import os
import sys
import time
import signal
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List

# Add ReapAgents to path
sys.path.insert(0, str(Path(__file__).parent / "server" / "orchestrators"))

# Import ReapAgents
try:
    from reapagents import ReapOrchestrator, ReapConfig
    from reapagents.orchestrator import run_reap_orchestrator
    REAPAGENTS_AVAILABLE = True
except ImportError as e:
    print(f"Warning: ReapAgents not available: {e}")
    REAPAGENTS_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s'
)
logger = logging.getLogger("orchestrator_reap")

class TaskAnalyzer:
    """Analyzes tasks to determine optimal orchestration mode"""
    
    # Keywords indicating complex tasks suitable for ReapAgents
    COMPLEX_KEYWORDS = [
        "architecture", "design", "system", "complete", "full",
        "application", "feature", "implement", "build", "create",
        "comprehensive", "test", "security", "performance",
        "optimize", "refactor", "migrate", "integrate"
    ]
    
    # Keywords indicating simple tasks suitable for traditional mode
    SIMPLE_KEYWORDS = [
        "fix", "bug", "error", "typo", "update", "change",
        "rename", "move", "delete", "add", "remove", "modify",
        "adjust", "tweak", "correct", "patch"
    ]
    
    @classmethod
    def analyze_task(cls, task: str) -> Dict[str, Any]:
        """
        Analyze a task to determine complexity and recommended mode
        
        Args:
            task: Task description
        
        Returns:
            Analysis results with recommendation
        """
        task_lower = task.lower()
        
        # Count keyword matches
        complex_score = sum(1 for keyword in cls.COMPLEX_KEYWORDS if keyword in task_lower)
        simple_score = sum(1 for keyword in cls.SIMPLE_KEYWORDS if keyword in task_lower)
        
        # Estimate task complexity
        word_count = len(task.split())
        has_steps = "step" in task_lower or "phase" in task_lower
        has_requirements = "requirement" in task_lower or "spec" in task_lower
        
        # Calculate complexity score
        complexity_score = (
            complex_score * 2 +
            (1 if word_count > 20 else 0) +
            (2 if has_steps else 0) +
            (2 if has_requirements else 0) -
            simple_score
        )
        
        # Determine recommendation
        if complexity_score >= 4:
            mode = "reap"
            confidence = min(0.9, 0.5 + complexity_score * 0.1)
        elif complexity_score <= 0:
            mode = "traditional"
            confidence = min(0.9, 0.7 - complexity_score * 0.1)
        else:
            mode = "reap" if REAPAGENTS_AVAILABLE else "traditional"
            confidence = 0.5
        
        return {
            "mode": mode,
            "complexity_score": complexity_score,
            "confidence": confidence,
            "complex_matches": complex_score,
            "simple_matches": simple_score,
            "word_count": word_count,
            "has_steps": has_steps,
            "has_requirements": has_requirements
        }

class HybridOrchestrator:
    """
    Hybrid orchestrator that can use either ReapAgents or traditional mode
    """
    
    def __init__(
        self,
        farm_id: str,
        num_agents: int,
        provider: str = "claude",
        mode: str = "auto",
        timeout: int = 300000,
        debug: bool = False
    ):
        """
        Initialize hybrid orchestrator
        
        Args:
            farm_id: Unique farm identifier
            num_agents: Number of agents to spawn
            provider: AI provider (claude, openai, qwen, ollama)
            mode: Orchestration mode (reap, traditional, auto)
            timeout: Execution timeout in milliseconds
            debug: Enable debug logging
        """
        self.farm_id = farm_id
        self.num_agents = num_agents
        self.provider = provider
        self.mode = mode
        self.timeout = timeout
        self.debug = debug
        
        # Set up paths
        self.base_path = Path(os.environ.get("MAIBARN_ROOT", "/tmp/maibarn"))
        self.workspace_path = self.base_path / "workspaces" / farm_id
        self.coordination_path = self.base_path / "coordination"
        self.harvest_path = self.base_path / "harvests" / farm_id
        
        # Ensure directories exist
        self.workspace_path.mkdir(parents=True, exist_ok=True)
        self.coordination_path.mkdir(parents=True, exist_ok=True)
        self.harvest_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Initialized HybridOrchestrator for farm {farm_id}")
    
    def select_mode(self, task: str) -> str:
        """
        Select orchestration mode based on task analysis
        
        Args:
            task: Task description
        
        Returns:
            Selected mode (reap or traditional)
        """
        if self.mode != "auto":
            return self.mode
        
        # Analyze task
        analysis = TaskAnalyzer.analyze_task(task)
        
        logger.info(f"Task analysis: {analysis}")
        
        # Check if ReapAgents is available
        if analysis["mode"] == "reap" and not REAPAGENTS_AVAILABLE:
            logger.warning("ReapAgents recommended but not available, falling back to traditional")
            return "traditional"
        
        logger.info(f"Selected mode: {analysis['mode']} (confidence: {analysis['confidence']:.2f})")
        
        return analysis["mode"]
    
    def run_reap_mode(self, task: str, instructions: str = "") -> Dict[str, Any]:
        """
        Run using ReapAgents orchestration
        
        Args:
            task: Task to execute
            instructions: Additional instructions
        
        Returns:
            Execution results
        """
        if not REAPAGENTS_AVAILABLE:
            return {
                "status": "error",
                "error": "ReapAgents not available. Install required dependencies."
            }
        
        logger.info("Running in ReapAgents mode")
        
        # Combine task and instructions
        full_task = task
        if instructions:
            full_task = f"{instructions}\n\nTask: {task}"
        
        # Run ReapAgents orchestrator
        results = run_reap_orchestrator(
            farm_id=self.farm_id,
            task=full_task,
            num_agents=self.num_agents,
            provider=self.provider,
            timeout=self.timeout,
            debug=self.debug,
            workspace_path=str(self.workspace_path),
            coordination_path=str(self.coordination_path),
            harvest_path=str(self.harvest_path),
            collaborative=True,
            parallel_execution=True,
            enable_sub_agents=True,
            auto_harvest=True,
            metrics_enabled=True
        )
        
        return results
    
    def run_traditional_mode(self, task: str, instructions: str = "") -> Dict[str, Any]:
        """
        Run using traditional multi-Claude orchestration
        
        Args:
            task: Task to execute
            instructions: Additional instructions
        
        Returns:
            Execution results
        """
        logger.info("Running in traditional multi-Claude mode")
        
        # Use the existing orchestrator.py
        orchestrator_path = Path(__file__).parent / "orchestrator.py"
        
        if not orchestrator_path.exists():
            return {
                "status": "error",
                "error": f"Traditional orchestrator not found at {orchestrator_path}"
            }
        
        # Build command
        cmd = [
            sys.executable,
            str(orchestrator_path),
            "-n", str(self.num_agents),
            "-p", task,
            "--farm-id", self.farm_id,
            "--timeout", str(self.timeout // 1000),  # Convert to seconds
        ]
        
        if instructions:
            # Save instructions to file
            instructions_file = self.workspace_path / "instructions.txt"
            instructions_file.write_text(instructions)
            cmd.extend(["--context-files", str(instructions_file)])
        
        if self.debug:
            cmd.append("--debug")
        
        # Add provider-specific settings
        env = os.environ.copy()
        env["AI_PROVIDER"] = self.provider
        
        try:
            # Run traditional orchestrator
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                env=env,
                timeout=self.timeout / 1000
            )
            
            # Parse output
            if result.returncode == 0:
                return {
                    "status": "success",
                    "output": result.stdout,
                    "mode": "traditional"
                }
            else:
                return {
                    "status": "error",
                    "error": result.stderr or "Traditional orchestrator failed",
                    "mode": "traditional"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "status": "error",
                "error": "Execution timeout",
                "mode": "traditional"
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "mode": "traditional"
            }
    
    def run(self, task: str, instructions: str = "") -> Dict[str, Any]:
        """
        Run orchestration with automatic mode selection
        
        Args:
            task: Task to execute
            instructions: Additional instructions
        
        Returns:
            Execution results
        """
        # Select mode
        selected_mode = self.select_mode(task)
        
        # Save mode selection
        mode_file = self.harvest_path / "orchestration_mode.txt"
        mode_file.write_text(selected_mode)
        
        # Run in selected mode
        if selected_mode == "reap":
            results = self.run_reap_mode(task, instructions)
        else:
            results = self.run_traditional_mode(task, instructions)
        
        # Add mode information to results
        results["orchestration_mode"] = selected_mode
        results["farm_id"] = self.farm_id
        
        # Save results
        results_file = self.harvest_path / "orchestration_results.json"
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        logger.info(f"Orchestration complete. Results saved to {results_file}")
        
        return results

def main():
    """Main entry point"""
    
    parser = argparse.ArgumentParser(
        description="MaiFarm ReapAgents Hybrid Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-select mode based on task
  %(prog)s -n 3 -p "Build a REST API with authentication"
  
  # Force ReapAgents mode for deep planning
  %(prog)s -n 5 -p "Refactor the codebase" --mode reap
  
  # Use traditional mode for simple fixes
  %(prog)s -n 2 -p "Fix TypeScript errors" --mode traditional
  
  # Load task from YAML file
  %(prog)s -n 4 --prompt-file task.yaml --mode auto
        """
    )
    
    parser.add_argument("-n", "--num-agents", type=int, default=3,
                       help="Number of agents to spawn (default: 3)")
    
    parser.add_argument("-p", "--prompt", type=str,
                       help="Task prompt for agents")
    
    parser.add_argument("--prompt-file", type=str,
                       help="YAML file containing task prompt")
    
    parser.add_argument("--mode", choices=["auto", "reap", "traditional"],
                       default="auto",
                       help="Orchestration mode (default: auto)")
    
    parser.add_argument("--provider", choices=["claude", "openai", "qwen", "ollama"],
                       default="claude",
                       help="AI provider (default: claude)")
    
    parser.add_argument("--farm-id", type=str,
                       default=f"farm-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                       help="Unique farm identifier")
    
    parser.add_argument("--timeout", type=int, default=300,
                       help="Execution timeout in seconds (default: 300)")
    
    parser.add_argument("--debug", action="store_true",
                       help="Enable debug logging")
    
    parser.add_argument("--instructions", type=str,
                       help="Additional instructions for agents")
    
    args = parser.parse_args()
    
    # Load prompt
    if args.prompt:
        task = args.prompt
    elif args.prompt_file:
        try:
            import yaml
            with open(args.prompt_file, 'r') as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    task = data.get("prompt", "") or data.get("task", "")
                    args.instructions = args.instructions or data.get("instructions", "")
                else:
                    task = str(data)
        except Exception as e:
            print(f"Error loading prompt file: {e}")
            sys.exit(1)
    else:
        print("Error: Either --prompt or --prompt-file must be provided")
        parser.print_help()
        sys.exit(1)
    
    # Configure logging
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create and run orchestrator
    orchestrator = HybridOrchestrator(
        farm_id=args.farm_id,
        num_agents=args.num_agents,
        provider=args.provider,
        mode=args.mode,
        timeout=args.timeout * 1000,  # Convert to milliseconds
        debug=args.debug
    )
    
    try:
        results = orchestrator.run(task, args.instructions or "")
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"Orchestration Complete - Mode: {results.get('orchestration_mode', 'unknown')}")
        print("=" * 60)
        
        if results["status"] == "success":
            print(f"✅ Success - Farm ID: {results['farm_id']}")
            
            if "metrics" in results:
                metrics = results["metrics"]
                print(f"\nMetrics:")
                print(f"  Duration: {metrics.get('duration', 0):.2f} seconds")
                print(f"  Agents: {metrics.get('num_agents', 0)}")
                
                if "agents" in metrics:
                    for agent in metrics["agents"]:
                        print(f"\n  Agent {agent['index'] + 1}:")
                        print(f"    Todos: {agent['todos_completed']}/{agent['todos_total']}")
                        print(f"    Files: {agent['files_created']}")
            
            if "harvest" in results:
                harvest = results["harvest"]
                print(f"\nHarvest:")
                print(f"  Files: {len(harvest.get('files', {}))}")
                print(f"  Artifacts: {len(harvest.get('artifacts', []))}")
        else:
            print(f"❌ Failed: {results.get('error', 'Unknown error')}")
        
        print("\n" + "=" * 60)
        
        # Exit with appropriate code
        sys.exit(0 if results["status"] == "success" else 1)
        
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()