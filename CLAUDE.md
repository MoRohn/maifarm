# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Running the Application
```bash
# Quick start (recommended) - runs startup script that handles process management
npm run start

# Manual development mode with hot reload (starts both client and server)
npm run dev

# Alternative development startup with environment variables
NODE_ENV=development BYPASS_AUTH=true PORT=4567 npm run dev

# Server only (development) - uses tsx watch mode
npm run dev:server

# Client only (development) - Vite dev server on port 3000
npm run dev:client

# Docker development
docker-compose up -d                              # Full stack with PostgreSQL, Redis, monitoring
docker-compose -f docker-compose.simple.yml up -d # Simple setup (no external deps)
docker-compose -f docker-compose.dev.yml up -d    # Development environment

# Production build and preview
npm run build        # Build for production
npm run preview      # Preview production build
npm run start:prod   # Build and preview
```

### Testing
```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:server        # Server-side tests with jest.config.server.cjs
npm run test:barn          # Test Barn module specifically
npm run test:barn:integration # Barn integration tests (requires RUN_INTEGRATION_TESTS=true)
npm run test:e2e          # End-to-end tests with Cypress
npm run test:e2e:open     # Cypress interactive mode
npm run test:coverage     # Test coverage report
npm run test:watch        # Watch mode for TDD

# Run a single test file
npm test -- path/to/test.spec.ts

# Test AI provider integrations
npm run test:providers
npm run test:qwen        # Test Qwen provider specifically
npm run test:qwen:quick  # Quick Qwen integration test
npm run test:qwen:full   # Full Qwen integration test
npm run test:qwen:debug  # Debug Qwen integration
AI_PROVIDER=qwen npm test -- --grep "provider"
```

### Code Quality
```bash
# Lint checks (ESLint)
npm run lint

# Type checking (TypeScript compiler)
npm run typecheck

# Format code (Prettier)
npm run format
npm run format:check

# Full build with type checking
npm run build:check

# Analyze bundle size
npm run analyze
```

### Performance & Analysis
```bash
npm run analyze           # Bundle size analysis
npm run perf:test        # Performance tests
npm run perf:lighthouse  # Lighthouse audit
npm run perf:k6         # Load testing with k6
```

### Docker Commands
```bash
# Build Docker images
npm run docker:build       # Development image
npm run docker:build:prod  # Production image

# Manage containers
npm run docker:up         # Start all services
npm run docker:down       # Stop all services
npm run docker:logs       # View logs

# Production Docker
npm run docker:prod:up    # Start production services
npm run docker:prod:down  # Stop production services
npm run docker:prod:logs  # View production logs

# Alternative Docker configurations
docker-compose -f docker-compose.production.yml up -d # Full production setup
docker-compose -f docker-compose.optimized.yml up -d  # Optimized production setup
```

## Architecture Overview

MaiFarm is a full-stack TypeScript application for orchestrating multiple Claude Code AI agents to work collaboratively on complex software development tasks.

### Frontend Architecture
- **Framework**: React 18 + TypeScript + Vite
- **State Management**: Zustand stores with modular architecture
  - Each feature has dedicated store: `farmStore`, `agentStore`, `websocketStore`, `analyticsStore`, `themeStore`, `authStore`
- **Real-time Updates**: Socket.io client for WebSocket connections
- **3D Visualizations**: Three.js/React Three Fiber for resource and communication graphs
- **Routing**: React Router v6 with feature-based routes
- **UI Framework**: Tailwind CSS with custom theme engine
- **PWA**: Progressive Web App capabilities (configurable via `vite-pwa-config.ts`)

### Backend Architecture
- **Server**: Express + TypeScript (ESM modules)
- **API Structure**: Feature-based routers in `server/api/`
- **WebSocket**: Socket.io server (`server/websocket/socketServer.ts`) for real-time bidirectional communication
- **Database**: PostgreSQL (primary) + Redis (caching/sessions)
- **Monitoring**: Prometheus metrics collection + Grafana dashboards
- **Orchestration**: Custom orchestrator service for managing AI agents
- **Middleware Stack**: helmet, cors, compression, morgan, rate limiting, sanitizer

### Critical Integration Points

1. **Claude Code Agent Coordination**
   - Server watches `/tmp/claude_coordination/active_agents.json` via `coordinationService`
   - File updates trigger WebSocket broadcasts to connected clients
   - Agents communicate through this shared coordination file
   - Handled by `server/services/coordinationService.ts` and `server/services/claudeCodeCoordinator.ts`

