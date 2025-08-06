# Trump Infog - Professional Infographic Generation System

![Trump Infog Banner](docs/assets/banner.png)

## Overview

Trump Infog is a collaborative, multi-agent infographic generation system designed to create newspaper-quality visualizations about Trump's 2024 election victory. Built on the MaiFarm orchestration platform, it leverages AI-powered agents working in concert to produce professional, data-driven infographics.

## Features

- 📊 **Professional Data Visualization**: Generate publication-ready infographics with interactive elements
- 🤖 **Multi-Agent Architecture**: 5 specialized AI agents collaborate to create comprehensive visualizations
- 🚀 **Real-time Collaboration**: WebSocket-based communication enables live updates and coordination
- 📈 **Scalable Infrastructure**: Built to handle high-volume data processing and concurrent requests
- 🎨 **Customizable Templates**: Pre-designed templates for various infographic styles
- 📱 **Responsive Design**: Optimized for print, web, and mobile viewing
- ♿ **Accessibility Compliant**: WCAG 2.1 AA compliant for inclusive access
- 🔒 **Enterprise Security**: Role-based access control and data encryption

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 14+
- Redis 6+
- Docker and Docker Compose (optional but recommended)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/trump-infog.git
cd trump-infog
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.development
# Edit .env.development with your configuration
```

4. Initialize the database:
```bash
npm run db:migrate
```

5. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to access the application.

### Docker Development

For a containerized development environment:

```bash
docker-compose up -d
```

This starts all required services including PostgreSQL, Redis, and the application.

## Architecture

Trump Infog employs a sophisticated multi-agent architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Trump Infog System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Backend   │  │  Frontend   │  │    Data     │       │
│  │ Architect   │  │   Artist    │  │  Steward    │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                 │                 │               │
│  ┌──────┴─────────────────┴─────────────────┴──────┐      │
│  │            Agent Coordination Layer              │      │
│  │         (WebSocket + Redis State Store)          │      │
│  └──────┬─────────────────┬─────────────────┬──────┘      │
│         │                 │                 │               │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐       │
│  │   Quality   │  │ Infographic │  │ Integration │       │
│  │  Guardian   │  │ Specialist  │  │ Coordinator │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **Backend API**: RESTful + GraphQL APIs for data management
- **Frontend UI**: React-based interactive infographic editor
- **Agent Coordinator**: Orchestrates multi-agent collaboration
- **Data Pipeline**: Real-time data processing and validation
- **Visualization Engine**: D3.js and Chart.js powered rendering

## API Documentation

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/infographics` | GET | List all infographics |
| `/api/infographics` | POST | Create new infographic |
| `/api/infographics/:id` | GET | Get specific infographic |
| `/api/infographics/:id` | PUT | Update infographic |
| `/api/infographics/:id/export` | POST | Export infographic |
| `/api/templates` | GET | List available templates |
| `/api/data-sources` | GET | List available data sources |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `infographic:update` | Server→Client | Real-time infographic updates |
| `agent:status` | Server→Client | Agent status changes |
| `data:refresh` | Client→Server | Request data refresh |
| `collaboration:sync` | Bidirectional | Multi-user collaboration |

For detailed API documentation, see [docs/API.md](docs/API.md).

## Development

### Project Structure

```
trump-infog/
├── server/             # Backend server code
│   ├── api/           # API endpoints
│   ├── services/      # Business logic
│   ├── database/      # Database models and migrations
│   └── websocket/     # WebSocket handlers
├── src/               # Frontend React application
│   ├── components/    # React components
│   ├── pages/         # Page components
│   ├── services/      # API clients
│   └── store/         # State management
├── shared/            # Shared types and interfaces
├── tests/             # Test suites
└── docs/              # Documentation
```

### Available Scripts

- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm run test` - Run test suite
- `npm run lint` - Run linting
- `npm run typecheck` - Type checking
- `npm run docker:up` - Start Docker environment
- `npm run analyze` - Bundle analysis

### Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

## Deployment

### Production Build

```bash
npm run build
npm run start:prod
```

### Docker Deployment

```bash
docker build -t trump-infog:latest .
docker run -p 3000:3000 trump-infog:latest
```

### Kubernetes

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Kubernetes deployment guides.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development workflow
- Pull request process
- Coding standards
- Testing requirements

## Performance

Trump Infog is optimized for high performance:

- **Response Time**: < 200ms for API calls
- **Rendering**: < 1s for complex infographics
- **Concurrent Users**: Supports 1000+ simultaneous users
- **Data Processing**: Handles datasets up to 1M records

## Security

- JWT-based authentication
- Role-based access control (RBAC)
- Data encryption at rest and in transit
- Regular security audits
- OWASP compliance

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@trumpinfog.com
- 💬 Discord: [Join our community](https://discord.gg/trumpinfog)
- 📚 Documentation: [docs.trumpinfog.com](https://docs.trumpinfog.com)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/trump-infog/issues)

## Acknowledgments

Built with ❤️ using:
- [MaiFarm](https://github.com/maifarm/maifarm) - AI orchestration platform
- [React](https://reactjs.org/) - UI framework
- [D3.js](https://d3js.org/) - Data visualization
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Caching and state management

---

**Trump Infog** - Transforming Data into Visual Stories 📊✨