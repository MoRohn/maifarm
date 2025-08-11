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

# Client only (development) - Vite dev server on port 5173 (default Vite port)
npm run dev:client

# Reset development environment (clears Vite cache)
npm run dev:reset

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

# Advanced testing
npm run test:playwright      # Playwright E2E tests
npm run test:playwright:ui   # Playwright UI mode
npm run test:accessibility  # Accessibility tests
npm run test:visual         # Visual regression tests
npm run test:performance    # Lighthouse performance testing
npm run test:security       # Security audit and ESLint security rules
npm run test:memory         # Memory leak tests
npm run test:api:load       # API load testing with k6
npm run test:critical-path  # Critical path E2E tests
npm run test:bundle         # Bundle size analysis
npm run test:storybook     # Storybook component tests

# Storybook development
npm run storybook         # Start Storybook dev server
npm run build-storybook   # Build Storybook static site
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
npm run perf:test        # Performance tests (script-based)
npm run perf:lighthouse  # Lighthouse audit
npm run perf:k6         # Load testing with k6

# AI Provider Testing & Management
npm run qwen:test        # Test Qwen LLM proxy
npm run qwen:farm        # Run Qwen multi-agent farm
npm run proxy:start      # Start LLM proxy server
npm run proxy:stop       # Stop LLM proxy server
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
   - Server uses isolated coordination paths within `maibarn/coordination/` directory
   - File updates trigger WebSocket broadcasts to connected clients
   - Agents communicate through shared coordination files in isolated environment
   - Handled by `server/services/coordinationService.ts` and `server/services/claudeCodeCoordinator.ts`
   - **IMPORTANT**: All coordination files are isolated to `maibarn/` directory for security
   - Legacy `/tmp/claude_coordination/` paths have been migrated to secure isolated storage

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
   - Python script `orchestrator.py` launches multiple Claude Code sessions
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
   - Migration files in `server/database/migrations/` (numbered: 001_, 002_, etc.)
   - Schema includes: users, farms, agents, harvests, seeds, token_usage, qwen_metrics

4. **Module System**:
   - **ESM (ES Modules)**: Project uses `"type": "module"` in package.json
   - All imports use ES module syntax (`import`/`export`)
   - Server uses `.ts` files with ESM-compatible configuration
   - Use `tsx` for TypeScript execution with ESM support

5. **Testing Strategy**:
   - **Jest**: Unit and integration tests (config in `jest.config.cjs`)
   - **Cypress**: E2E tests (config in `cypress.config.ts`)
   - **Coverage Thresholds**: 80% for branches, functions, lines, statements
   - Test files: `*.spec.ts`, `*.test.ts`, or in `__tests__/` directories
   - **Test Configurations**:
     - `jest.config.cjs` - Main Jest config for client tests
     - `jest.config.server.cjs` - Server-specific Jest config
     - Multiple test environments: node, jsdom
   - **Mock Strategy**: 
     - API client mocks in `tests/__mocks__/apiClient.ts`
     - WebSocket mocks in `tests/__mocks__/websocket.ts`

### Port Configuration
- **Frontend Dev Server**: `http://localhost:3000` (Vite configured port, proxies to backend)
- **Vite Default Port**: `http://localhost:5173` (if using `vite` directly)
- **Backend API/WebSocket**: `http://localhost:4567` (Express + Socket.io)
- **WebSocket Alternative Port**: `http://localhost:8080` (Docker environment)
- **LLM Proxy Server**: `http://localhost:8001` (for Qwen integration)
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001`
- **PostgreSQL**: `localhost:5432` (maifarm database)
- **Redis**: `localhost:6379`
- **Cypress E2E**: `http://localhost:4173` (preview server)
- **Storybook**: `http://localhost:6006`

