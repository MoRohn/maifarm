# 🚜 MaiFarm Command Structure

MaiFarm provides two interfaces that can be accessed through a unified `farm` command:

## Command Overview

| Command | Description | Interface |
|---------|-------------|-----------|
| `farm` | Start MaiFarm UI (Dashboard) | Web UI |
| `farm` | Start MaiFarm CLI | Command Line |

## Usage

### Starting the UI (Web Dashboard)
```bash
# Start the full MaiFarm web interface
farm

# This runs: npm run dev
# Opens dashboard at http://localhost:3000
# API server at http://localhost:4567
```

### Starting the CLI
```bash
# Interactive CLI mode
farm

# Direct CLI commands
farm create my-farm
farm list
farm watch <farm-id>
farm harvest <farm-id>
farm help
```

## Installation

```bash
# Install MaiFarm
npm install

# Setup the CLI
npm run setup:cli

# The 'farm' command will be available globally
```

## CLI Commands

All CLI commands are prefixed with `farm`:

### Farm Management
```bash
farm create <name>          # Create a new farm
farm list                   # List all farms
farm watch <id>             # Watch farm progress
farm harvest <id>           # Harvest results
```

### Quick Operations
```bash
farm quick "task"           # 5-minute sprint task
farm wild "goal"            # Autonomous exploration
```

### AI-Powered Features
```bash
farm refine <prompt>        # Optimize prompts with Claude
farm plan <goal>            # AI task planning
farm assistant              # Interactive AI chat
farm diagnose <id>          # AI troubleshooting
farm analyze <id>           # Performance analysis
```

### Utilities
```bash
farm stats                  # System dashboard
farm tips                   # Get farming tips
farm help                   # Show all commands
```

## Examples

### Using the UI
```bash
# Start the dashboard
farm

# Then open http://localhost:3000 in your browser
# Create farms through the web interface
```

### Using the CLI
```bash
# Start interactive mode
farm

# Or run commands directly
farm create auth-fix --agents 3 --mode quick
farm watch <farm-id>
farm harvest <farm-id> -o ./output
```

### Combining Both
```bash
# You can use both simultaneously!

# Terminal 1: Run the UI
farm

# Terminal 2: Use the CLI
farm create backend-api --agents 5
farm watch <farm-id>
```

## Quick Reference

```bash
# UI
farm                    → Web Dashboard

# CLI - Basic
farm                → Interactive mode
farm create         → New farm
farm list           → List farms
farm watch          → Monitor farm

# CLI - AI Enhanced
farm refine         → Optimize prompts
farm assistant      → Chat with Claude
farm diagnose       → Fix issues
farm plan           → Task planning

# CLI - Quick Actions
farm quick          → 5-min sprint
farm wild           → Autonomous mode
```

## Configuration

Both interfaces share the same backend and configuration:

- **API URL**: `http://localhost:4567`
- **Dashboard**: `http://localhost:3000`
- **Config**: `~/.maifarm/config.json`
- **Workspaces**: `/var/maibarn/workspaces/`

---

**Happy Farming!** 🚜🌾

Choose your interface:
- `farm` for the visual dashboard experience
- `farm` for command-line power users