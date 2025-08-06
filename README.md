# MaiFarm - Multi-Agent Claude Code Orchestrator Dashboard

<div align="center">
  <img src="src/assets/logos/maifarm-logo.svg" alt="MaiFarm Logo" width="200" />
  
  [![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/yourusername/maifarm)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
</div>

## Overview

MaiFarm is a sophisticated web-based dashboard for orchestrating and managing multiple Claude Code AI agents. It provides a comprehensive interface for creating, monitoring, and controlling AI agent farms that work collaboratively on complex software development tasks.

## Features

### 🤖 Multi-Agent Management
- Create and manage multiple AI agent farms
- Real-time monitoring of agent activities
- Collaborative task distribution
- Agent communication visualization

### 🚀 Advanced Capabilities
- **Go Wild Mode**: Autonomous exploration and task generation
- **Historical Analytics**: Track farm performance over time
- **Real-time Monitoring**: Live agent status and resource utilization
- **3D Visualizations**: Interactive resource and communication graphs

### 🛡️ Security & Authentication
- Built-in authentication system
- Role-based access control
- Audit logging
- Encrypted data storage

### 🎨 Customization
- Dynamic theme engine with custom theme creation
- Multi-language support
- Customizable dashboards
- Farm templates

### 📱 Progressive Web App
- Offline functionality
- Installable on desktop and mobile
- Push notifications
- Background sync

## Prerequisites

- Node.js 18.0 or higher
- npm or yarn package manager
- Modern web browser with JavaScript enabled

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/maifarm.git
cd maifarm
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_APP_NAME=MaiFarm
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Project Structure

```
maifarm/
├── public/              # Static assets
│   ├── manifest.json    # PWA manifest
│   └── service-worker.js # Service worker
├── server/              # Backend server (if included)
├── src/
│   ├── api/            # API client modules
│   ├── assets/         # Images, logos, and icons
│   ├── components/     # React components
│   │   ├── Agent/      # Agent-related components
│   │   ├── Auth/       # Authentication components
│   │   ├── Dashboard/  # Dashboard components
│   │   ├── GoWild/     # Go Wild mode components
│   │   ├── Monitoring/ # Monitoring components
│   │   ├── Security/   # Security components
│   │   ├── Settings/   # Settings components
│   │   └── YamlGenerator/ # YAML generator components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── i18n/          # Internationalization
│   ├── services/       # Business logic services
│   ├── store/         # State management (Zustand)
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utility functions
│   └── workers/       # Web workers
├── package.json       # Project dependencies
├── tsconfig.json      # TypeScript configuration
├── vite.config.ts     # Vite configuration
└── tailwind.config.js # Tailwind CSS configuration
```

## Usage

### Creating a Farm

1. Navigate to the Dashboard
2. Click "Create New Farm"
3. Configure farm settings:
   - Name and description
   - Number of agents
   - Task type and parameters
   - Resource limits

### Managing Agents

- View real-time agent status in the monitoring panel
- Control individual agents or entire farms
- Monitor resource usage and performance metrics
- View agent communication patterns

### Go Wild Mode

Enable autonomous exploration:
1. Select a farm
2. Click "Go Wild" button
3. Set creativity and boundary parameters
4. Monitor autonomous task generation and execution

### YAML Generator

Create custom agent prompts:
1. Navigate to YAML Generator
2. Use the visual editor or code view
3. Define steps, goals, and constraints
4. Export or save templates

## Configuration

### Theme Customization

Access theme settings through Settings > Appearance:
- Choose from preset themes
- Create custom themes
- Adjust colors, fonts, and spacing
- Export/import theme configurations

### Language Settings

Supported languages:
- English (default)
- Spanish
- French
- German
- Japanese
- Chinese (Simplified)

### Performance Settings

Optimize for your use case:
- Adjust polling intervals
- Configure cache settings
- Enable/disable animations
- Set resource limits

## API Integration

MaiFarm can be integrated with external systems:

```typescript
// Example API usage
import { FarmAPI } from 'maifarm-sdk';

const api = new FarmAPI({
  baseURL: 'https://your-maifarm-instance.com',
  apiKey: 'your-api-key'
});

// Create a new farm
const farm = await api.farms.create({
  name: 'Development Farm',
  agents: 5,
  task: 'Build a web application'
});

// Monitor farm status
const status = await api.farms.getStatus(farm.id);
```

## Troubleshooting

### Common Issues

1. **Agents not connecting**
   - Check WebSocket connection
   - Verify API endpoint configuration
   - Ensure proper authentication

2. **Performance issues**
   - Reduce number of active agents
   - Adjust monitoring update frequency
   - Clear browser cache

3. **PWA installation problems**
   - Ensure HTTPS is enabled
   - Check manifest.json configuration
   - Verify service worker registration

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with React, TypeScript, and Vite
- UI powered by Tailwind CSS
- State management with Zustand
- 3D visualizations with Three.js
- Icons from Lucide React

## Support

For support, please:
- Check the [documentation](https://docs.maifarm.ai)
- Open an issue on GitHub
- Contact support@maifarm.ai

---

<div align="center">
  Made with ❤️ by the MaiFarm Team
</div>