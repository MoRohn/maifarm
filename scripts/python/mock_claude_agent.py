#!/usr/bin/env python3
"""
Mock Claude Agent for Development
Simulates Claude CLI behavior with realistic output when Claude CLI is not available.
"""
import os
import sys
import time
import random
import json
from datetime import datetime
from pathlib import Path

class MockClaudeAgent:
    def __init__(self, agent_id=0, session_name="mock-session"):
        self.agent_id = agent_id
        self.session_name = session_name
        self.workspace = os.environ.get('MAIFARM_WORKSPACE', '/tmp/maifarm-mock')
        self.prompt = self.get_prompt()
        
    def get_prompt(self):
        """Get the prompt from environment or arguments"""
        # Check if prompt was passed as argument
        if len(sys.argv) > 1:
            return ' '.join(sys.argv[1:])
        
        # Check environment variable
        prompt = os.environ.get('AGENT_PROMPT', '')
        if prompt:
            return prompt
            
        # Default prompt
        return "Help me build a feature for this project"
    
    def type_output(self, text, delay=0.05):
        """Simulate typing with character-by-character output"""
        for char in text:
            print(char, end='', flush=True)
            time.sleep(random.uniform(delay * 0.5, delay * 1.5))
        print()  # New line at the end
    
    def think(self, duration=2):
        """Simulate thinking with dots"""
        print("Thinking", end='', flush=True)
        for _ in range(3):
            time.sleep(duration / 3)
            print(".", end='', flush=True)
        print()
    
    def run(self):
        """Main agent simulation"""
        # Initial startup
        print(f"\n{'='*60}")
        print(f"Mock Claude Agent {self.agent_id} Starting")
        print(f"Session: {self.session_name}")
        print(f"Workspace: {self.workspace}")
        print(f"Time: {datetime.now().isoformat()}")
        print(f"{'='*60}\n")
        
        time.sleep(1)
        
        # Show the prompt
        print("📝 Received prompt:")
        print(f"   {self.prompt[:200]}{'...' if len(self.prompt) > 200 else ''}")
        print()
        
        # Simulate processing
        self.think(1.5)
        
        # Generate mock response based on prompt
        responses = self.generate_responses()
        
        for response in responses:
            self.type_output(response)
            time.sleep(random.uniform(0.5, 1.5))
        
        # Simulate file creation
        self.simulate_file_operations()
        
        # Keep running with periodic updates
        self.continuous_updates()
    
    def generate_responses(self):
        """Generate contextual responses based on the prompt"""
        responses = []
        
        # Analyze prompt for keywords
        prompt_lower = self.prompt.lower()
        
        if 'gowild' in prompt_lower or 'explore' in prompt_lower:
            responses = [
                "🚀 Starting Go Wild exploration mode...",
                "Analyzing creative possibilities in the codebase...",
                "Found interesting patterns to explore:",
                "  • Component architecture could be enhanced",
                "  • Performance optimizations available",
                "  • New feature opportunities detected",
                "Generating exploration nodes..."
            ]
        elif 'quick' in prompt_lower or 'task' in prompt_lower:
            responses = [
                "⚡ Quick Task mode activated",
                "Analyzing the requested task...",
                "Breaking down into actionable steps:",
                "  1. Understanding requirements",
                "  2. Checking existing codebase",
                "  3. Planning implementation",
                "Starting work on the task..."
            ]
        elif 'fix' in prompt_lower or 'bug' in prompt_lower:
            responses = [
                "🔍 Analyzing codebase for issues...",
                "Scanning files for potential bugs...",
                "Found areas that need attention:",
                "  • Type errors in 3 files",
                "  • Unused imports detected",
                "  • Potential null reference issues",
                "Working on fixes..."
            ]
        else:
            responses = [
                "👋 Hello! I'm ready to help with your project.",
                f"Processing request: {self.prompt[:100]}...",
                "Analyzing project structure...",
                "Identifying areas where I can assist...",
                "Starting work on your request..."
            ]
        
        return responses
    
    def simulate_file_operations(self):
        """Simulate creating/modifying files"""
        time.sleep(2)
        print("\n📁 File Operations:")
        
        # Create workspace directory if it doesn't exist
        workspace_path = Path(self.workspace)
        workspace_path.mkdir(parents=True, exist_ok=True)
        
        # Simulate file creation
        files = [
            "analysis-report.md",
            "implementation-plan.json",
            f"agent-{self.agent_id}-output.txt"
        ]
        
        for filename in files:
            filepath = workspace_path / filename
            print(f"  ✅ Creating {filename}")
            time.sleep(0.5)
            
            # Actually create the file with some content
            try:
                with open(filepath, 'w') as f:
                    content = {
                        "agent_id": self.agent_id,
                        "timestamp": datetime.now().isoformat(),
                        "prompt": self.prompt[:200],
                        "status": "working",
                        "mock": True
                    }
                    if filename.endswith('.json'):
                        json.dump(content, f, indent=2)
                    else:
                        f.write(f"# Output from Agent {self.agent_id}\n\n")
                        f.write(f"Timestamp: {datetime.now()}\n")
                        f.write(f"Prompt: {self.prompt[:200]}\n\n")
                        f.write("## Analysis\n\n")
                        f.write("This is simulated output from the mock agent.\n")
            except Exception as e:
                print(f"  ⚠️  Could not create {filename}: {e}")
    
    def continuous_updates(self):
        """Keep the agent running with periodic status updates"""
        update_messages = [
            "🔄 Continuing analysis...",
            "📊 Processing data structures...",
            "🔍 Examining code patterns...",
            "💡 Found optimization opportunity...",
            "📝 Documenting findings...",
            "🔧 Refactoring code section...",
            "✅ Completed subtask...",
            "🎯 Focusing on next objective...",
            "🤔 Evaluating alternatives...",
            "⚡ Making progress..."
        ]
        
        print("\n" + "="*40)
        print("Agent Active - Periodic Updates")
        print("="*40 + "\n")
        
        try:
            while True:
                # Wait between updates
                time.sleep(random.uniform(10, 30))
                
                # Print a random update
                message = random.choice(update_messages)
                timestamp = datetime.now().strftime("%H:%M:%S")
                print(f"[{timestamp}] Agent {self.agent_id}: {message}")
                
                # Occasionally show more detailed output
                if random.random() < 0.3:
                    self.show_detailed_update()
                    
        except KeyboardInterrupt:
            print(f"\n⏹️  Agent {self.agent_id} stopped by user")
            sys.exit(0)
    
    def show_detailed_update(self):
        """Show more detailed progress update"""
        updates = [
            {
                "type": "code_analysis",
                "output": [
                    "  Analyzed 15 files",
                    "  Found 3 improvement areas",
                    "  Suggested 5 refactorings"
                ]
            },
            {
                "type": "task_progress",
                "output": [
                    "  Task 1: ✅ Complete",
                    "  Task 2: 🔄 In Progress (75%)",
                    "  Task 3: ⏳ Queued"
                ]
            },
            {
                "type": "discovery",
                "output": [
                    "  💡 Discovered new pattern",
                    "  Could improve performance by 20%",
                    "  Implementing optimization..."
                ]
            }
        ]
        
        update = random.choice(updates)
        for line in update["output"]:
            print(line)
            time.sleep(0.3)

if __name__ == "__main__":
    # Get agent ID from environment
    agent_id = int(os.environ.get('AGENT_ID', '0'))
    session_name = os.environ.get('SESSION_NAME', 'mock-session')
    
    # Create and run mock agent
    agent = MockClaudeAgent(agent_id, session_name)
    agent.run()