2. **WebSocket Event System** (defined in `server/types/api.ts`)
   ```typescript
   // Key events:
   'agent:updated', 'agent:status'     // Agent state changes
   'farm:status', 'farm:created'        // Farm operations
   'metrics:update'                     // Real-time metrics
   'task:progress', 'task:completed'    // Task updates
   'harvest:ready', 'harvest:collected' // Harvest operations
   'analytics:*'                        // Analytics events
   ```

3. **Authentication Flow**
   - JWT-based authentication with refresh tokens
   - Role-based access control (RBAC) system
   - Development bypass: `BYPASS_AUTH=true` environment variable
   - OAuth support for Google and GitHub (configurable)
   - Handled by `server/api/auth.ts` and `server/middleware/auth.ts`

4. **Multi-Agent Orchestration**
   - Python script `multi_claude.py` launches multiple Claude Code sessions
   - `server/services/multiClaudeService.ts` integrates with the dashboard
   - Supports YAML-based task definitions
   - Provider switching between Claude and Qwen3-Coder

### Component Hierarchy and Layout Structure

MaiFarm uses a nested layout system:

1. **App.tsx** → Main app entry point with router
2. **DashboardLayout** → Wraps all authenticated pages, includes:
   - Sidebar navigation (z-20)
   - Main header (z-10)
   - Content area
3. **Page Components** → Individual pages (Dashboard, Analytics, Barn, etc.)
   - Should NOT include their own ThemedHeader
   - Wrapped by DashboardLayout automatically

**Important**: Never add ThemedHeader to individual page components - it causes duplicate headers and z-index conflicts.

### Development Workflow

1. **Path Aliases** (configured in `tsconfig.json` and `vite.config.ts`):
   ```typescript
   '@/'           // src/
   '@components/' // src/components/
   '@services/'   // src/services/
   '@hooks/'      // src/hooks/
   '@types/'      // src/types/
   '@utils/'      // src/utils/
   '@store/'      // src/store/
   ```

2. **Environment Configuration**:
   - Copy `.env.example` to `.env.development` for local development
   - Key variables:
     - `PORT=4567` - Backend server port
     - `BYPASS_AUTH=true` - Skip authentication for development
     - `NODE_ENV=development` - Development mode
     - `DB_*` - PostgreSQL credentials
     - `REDIS_*` - Redis configuration
     - `AI_PROVIDER` - Set to 'claude' or 'qwen'

3. **Database Setup**:
   - Migrations run automatically on server startup
   - Connection handled by `server/database/connection.ts`
   - PostgreSQL with connection pooling
   - Redis for session storage and caching

4. **Testing Strategy**:
   - **Jest**: Unit and integration tests (config in `jest.config.cjs`)
   - **Cypress**: E2E tests (config in `cypress.config.ts`)
   - **Coverage Thresholds**: 80% for all metrics
   - Test files: `*.spec.ts`, `*.test.ts`, or in `__tests__/` directories

### Port Configuration
- **Frontend Dev Server**: `http://localhost:5173` (Vite - default port)
- **Backend API/WebSocket**: `http://localhost:4567` (Express + Socket.io)
- **WebSocket Alternative Port**: `http://localhost:8080` (Docker environment)
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001`
- **PostgreSQL**: `localhost:5432` (maifarm database)
- **Redis**: `localhost:6379`
- **Cypress E2E**: `http://localhost:4173` (preview server)

### Key Feature Modules
- **GoWild**: Autonomous exploration and task generation (`src/components/GoWild/`, `server/services/goWildManager.ts`)
- **Harvest**: Collection and analysis of agent outputs (`src/components/Harvest/`, `server/services/harvestService.ts`)
- **Barn**: Storage and management of completed tasks (`src/components/Barn/`, `server/services/barnService.ts`)
- **Seeds**: Task templates and configurations (`src/components/Seeds/`, `server/services/seedService.ts`)
- **Monitoring**: Real-time metrics and performance tracking (`src/components/Monitoring/`, `server/services/metricsCollector.ts`)
- **Workflow**: Visual workflow builder and automation (`src/components/Workflow/`, `server/services/workflowService.ts`)
- **YAML Generator**: Visual YAML editor for agent prompts (`src/components/YamlGenerator/`, `server/services/yamlGenerator.ts`)
- **Analytics**: Comprehensive analytics and reporting (`src/components/Analytics/`, `src/services/analyticsService.ts`)
- **Multi-Claude**: Multi-agent coordination (`src/components/MultiClaude/`, `server/services/multiClaudeService.ts`)

