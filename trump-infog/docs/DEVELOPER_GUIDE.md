# Trump Infog Developer Guide

## Getting Started

Welcome to the Trump Infog development team! This guide will help you set up your development environment and understand our development practices.

## Development Setup

### 1. Prerequisites

Ensure you have the following installed:

```bash
# Required versions
node --version    # >= 18.0.0
npm --version     # >= 9.0.0
git --version     # >= 2.30.0

# Optional but recommended
docker --version  # >= 20.10.0
```

### 2. Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/trump-infog.git
cd trump-infog

# Install dependencies
npm install

# Setup git hooks
npm run prepare

# Copy environment configuration
cp .env.example .env.development
```

### 3. Database Setup

```bash
# Using Docker (recommended)
docker-compose up -d postgres redis

# Or install locally
brew install postgresql redis
brew services start postgresql
brew services start redis

# Create database
createdb trump_infog_dev

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed
```

### 4. Start Development

```bash
# Start all services (frontend + backend)
npm run dev

# Start specific services
npm run dev:server   # Backend only
npm run dev:client   # Frontend only
npm run dev:agent    # Agent coordinator only
```

## Project Structure

```
trump-infog/
├── .github/            # GitHub Actions workflows
├── docs/               # Documentation
├── public/             # Static assets
├── scripts/            # Build and deployment scripts
├── server/             # Backend application
│   ├── api/           # API endpoints
│   ├── services/      # Business logic
│   ├── database/      # Database layer
│   ├── middleware/    # Express middleware
│   └── websocket/     # WebSocket handlers
├── src/                # Frontend application
│   ├── components/    # React components
│   ├── pages/         # Page components
│   ├── services/      # API clients
│   ├── store/         # State management
│   └── utils/         # Utilities
├── shared/             # Shared types/interfaces
└── tests/              # Test suites
```

## Development Workflow

### 1. Creating a New Feature

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes
# ... edit files ...

# Run tests
npm test

# Commit changes
git add .
git commit -m "feat: add your feature description"

# Push to GitHub
git push origin feature/your-feature-name
```

### 2. Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### 3. Type Safety

The project uses TypeScript throughout:

```bash
# Type check
npm run typecheck

# Type check in watch mode
npm run typecheck:watch
```

## API Development

### Creating a New Endpoint

1. **Define the route** in `server/api/`:

```typescript
// server/api/example.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ExampleService } from '../services/example';

const router = Router();
const service = new ExampleService();

router.get('/examples', authenticate, async (req, res) => {
  const examples = await service.list(req.query);
  res.json(examples);
});

router.post('/examples', authenticate, async (req, res) => {
  const example = await service.create(req.body);
  res.status(201).json(example);
});

export default router;
```

2. **Create the service** in `server/services/`:

```typescript
// server/services/example.ts
import { Database } from '../database';
import { Example, CreateExampleDTO } from '../../shared/types';

export class ExampleService {
  async list(filter: any): Promise<Example[]> {
    return Database.example.findMany({ where: filter });
  }

  async create(data: CreateExampleDTO): Promise<Example> {
    return Database.example.create({ data });
  }
}
```

3. **Add TypeScript types** in `shared/types/`:

```typescript
// shared/types/example.ts
export interface Example {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExampleDTO {
  name: string;
  description: string;
}
```

## Frontend Development

### Creating a Component

1. **Create component file**:

```tsx
// src/components/Example/Example.tsx
import React from 'react';
import { useExample } from '../../hooks/useExample';
import styles from './Example.module.css';

interface ExampleProps {
  id: string;
  onUpdate?: (data: any) => void;
}

export const Example: React.FC<ExampleProps> = ({ id, onUpdate }) => {
  const { data, loading, error } = useExample(id);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className={styles.container}>
      <h2>{data.name}</h2>
      <p>{data.description}</p>
    </div>
  );
};
```

2. **Create custom hook**:

```typescript
// src/hooks/useExample.ts
import { useState, useEffect } from 'react';
import { exampleService } from '../services/example';

export const useExample = (id: string) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    exampleService.getById(id)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
};
```

## Testing

### Unit Tests

```typescript
// src/components/Example/Example.test.tsx
import { render, screen } from '@testing-library/react';
import { Example } from './Example';

describe('Example Component', () => {
  it('renders name and description', () => {
    render(<Example id="123" />);
    
    expect(screen.getByText('Example Name')).toBeInTheDocument();
    expect(screen.getByText('Example Description')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
// tests/integration/example.test.ts
import request from 'supertest';
import app from '../../server/app';

describe('Example API', () => {
  it('creates new example', async () => {
    const response = await request(app)
      .post('/api/examples')
      .send({ name: 'Test', description: 'Test Description' })
      .expect(201);
    
    expect(response.body.name).toBe('Test');
  });
});
```

### E2E Tests

