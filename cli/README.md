# 🚜 MaiFarm CLI

> **"Where Code Grows and Harvests Flow!"** 🌾

[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/maifarm/maifarm-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)

MaiFarm CLI brings the full power of multi-agent AI orchestration to your terminal with a delightful, farm-themed command-line interface. Plant farms, manage agents, harvest results, and watch your code grow!

## 🌟 Features

- **🌱 Farm Management**: Create and manage AI agent farms from your terminal
- **🚜 Tmux Integration**: Each agent runs in its own tmux pane for real-time monitoring
- **🦅 Multiple Modes**: Standard, Quick (5-min), and Wild (autonomous) modes
- **🎮 Interactive Mode**: Guided wizards for all operations
- **🌾 Harvest System**: Collect and organize agent outputs
- **🏚️ Barn Storage**: Share resources between farms
- **📊 Real-time Monitoring**: Watch agents work with live terminal streaming
- **🎨 Fun & Witty**: Farm jokes, animal sounds, weather reports, and ASCII art
- **⚡ WebSocket Support**: Real-time updates and notifications
- **🔧 Extensible**: Plugin system for custom commands

## 📦 Installation

### Quick Install (Recommended)

```bash
# Clone the repository
git clone https://github.com/maifarm/maifarm-cli.git
cd maifarm-cli

# Run the installation script
chmod +x install.sh
./install.sh
```

### Manual Installation

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Link globally
npm link

# Verify installation
farm --version
```

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **tmux**: (Optional but recommended)
  - macOS: `brew install tmux`
  - Ubuntu: `sudo apt-get install tmux`
  - RHEL/CentOS: `sudo yum install tmux`

## 🚀 Quick Start

### Interactive Mode (Easiest)

```bash
# Start the interactive CLI
farm

# Or explicitly
farm interactive
```

### Create Your First Farm

```bash
# Basic farm creation
farm create my-first-farm

# With options
farm create bug-fix --agents 3 --mode quick --prompt "Fix the authentication bug"

# Using the alias
farm plant feature-farm -a 5 -m standard
```

### Watch Agents Work

```bash
# Watch all agents in a farm
farm watch <farm-id>

# Watch specific agent
farm watch <farm-id> --agent 2

# Open tmux dashboard
farm tmux <farm-id>
```

### Harvest Results

```bash
# Harvest completed work
farm harvest <farm-id>

# Preview before harvesting
farm harvest <farm-id> --preview

# Save to specific location
farm harvest <farm-id> -o ./my-harvest
```

## 📚 Command Reference

### Core Commands

| Command | Alias | Description | Example |
|---------|-------|-------------|---------|
| `create <name>` | `plant` | Create a new farm | `farm create auth-fix` |
| `list` | `ls` | List all farms | `farm list --status running` |
| `watch <id>` | `monitor` | Watch farm progress | `farm watch abc-123` |
| `harvest <id>` | `reap` | Collect farm results | `farm harvest abc-123` |
| `quick <prompt>` | `qt` | Run 5-minute task | `farm quick "Fix typo"` |
| `wild <prompt>` | `gw` | Launch autonomous agents | `farm wild "Explore solutions"` |

### Farm Management

```bash
# Create a standard farm
farm create my-farm --agents 3 --prompt "Build a REST API"

# Quick task (5 minutes)
farm quick "Fix the login bug" --agents 2

# Wild mode (autonomous)
farm wild "Optimize the database" --agents 5 --timeout 30

# List farms with filters
farm list --status running --limit 10
farm list --json  # JSON output for scripting
```

### Tmux Integration

```bash
# View farm in tmux
farm tmux <farm-id>

# Attach to specific agent
farm tmux <farm-id> --agent 2

# List all tmux sessions
farm tmux list

# Create multi-farm dashboard
farm tmux dashboard <farm-id-1> <farm-id-2>

# Kill tmux session
farm tmux kill <farm-id>
```

### Barn Commands

```bash
# List barn items
farm barn list

# Store in barn
farm barn store <file> --name "auth-module"

# Retrieve from barn
farm barn get auth-module

# Search barn
farm barn search "auth"

# Clean old items
farm barn cleanup --older-than 30d
```

### Monitoring & Stats

```bash
# View system dashboard
farm stats
farm dashboard

# Check farm health
farm health <farm-id>

# View metrics
farm metrics --json

# Show farm details
farm info <farm-id>
```

### Configuration

```bash
# Show current config
farm config

# Set API endpoint
farm config set apiUrl http://localhost:4567

# Toggle features
farm config set animalSounds false
farm config set weatherReports true
farm config set theme barn-red