### Key Feature Modules
- **GoWild**: Autonomous exploration and task generation (`src/components/GoWild/`, `server/services/goWildManager.ts`)
- **Harvest**: Collection and analysis of agent outputs (`src/components/Harvest/`, `server/services/harvestService.ts`)
- **Barn**: Storage and management of completed tasks (`src/components/Barn/`, `server/services/barnService.ts`)
- **Seeds**: Task templates and configurations (`src/components/Seeds/`, `server/services/seedService.ts`)
- **Analytics**: Comprehensive analytics and reporting (`src/components/Analytics/`, `server/services/analyticsService.ts`)
- **Multi-Claude**: Multi-agent coordination (`server/services/multiClaudeService.ts`)
- **YAML Generator**: Visual YAML editor for agent prompts (`server/services/yamlGenerator.ts`)
- **Farmers**: Predefined agent templates (`server/templates/farmers/`, `server/services/farmersService.ts`)
- **Quick Tasks**: Rapid task execution system (`server/services/quickTaskService.ts`, `server/services/quickTaskExecutor.ts`)
- **Workspace Management**: File and workspace coordination (`server/services/workspaceManager.ts`, `server/services/fileManagerService.ts`)

### Multi-Agent Orchestration

#### Python Script (`orchestrator.py`)
The `orchestrator.py` script enables running multiple Claude Code sessions in parallel:

```bash
# Basic usage
python orchestrator.py -n 5 -p "Fix all TypeScript errors"

# With YAML configuration
python orchestrator.py -n 3 --prompt-file feature.yaml

# With specific steps
python orchestrator.py -n 4 -p "Refactor API" --steps "Analyze" "Implement" "Test"

# Using Qwen provider
python orchestrator.py -n 3 -p "Build feature" --provider qwen
```

#### Multi-Agent Python Scripts
- `orchestrator.py` - Primary multi-agent orchestrator
- `multi_qwen.py` - Qwen-specific multi-agent implementation
- `llm_proxy.py` - LLM proxy server for advanced integrations

#### Test Scripts
- `test-multi-claude-direct.sh` - Direct multi-agent testing
- `monitor-farm-creation.sh` - Monitor farm creation and agent coordination
- Various test scripts in root directory for different scenarios

### AI Provider Support

MaiFarm supports multiple AI providers with seamless switching:

#### Supported Providers
- **Claude Code**: Default provider, uses Anthropic API
- **Qwen3-Coder**: 480B parameter model with 256K context window (via DashScope API)
- **Ollama**: Local model support for offline development

#### Configuration
```bash
# Set active AI provider
export AI_PROVIDER=qwen  # Options: claude (default), qwen, ollama

# Claude configuration (.env)
CLAUDE_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-3-opus-20240229

# Qwen3-Coder configuration (.env)
QWEN_ENABLED=true
QWEN_API_KEY=your-dashscope-api-key
QWEN_API_ENDPOINT=https://dashscope.aliyuncs.com/api/v1
QWEN_MODEL=qwen-coder-480b
QWEN_MAX_TOKENS=4096
QWEN_TEMPERATURE=0.7

# Ollama configuration (.env)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# LLM Proxy support (for advanced Qwen integration)
USE_LLM_PROXY=true
LLM_PROXY_URL=http://localhost:8001

# Start LLM Proxy server
npm run proxy:start    # Starts llm_proxy.py server
npm run proxy:stop     # Stops proxy server
```

#### Provider Integration
- Provider switching handled by `server/services/qwenCodeManager.ts` and `server/services/qwenService.ts`
- API endpoint: `/api/providers/status` for checking provider availability
- Ollama integration via `server/services/ollamaService.ts` and `server/services/ollamaModelDetector.ts`
- Python proxy scripts for advanced integrations:
  - `llm_proxy.py` - Enhanced LLM proxy server
  - `llm_proxy_qwen_enhanced.py` - Qwen-specific optimized proxy
- Token usage and cost tracking in database
- Multiple client implementations for different providers

