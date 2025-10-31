#!/usr/bin/env python3
"""
Enhanced Mock Agent with Proper Name Display
"""
import os
import sys
import time
import random
import json
from datetime import datetime

# Get agent info from environment
agent_id = os.environ.get('AGENT_ID', '0')
agent_name = os.environ.get('AGENT_NAME', f'Agent {agent_id}')
session_name = os.environ.get('SESSION_NAME', 'unknown')
farm_id = os.environ.get('FARM_ID', 'unknown')
prompt = os.environ.get('AGENT_PROMPT', 'Default test prompt')

# ANSI color codes for pretty output
COLORS = {
    'header': '\033[95m',
    'blue': '\033[94m',
    'cyan': '\033[96m',
    'green': '\033[92m',
    'warning': '\033[93m',
    'fail': '\033[91m',
    'end': '\033[0m',
    'bold': '\033[1m',
    'underline': '\033[4m',
}

def print_colored(text, color='end'):
    """Print with ANSI color codes"""
    print(f"{COLORS.get(color, '')}{text}{COLORS['end']}", flush=True)

# Print agent header with clear identification
print_colored("\n" + "="*60, 'header')
print_colored(f"🤖 {agent_name}", 'bold')
print_colored("="*60, 'header')

# Display agent metadata
print_colored(f"📋 Agent ID: {agent_id}", 'cyan')
print_colored(f"🏷️  Name: {agent_name}", 'cyan')
print_colored(f"🌾 Farm: {farm_id[:8]}...", 'cyan')
print_colored(f"🖥️  Session: {session_name}", 'cyan')
print_colored(f"🕐 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", 'cyan')
print_colored("-"*60, 'blue')

# Display received prompt
print_colored("\n📝 Task Assignment:", 'green')
print(f"{prompt[:200]}..." if len(prompt) > 200 else prompt, flush=True)
print_colored("-"*60, 'blue')

# Agent-specific personality based on name
personalities = {
    'Bessie the Cow': ['🐄', 'Moo-ving forward', 'Grazing through the data', 'Milking insights'],
    'Cluck the Chicken': ['🐔', 'Pecking at problems', 'Laying golden solutions', 'Scratching up insights'],
    'Wilbur the Pig': ['🐷', 'Digging deep', 'Rolling in success', 'Sniffing out solutions'],
    'Charlotte the Spider': ['🕷️', 'Weaving connections', 'Spinning solutions', 'Building networks'],
    'Explorer Alpha': ['🚀', 'Exploring frontiers', 'Discovering patterns', 'Charting territory'],
    'Innovator Beta': ['💡', 'Innovating solutions', 'Creating breakthroughs', 'Designing futures'],
}

# Get personality for this agent
agent_personality = personalities.get(agent_name, ['🤖', 'Processing', 'Computing', 'Analyzing'])
emoji = agent_personality[0]

print_colored(f"\n{emoji} {agent_name} is starting work!", 'green')
print_colored("="*60 + "\n", 'blue')

# Simulate agent work with unique messages
work_messages = [
    f"Initializing {agent_name}'s workspace",
    f"Loading specialized tools for {agent_name}",
    f"Connecting to knowledge base",
    f"Analyzing task requirements"
]

for msg in work_messages:
    print_colored(f"⚙️  {msg}...", 'cyan')
    time.sleep(0.5)

print_colored(f"\n✅ {agent_name} ready and operational!\n", 'green')

# Main work loop with unique personality
counter = 0
try:
    while True:
        counter += 1
        timestamp = time.strftime("%H:%M:%S")

        # Use agent-specific messages
        action = random.choice(agent_personality[1:])
        progress = random.randint(1, 100)

        # Vary output format to show uniqueness
        if counter % 5 == 0:
            print_colored(f"[{timestamp}] {emoji} {agent_name}: {action}... [{progress}% complete]", 'green')
        elif counter % 3 == 0:
            print_colored(f"[{timestamp}] {emoji} {action} (Task #{counter})", 'cyan')
        else:
            print(f"[{timestamp}] {agent_name}: {action}", flush=True)

        # Occasionally output structured data
        if counter % 10 == 0:
            status = {
                "agent": agent_name,
                "id": agent_id,
                "iteration": counter,
                "status": "active",
                "progress": progress,
                "timestamp": datetime.now().isoformat()
            }
            print_colored(f"📊 Status: {json.dumps(status, indent=2)}", 'blue')

        # Variable sleep for more realistic behavior
        time.sleep(random.uniform(2, 6))

except KeyboardInterrupt:
    print_colored(f"\n⏹️  {agent_name} ({agent_id}) shutting down gracefully", 'warning')
    print_colored(f"Completed {counter} iterations", 'cyan')
    sys.exit(0)