# Reset to defaults
farm config reset
```

## 🎮 Interactive Mode

The interactive mode provides a guided, menu-driven experience:

```bash
farm interactive
# or just
farm
```

### Interactive Features

- **🌱 Farm Creation Wizard**: Step-by-step farm setup
- **📋 Template Library**: Pre-built prompts for common tasks
- **🎯 Mode Selection**: Detailed explanations of each mode
- **👥 Agent Personalities**: Give agents unique characteristics
- **🧺 Harvest Manager**: Preview and manage harvests
- **⚙️ Settings Panel**: Configure all options interactively

## 🎨 Themes & Customization

### Available Themes

- `barn-red` (default): Classic farm colors
- `meadow-green`: Fresh green fields
- `sunset-orange`: Evening harvest theme
- `sky-blue`: Clear day farming
- `midnight-purple`: Night farming mode

### Set Theme

```bash
farm config set theme meadow-green
```

### Disable Fun Features

```bash
# Turn off for serious mode
farm config set animalSounds false
farm config set weatherReports false
farm config set jokes false
farm config set ascii false
```

## 🔧 Advanced Usage

### Scripting & Automation

```bash
# Use JSON output for scripting
FARM_ID=$(farm create test --json | jq -r '.id')
farm watch $FARM_ID --json | jq '.status'

# Batch operations
for i in {1..5}; do
  farm create "farm-$i" --agents 2 --no-launch
done

# Chain commands
farm create pipeline && farm watch $(farm list --json | jq -r '.[0].id')
```

### Environment Variables

```bash
export MAIFARM_API_URL=http://localhost:4567
export MAIFARM_THEME=meadow-green
export MAIFARM_QUIET=true  # Disable fun features
```

### Configuration File

Located at `~/.maifarm/config.json`:

```json
{
  "apiUrl": "http://localhost:4567",
  "theme": "barn-red",
  "animalSounds": true,
  "weatherReports": true,
  "tips": true,
  "ascii": true,
  "defaultAgents": 3,
  "defaultMode": "standard",
  "autoHarvest": false,
  "notifications": true
}
```

## 🐛 Troubleshooting

### Common Issues

#### Command not found

```bash
# Check if installed
npm list -g @maifarm/cli

# Re-link if needed
cd /path/to/maifarm-cli
npm link

# Add to PATH
export PATH="$(npm bin -g):$PATH"
```

#### API Connection Issues

```bash
# Check if server is running
curl http://localhost:4567/api/health

# Set correct API URL
farm config set apiUrl http://your-server:4567
```

#### Tmux Issues

```bash
# Check tmux installation
which tmux

# Install if missing
brew install tmux  # macOS
sudo apt-get install tmux  # Ubuntu

# Check existing sessions
tmux list-sessions
```

#### Permission Errors

```bash
# Fix permissions
chmod +x install.sh

# Use sudo for global install
sudo npm link
```

## 📊 Examples

### Bug Fix Workflow

```bash
# 1. Create a quick task for the bug
farm quick "Fix null pointer in auth service" --agents 2

# 2. Watch progress
farm watch <farm-id>

# 3. Harvest the fix
farm harvest <farm-id> -o ./bugfixes/auth-fix
```

### Feature Development

```bash
# 1. Create a feature farm
farm create user-dashboard \
  --agents 5 \
  --mode standard \
  --prompt "Build a user dashboard with charts and widgets"

# 2. Monitor in tmux
farm tmux <farm-id>

# 3. Check progress
farm stats <farm-id>

# 4. Harvest when complete
farm harvest <farm-id>
```

### Exploration with Wild Mode

```bash
# Let agents explore solutions autonomously
farm wild "Find the best way to optimize our database queries" \
  --agents 4 \
  --timeout 60 \
  --xenosync

# Watch the chaos unfold
farm watch <farm-id>
```

## 🎯 Best Practices

1. **Start Small**: Begin with 2-3 agents for most tasks
2. **Clear Prompts**: Be specific about what you want
3. **Use Templates**: Leverage prompt templates for consistency
4. **Monitor Progress**: Use tmux view for real-time monitoring
5. **Harvest Often**: Collect results regularly
6. **Share via Barn**: Store reusable components
7. **Quick for Quick**: Use quick mode for 5-minute fixes
8. **Wild for Exploration**: Let agents roam free for creative solutions

## 🤝 Contributing

We love contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with love by the MaiFarm team
- Inspired by agricultural wisdom and AI innovation
- Special thanks to all our digital farmers!

## 📞 Support

- **Documentation**: [https://docs.maifarm.ai](https://docs.maifarm.ai)
- **Issues**: [GitHub Issues](https://github.com/maifarm/maifarm-cli/issues)
- **Discord**: [Join our Community](https://discord.gg/maifarm)
- **Email**: support@maifarm.ai

---

**Happy Farming!** 🚜🌾🐄

*"May your code grow tall and your bugs stay small!"*