### Deployment
```bash
# Using startup script (recommended for development)
npm run start      # Runs ./scripts/startup.sh - handles process management
npm run start:prod # Build and preview
npm run start:dev  # Alternative startup script (same as npm run start)

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

### Security Isolation System

**CRITICAL**: MaiFarm implements a comprehensive security isolation system to prevent harvest outputs from contaminating the main codebase.

#### Barn Isolation Architecture
- **Quarantine Zone**: All farm outputs are isolated to the `maibarn/` directory
- **Path Configuration**: Centralized in `server/config/paths.ts` with built-in validation
- **Path Safety**: All file operations validate paths using `pathConfig.isPathSafe()` and `pathConfig.validatePath()`
- **Legacy Migration**: Old `/tmp/claude_coordination/` and root-level `barn/` directories have been migrated

#### Key Security Components
- `server/config/paths.ts` - Centralized path configuration with security validation
- `server/services/fileManagerService.ts` - Unified file operations with isolation enforcement
- `server/services/harvestFileCollector.ts` - Harvest collection within isolated storage
- `server/services/barnService.ts` - Secure storage of completed harvests

#### Directory Structure
```
maifarm/                          # Main codebase (protected)
└── maibarn/                      # Isolated workspace (quarantine zone)
    ├── coordination/             # Agent coordination files
    ├── harvests/active/          # Active harvest storage
    ├── harvests/completed/       # Completed harvest storage
    ├── workspaces/active/        # Farm workspace isolation
    ├── workspaces/archived/      # Archived farm workspaces
    └── barn/items/               # Quarantined artifacts and outputs
```

**IMPORTANT**: Never bypass the path validation system or write directly to the main codebase. Always use the centralized `pathConfig` and `fileManager` services.

### WebSocket Reliability System
The application includes a sophisticated WebSocket reliability layer:
- **Automatic Reconnection**: Exponential backoff with jitter
- **Message Queue**: Buffers messages during disconnections
- **Health Monitoring**: Regular heartbeat checks
- **Performance Optimizer**: Batches messages and manages throughput
- **Fallback Polling**: HTTP polling when WebSocket fails
- **Connection Manager**: Singleton pattern for connection reuse
- Key files:
  - `server/websocket/reliabilityManager.ts` - Main reliability orchestrator
  - `server/websocket/performanceOptimizer.ts` - Message batching
  - `server/websocket/healthMonitor.ts` - Connection health checks
  - `services/websocket/singletonManager.ts` - Client-side singleton

### Important Files and Directories

#### Configuration Files
- `.env.example` - Environment variable template (copy to `.env.development`)
- `tsconfig.json` - TypeScript configuration with path aliases
- `tsconfig.node.json` - Node.js specific TypeScript config
- `tsconfig.server.json` - Server-side TypeScript config
- `vite.config.ts` - Vite bundler configuration
- `vite-pwa-config.ts` - PWA configuration (currently disabled)
- `jest.config.cjs` - Jest test configuration
- `jest.config.server.cjs` - Server-specific Jest config
- `cypress.config.ts` - Cypress E2E test configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `docker-compose.yml` - Main Docker configuration
- `docker-compose.production.yml` - Production Docker setup
- `docker-compose.optimized.yml` - Optimized production setup
- `.eslintrc.security.js` - Security-focused ESLint rules

#### Key Directories
- `maibarn/` - **CRITICAL**: Isolated storage for all harvest outputs, farm workspaces, and coordination
  - `maibarn/coordination/` - Secure coordination directory for multi-agent communication
  - `maibarn/harvests/active/` - Active harvest result collection
  - `maibarn/harvests/completed/` - Completed harvest storage
  - `maibarn/workspaces/` - Isolated farm workspaces
  - `maibarn/barn/items/` - Quarantined harvest outputs and artifacts
- `server/database/migrations/` - Database migration files (numbered: 001_, 002_, etc.)
- `server/templates/farmers/` - Predefined agent templates (buzz-bee, sage-fox, etc.)
- `server/config/` - Centralized configuration management including `paths.ts` for security isolation
- `server/websocket/` - WebSocket event handling and reliability system
- `monitoring/` - Monitoring configuration (Prometheus, Grafana)
- `scripts/` - Utility scripts for deployment and testing
- `scripts/startup.sh` - Main startup script with process management
- `tests/__mocks__/` - Mock implementations for testing
- `coverage/` - Test coverage reports

### Graceful Shutdown System

**CRITICAL**: MaiFarm implements a standardized graceful shutdown system across all Quick Action modes (Quick Task, Farm, GoWild) to ensure agent outputs are properly collected and stored in the Barn.

#### Timeout Configuration
- **Quick Task**: **Fixed 5-minute timeout (300,000ms) - hardcoded and NOT configurable**
  - Graceful shutdown triggers at 4 minutes 30 seconds (30s before timeout)
  - Uses `mode: 'quick-task'` with no timeout parameter passed to `shutdownCoordinator.scheduleShutdown()`
  
- **Farm Mode**: **User-configurable timeout based on farm creation settings**
  - Default: 1 hour (3600 seconds) - configurable via settings
  - Graceful shutdown triggers 30 seconds before the user-specified timeout
  - Uses `mode: 'farm'` with `timeout: farm.config.timeout` (in seconds)
  
- **GoWild Mode**: **User-configurable timeout based on maxDuration**
  - Default: 30 minutes (1800 seconds) - configurable via settings
  - Graceful shutdown triggers 30 seconds before the user-specified duration
  - Uses `mode: 'gowild'` with `timeout: timeoutSeconds` (converted from minutes)

#### Key Components
- `server/services/shutdownCoordinator.ts` - Centralized shutdown orchestration
- `server/constants/timing.ts` - Timing constants (QUICK_TASK_TIMEOUT = 300000ms, GRACEFUL_SHUTDOWN_PERIOD = 30s)
- `server/services/harvestFileCollector.ts` - File collection with retry logic and validation
- `server/services/quickTaskService.ts` - Quick Task mode implementation
- `server/services/farmManager.ts` - Farm mode timeout scheduling
- `server/services/goWildManager.ts` - GoWild mode timeout scheduling

#### Critical Implementation Details
The `shutdownCoordinator.scheduleShutdown()` function properly handles all three modes:
- **Quick Task**: Uses hardcoded `QUICK_TASK_TIMEOUT = 300000` (5 minutes in ms)
- **Farm & GoWild**: Takes the `timeout` parameter (in seconds) and converts to ms: `timeout * 1000`
- **All modes**: Schedule graceful shutdown 30 seconds before the total timeout

#### Testing Shutdown Behavior
```bash
# Run integration tests for shutdown logic
npm test -- tests/integration/graceful-shutdown.test.ts

