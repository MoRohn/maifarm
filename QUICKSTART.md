# MaiFarm Quick Start Guide

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js 20+ (with npm)
- Docker Desktop (for Docker deployments)
- Git

## 🚀 5-Minute Quick Start

### Fastest Way to Run MaiFarm

```bash
# Clone and enter directory
git clone https://github.com/maifarm/maifarm.git
cd maifarm

# Install and run
npm install
cp .env.example .env.development
npm run dev
```

✅ **That's it!** MaiFarm is now running at:
- 🌐 Frontend: http://localhost:3000
- 🔌 API: http://localhost:4567

## Detailed Setup Options

### Option 1: Local Development (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/maifarm/maifarm.git
cd maifarm

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.development

# 4. Start development servers
npm run dev

# Alternative: Use the startup script
./scripts/startup.sh
```

### Option 2: Docker Compose (Full Stack)

```bash
# 1. Clone repository
git clone https://github.com/maifarm/maifarm.git
cd maifarm

# 2. Start all services
docker-compose up -d

# 3. View logs
docker-compose logs -f maifarm
```

This includes:
- ✅ MaiFarm application
- ✅ PostgreSQL database
- ✅ Redis cache
- ✅ Prometheus monitoring
- ✅ Grafana dashboards

### Option 3: Production Build

```bash
# 1. Build optimized Docker image
docker build -f Dockerfile.optimized -t maifarm:latest .

# 2. Run production container
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e BYPASS_AUTH=true \
  maifarm:latest
```

## 🎯 First Steps

### 1. Access the Dashboard
Navigate to http://localhost:3000

### 2. Create Your First Farm
```yaml
# Example: Simple code review farm
name: Code Review Farm
agents:
  - name: Reviewer
    task: Review code for best practices
  - name: Tester
    task: Write unit tests
  - name: Documenter
    task: Add documentation
```

### 3. Launch Multi-Agent Session
```bash
# Using the orchestrator.py script
python orchestrator.py -n 3 -p "Review and improve the codebase"
```

## 🛠️ Essential Commands

```bash
# Development
npm run dev              # Start dev servers (frontend + backend)
npm run lint            # Check code quality
npm run typecheck       # Type checking
npm run test            # Run all tests

# Docker
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # Stream logs
docker-compose ps        # Check service status

# Production
npm run build           # Build for production
npm run preview         # Preview production build
npm run start          # Start production server

# Utilities
npm run format          # Auto-format code
npm run analyze         # Bundle size analysis
```

## 🔧 Configuration

### Environment Variables
```env
# .env.development
NODE_ENV=development
PORT=4567
BYPASS_AUTH=true              # Skip auth for development
VITE_API_URL=http://localhost:4567
VITE_WS_URL=ws://localhost:4567

# AI Provider (optional)
AI_PROVIDER=claude            # or 'qwen'
CLAUDE_API_KEY=your-key-here
```

### Service URLs
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4567
- **WebSocket**: ws://localhost:4567
- **PostgreSQL**: localhost:5432 (user: maifarm, password: maifarm_dev)
- **Redis**: localhost:6379 (password: maifarm_redis_dev)
- **Grafana**: http://localhost:3001 (admin/maifarm_grafana)
- **Prometheus**: http://localhost:9090
- **MailHog**: http://localhost:8025

### Quick Configurations

**Skip Authentication:**
```env
BYPASS_AUTH=true
```

**Change Ports:**
```env
PORT=8080                     # Backend port
VITE_PORT=5173               # Frontend port
```

**Enable Qwen Provider:**
```env
AI_PROVIDER=qwen
QWEN_API_KEY=your-dashscope-key
```

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Quick fix
pkill -f "tsx.*server/index.ts"
pkill -f "vite"

# Or use different ports
PORT=8080 npm run dev
```

### Database Connection Failed
```bash
# Using Docker? Start PostgreSQL first
docker-compose up -d postgres redis

# Or use in-memory mode
BYPASS_DB=true npm run dev
```

### Build Errors
```bash
# Clean install
rm -rf node_modules dist
npm install
npm run build
```

### TypeScript Errors
```bash
# Run with error tolerance
npm run dev -- --no-strict
```

### Clean Start
```bash
# Remove all containers and volumes
docker-compose down -v

# Start fresh
docker-compose up -d
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:4567/api/health
```

### Metrics (Prometheus)
http://localhost:9090

### Dashboards (Grafana)
http://localhost:3001
- Username: admin
- Password: maifarm_grafana

## 🎨 UI Customization

### Quick Theme Change
1. Go to Settings → Theme
2. Choose from pre-built themes
3. Or create custom theme

### Disable Animations
```env
VITE_DISABLE_ANIMATIONS=true
```

## 🔗 Integration Examples

### WebSocket Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:4567');
socket.on('agent:status', (data) => {
  console.log('Agent update:', data);
});
```

### REST API
```bash
# Get all farms
curl http://localhost:4567/api/farms

# Create a farm
curl -X POST http://localhost:4567/api/farms \
  -H "Content-Type: application/json" \
  -d '{"name": "My Farm", "config": {}}'
```

## 📚 Next Steps

1. **Learn Core Concepts**
   - [Architecture Overview](./ARCHITECTURE.md)
   - [Multi-Agent Orchestration](./docs/ORCHESTRATION.md)

2. **Advanced Features**
   - [GoWild Mode](./docs/GO_WILD.md)
   - [Harvest System](./docs/HARVEST.md)
   - [AI Providers](./docs/AI_PROVIDERS.md)

3. **Deployment**
   - [Production Deployment](./DEPLOYMENT.md)
   - [Kubernetes Setup](./docs/K8S.md)
   - [High Availability](./docs/HA.md)

## 💡 Pro Tips

1. **Development Workflow**
   ```bash
   # Terminal 1: Backend with auto-reload
   npm run dev:server
   
   # Terminal 2: Frontend with HMR
   npm run dev:client
   ```

2. **Quick Database Reset**
   ```bash
   docker-compose down -v
   docker-compose up -d postgres
   ```

3. **Performance Mode**
   ```bash
   NODE_ENV=production npm run build
   NODE_ENV=production npm run preview
   ```

## 🆘 Getting Help

- 📖 [Documentation](https://docs.maifarm.io)
- 💬 [Discord Community](https://discord.gg/maifarm)
- 🐛 [Report Issues](https://github.com/maifarm/maifarm/issues)
- 📧 [Email Support](mailto:support@maifarm.io)

---

**Ready to orchestrate AI agents?** 🚀 Start with `npm run dev` and explore the dashboard!