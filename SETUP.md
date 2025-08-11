# MaiFarm Setup Guide

MaiFarm now includes a comprehensive automated setup system that handles all dependencies and configuration automatically.

## Quick Start (Recommended)

For new installations, simply run:

```bash
npm install
npm run setup
```

This will automatically:
- Install and configure PostgreSQL
- Install and configure Redis  
- Set up Python dependencies for LLM proxy
- Create environment configuration
- Verify all dependencies
- Run initial database migrations

## Manual Setup Commands

### Complete Setup
```bash
npm run setup:all        # Run complete automated setup
npm run setup           # Alias for setup:all
```

### Individual Components
```bash
npm run setup:postgres   # Setup PostgreSQL only
npm run setup:doctor     # Diagnose and fix issues
npm run setup:verify     # Verify current setup
npm run setup:clean      # Clean and reset everything
```

## Development Workflow

### Starting the Application
```bash
npm run start           # Enhanced startup with automatic setup checks
npm run dev            # Alternative development mode
```

The startup script now automatically:
- Checks for missing dependencies
- Verifies database connectivity
- Offers to run setup if needed
- Provides helpful error messages

### Troubleshooting
```bash
npm run setup:doctor    # Comprehensive diagnostic tool
npm run setup:doctor --fix  # Auto-fix common issues
```

The setup doctor checks:
- System requirements (Node.js, npm)
- Database connections (PostgreSQL, Redis)
- Project dependencies
- Environment configuration
- Port availability
- File permissions

### Clean Installation
```bash
npm run setup:clean     # Reset everything and reinstall
```

This will:
- Stop all running processes
- Remove node_modules and build artifacts
- Clean logs and temporary files
- Optionally reset the database
- Reinstall everything fresh

## System Requirements

### Automatic Installation
The setup scripts will automatically install:
- **PostgreSQL 15+** - Primary database
- **Redis 7+** - Caching and sessions (optional but recommended)
- **Python 3.8+** - For LLM proxy server (optional)

### Prerequisites
You need to have installed:
- **Node.js 18+** - JavaScript runtime
- **npm 8+** - Package manager

#### macOS Prerequisites
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Linux Prerequisites
```bash
# Ubuntu/Debian
sudo apt update

# CentOS/RHEL/Fedora
sudo yum update -y
```

## Setup Process Details

### 1. PostgreSQL Setup
- Detects existing installation or installs PostgreSQL 15
- Creates `maifarm_dev` database
- Creates `maifarm` user with appropriate permissions
- Configures connection settings in `.env.development`
- Tests database connectivity

### 2. Redis Setup (Optional)
- Installs Redis if not present
- Starts Redis service
- Configures connection for caching and sessions
- Falls back gracefully if Redis unavailable

### 3. Environment Configuration
- Creates `.env.development` from template
- Configures database connection strings
- Sets up AI provider configuration
- Configures security and session settings

### 4. Python Dependencies (Optional)
- Installs dependencies for LLM proxy server
- Supports multiple AI providers (Claude, OpenAI, Qwen)
- Enables advanced multi-agent features

## Environment Configuration

The setup creates `.env.development` with:

```bash
# Core Application
NODE_ENV=development
PORT=4567
BYPASS_AUTH=true

# Database (Auto-configured)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Providers
AI_PROVIDER=claude
CLAUDE_API_KEY=your-api-key-here
QWEN_ENABLED=false
USE_LLM_PROXY=false
```

## Verification

After setup, verify everything is working:

```bash
npm run setup:verify    # Run diagnostic checks
npm run start          # Start the application
npm test              # Run test suite
```

## Common Issues and Solutions

### PostgreSQL Connection Issues
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL service
# macOS:
brew services start postgresql@15
# Linux:
sudo systemctl start postgresql
```

### Port Conflicts
```bash
# Check what's using a port
lsof -i :4567

# Kill processes using MaiFarm ports
npm run setup:clean
```

### Permission Issues
```bash
# Fix script permissions
chmod +x scripts/*.sh

# Fix directory permissions
npm run setup:doctor --fix
```

### Dependency Issues
```bash
# Clean reinstall
npm run setup:clean

# Or manually:
rm -rf node_modules package-lock.json
npm install
npm run setup:all
```

## Docker Alternative

If you prefer Docker for development:

```bash
# Start all services with Docker
npm run docker:up

# Or production setup
npm run docker:prod:up
```

## Advanced Configuration

### Multiple AI Providers
```bash
# Enable Qwen provider
export AI_PROVIDER=qwen
export QWEN_API_KEY=your-dashscope-key

# Start LLM proxy server
npm run proxy:start
```

### Monitoring Setup
```bash
# Enable monitoring stack (Prometheus + Grafana)
docker-compose -f docker-compose.monitoring.yml up -d
```

### Production Setup
```bash
# Production environment setup
NODE_ENV=production npm run setup:all
npm run build
npm run start:prod
```

## Getting Help

### Diagnostic Tools
```bash
npm run setup:doctor           # Full system diagnostic
npm run setup:verify          # Quick verification
```

### Support Resources
- Check the `logs/` directory for application logs
- Run `npm run setup:doctor` for automated diagnostics
- Use `npm run setup:clean` for clean reinstallation
- Review this guide and `CLAUDE.md` for configuration details

### Reset Everything
If you need to start completely fresh:

```bash
npm run setup:clean    # Interactive clean setup
# or
rm -rf node_modules .env.development
dropdb maifarm_dev --if-exists
npm install
npm run setup:all
```

## Next Steps

After successful setup:
1. **Start Development**: `npm run start`
2. **Run Tests**: `npm test`
3. **Explore Features**: Visit http://localhost:3000
4. **Check Documentation**: See `CLAUDE.md` for detailed usage

The automated setup system ensures you can get MaiFarm running quickly with minimal manual configuration!