### Multi-Agent Orchestration

#### Python Script (`multi_claude.py`)
The `multi_claude.py` script enables running multiple Claude Code sessions in parallel:

```bash
# Basic usage
python multi_claude.py -n 5 -p "Fix all TypeScript errors"

# With YAML configuration
python multi_claude.py -n 3 --prompt-file feature.yaml

# With specific steps
python multi_claude.py -n 4 -p "Refactor API" --steps "Analyze" "Implement" "Test"

# Using Qwen provider
python multi_claude.py -n 3 -p "Build feature" --provider qwen
```

#### Test Scripts
- `test-multi-claude-direct.sh` - Direct multi-agent testing
- `test_multi_claude_integration.sh` - Integration testing for multi-agent setup
- `monitor-farm-creation.sh` - Monitor farm creation and agent coordination

### AI Provider Support

MaiFarm supports both Claude Code and Qwen3-Coder as AI providers:

#### Configuration
```bash
# Set active AI provider
export AI_PROVIDER=qwen  # or claude (default)

# Configure in .env file
QWEN_ENABLED=true
QWEN_API_KEY=your-dashscope-api-key
QWEN_API_ENDPOINT=https://dashscope.aliyuncs.com/api/v1
QWEN_MODEL=qwen-coder-480b
```

#### Provider Integration
- Claude Code: Default provider, uses Anthropic API
- Qwen3-Coder: 480B parameter model with 256K context window
- Provider switching handled by `server/services/qwenCodeManager.ts`
- API endpoint: `/api/providers/status` for checking provider availability

### Deployment
```bash
# Using startup script (recommended for development)
npm run start      # Runs ./scripts/startup.sh - handles process management
npm run start:prod # Build and preview
npm run start:dev  # Alternative startup script

# Deploy to environments
npm run deploy:staging      # Deploy to staging (requires ./scripts/deploy.sh)
npm run deploy:production   # Deploy to production
npm run rollback           # Rollback deployment

# Production Docker
docker-compose -f docker-compose.production.yml up -d
docker-compose -f docker-compose.optimized.yml up -d  # Optimized production setup
```

### Performance Optimizations
- WebSocket connection pooling with automatic reconnection
- React component memoization for expensive renders
- 3D visualizations use LOD (Level of Detail) optimization
- Database connection pooling (configured in `server/database/connection.ts`)
- Redis caching with TTL for frequently accessed data
- Vite build optimizations with code splitting
- Service Worker for PWA capabilities (configurable in `vite-pwa-config.ts`)
- Prometheus metrics collection for performance monitoring

### Important Files and Directories

#### Configuration Files
- `.env.example` - Environment variable template (copy to `.env.development`)
- `tsconfig.json` - TypeScript configuration with path aliases
- `vite.config.ts` - Vite bundler configuration
- `jest.config.cjs` - Jest test configuration
- `cypress.config.ts` - Cypress E2E test configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `docker-compose.yml` - Main Docker configuration
- `docker-compose.production.yml` - Production Docker setup

#### Key Directories
- `/tmp/claude_coordination/` - Coordination directory for multi-agent communication
- `/tmp/claude_coordination/active_agents.json` - Active agents tracking file
- `server/database/migrations/` - Database migration files
- `server/templates/` - Template files for various features
- `monitoring/` - Monitoring configuration (Prometheus, Grafana)
- `scripts/` - Utility scripts for deployment and testing

### Troubleshooting

#### Common Issues
1. **Port already in use**: The startup script (`npm run start`) handles killing existing processes
2. **WebSocket connection issues**: Check that port 4567 is accessible and CORS is configured
3. **Database connection errors**: Ensure PostgreSQL is running and credentials in `.env` are correct
4. **TypeScript errors**: Run `npm run typecheck` to identify issues
5. **Module resolution errors**: Check path aliases in `tsconfig.json` and `vite.config.ts` match
6. **Header/Navigation overlapping**: Fixed z-index hierarchy - Header component at z-[100], dashboard layout at z-10
7. **Development server issues**: Try `npm run dev:reset` to clear Vite cache and restart