# Run E2E tests for full shutdown flow
npm run test:playwright -- tests/e2e/quick-action-shutdown.spec.ts
```

### Troubleshooting

#### Common Issues
1. **Port already in use**: The startup script (`npm run start`) handles killing existing processes
2. **WebSocket connection issues**: Check that port 4567 is accessible and CORS is configured  
3. **Database connection errors**: Ensure PostgreSQL is running and credentials in `.env` are correct
4. **TypeScript errors**: Run `npm run typecheck` to identify issues
5. **Module resolution errors**: Check path aliases in `tsconfig.json` and `vite.config.ts` match
6. **Header/Navigation overlapping**: Fixed z-index hierarchy - Header component at z-[100], dashboard layout at z-10
7. **Development server issues**: Try `npm run dev:reset` to clear Vite cache and restart
8. **Vite dev server port**: Configured for port 3000 (not default 5173) - check vite.config.ts
9. **Missing process management**: Use `npm run start` for proper process lifecycle management
10. **AI Provider connectivity**: Check provider configuration in `.env` and use provider status endpoint
11. **LLM Proxy issues**: Ensure Python dependencies installed and proxy server running on port 8001
12. **Database migrations**: Migrations run automatically on startup, check server logs for issues
13. **File isolation errors**: If you see "Path would escape barn directory" errors, ensure you're using `pathConfig` services
14. **Legacy path references**: All `/tmp/claude_coordination/` paths have been migrated to `maibarn/coordination/`
15. **Graceful shutdown issues**: Check `shutdownCoordinator` logs, verify harvest ID exists, ensure 30s grace period is respected
16. **Timeout parameter bugs**: Farm/GoWild managers must pass timeout in seconds, not milliseconds, to shutdownCoordinator (fixed in v2.0)

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.