```typescript
// tests/e2e/example.spec.ts
describe('Example Feature', () => {
  it('creates and displays example', () => {
    cy.visit('/examples/new');
    cy.get('[data-testid="name-input"]').type('Test Example');
    cy.get('[data-testid="submit-button"]').click();
    
    cy.url().should('include', '/examples/');
    cy.contains('Test Example').should('be.visible');
  });
});
```

## Multi-Agent Development

### Agent Communication

Agents communicate through file-based coordination and WebSocket events:

```typescript
// Agent claiming work
const claimWork = async (agentId: string, step: string) => {
  const claim = {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    claimed_steps: [step],
    status: 'claimed'
  };
  
  await fs.writeFile(
    `/tmp/claude_coordination/work_claims/${agentId}_${step}.json`,
    JSON.stringify(claim, null, 2)
  );
};

// Agent completing work
const completeWork = async (agentId: string, step: string, results: any) => {
  const completion = {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    completed_steps: [step],
    results
  };
  
  await fs.writeFile(
    `/tmp/claude_coordination/completed_work/${agentId}_${step}.json`,
    JSON.stringify(completion, null, 2)
  );
};
```

### WebSocket Events

```typescript
// Emitting agent status
socket.emit('agent:status', {
  agent: 'backend-architect',
  status: 'working',
  task: 'Implementing authentication',
  progress: 75
});

// Listening for coordination events
socket.on('coordination:update', (data) => {
  console.log('Coordination update:', data);
});
```

## Performance Optimization

### 1. Frontend Optimization

```typescript
// Lazy loading components
const InfographicEditor = lazy(() => import('./components/InfographicEditor'));

// Memoization
const ExpensiveComponent = memo(({ data }) => {
  return <div>{/* Complex rendering */}</div>;
});

// Virtual scrolling for large lists
import { FixedSizeList } from 'react-window';

const VirtualList = ({ items }) => (
  <FixedSizeList
    height={600}
    itemCount={items.length}
    itemSize={50}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        {items[index].name}
      </div>
    )}
  </FixedSizeList>
);
```

### 2. Backend Optimization

```typescript
// Query optimization
const optimizedQuery = async () => {
  return db.infographic.findMany({
    select: {
      id: true,
      title: true,
      thumbnail: true
    },
    where: { status: 'published' },
    take: 20
  });
};

// Caching
import { redis } from '../services/redis';

const getCachedData = async (key: string) => {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetchData();
  await redis.setex(key, 3600, JSON.stringify(data));
  return data;
};
```

## Debugging

### 1. Backend Debugging

```bash
# Debug mode
DEBUG=trump-infog:* npm run dev:server

# Using VS Code debugger
# Add to .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Server",
  "program": "${workspaceFolder}/server/index.ts",
  "runtimeArgs": ["-r", "ts-node/register"],
  "env": {
    "NODE_ENV": "development"
  }
}
```

### 2. Frontend Debugging

```typescript
// React DevTools
// Install browser extension

// Debug component renders
import { useWhyDidYouUpdate } from 'ahooks';

const MyComponent = (props) => {
  useWhyDidYouUpdate('MyComponent', props);
  // Component logic
};
```

### 3. WebSocket Debugging

```typescript
// Enable Socket.io debugging
localStorage.debug = 'socket.io-client:*';

// Monitor WebSocket traffic
socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', () => console.log('Disconnected'));
socket.onAny((event, ...args) => {
  console.log(`Event: ${event}`, args);
});
```

## Best Practices

### 1. Code Organization

- Keep components small and focused
- Use custom hooks for reusable logic
- Separate business logic from UI components
- Use TypeScript interfaces for all data structures

### 2. State Management

```typescript
// Use Zustand for global state
import create from 'zustand';

const useInfographicStore = create((set) => ({
  infographics: [],
  loading: false,
  fetchInfographics: async () => {
    set({ loading: true });
    const data = await api.getInfographics();
    set({ infographics: data, loading: false });
  }
}));
```

### 3. Error Handling

```typescript
// Consistent error handling
class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
  }
}

// Global error handler
app.use((err: AppError, req, res, next) => {
  logger.error(err);
  res.status(err.statusCode).json({
    error: {
      code: err.code,
      message: err.message
    }
  });
});
```

### 4. Security

- Always validate input data
- Use parameterized queries
- Implement rate limiting
- Sanitize user-generated content
- Use HTTPS in production
- Keep dependencies updated

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port
   lsof -i :4567
   # Kill process
   kill -9 <PID>
   ```

2. **Database connection errors**
   ```bash
   # Check PostgreSQL status
   brew services list
   # Restart PostgreSQL
   brew services restart postgresql
   ```

3. **Module not found errors**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

## Resources

- [Project Wiki](https://github.com/yourusername/trump-infog/wiki)
- [API Documentation](./API.md)
- [Architecture Guide](./ARCHITECTURE.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Discord Community](https://discord.gg/trumpinfog)

---

Happy coding! If you have questions, reach out to the team on Discord or create an issue on GitHub.