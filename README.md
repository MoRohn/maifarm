# 🌾 MaiFarm - Where AI Agents Grow Your Code

<div align="center">
  <img src="src/assets/logos/maifarm-logo.svg" alt="MaiFarm Logo" width="200" />
  
  [![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](https://github.com/yourusername/maifarm)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
  [![React](https://img.shields.io/badge/React-18.2.0-61dafb.svg)](https://reactjs.org/)
  [![Harvest Ready](https://img.shields.io/badge/Harvest-Ready-gold.svg)](https://github.com/yourusername/maifarm)
</div>

## 🚜 Welcome to the Digital Farmstead

MaiFarm isn't your grandfather's agriculture - it's a state-of-the-art AI cultivation system where Claude Code agents work the fields of your codebase. Plant a task, tend to your agent farms, and harvest production-ready code. No overalls required (but recommended for the full experience).

### 🌱 What We're Growing Here

MaiFarm orchestrates multiple Claude Code AI agents like a well-organized farming cooperative. Each agent is a skilled farmhand, working collaboratively to tackle complex software development tasks. Whether you're growing a small vegetable patch of bug fixes or managing industrial-scale feature farms, MaiFarm has the tools you need.

## 🎯 Core Farming Operations

### 🌻 **Quick Task Mode** (The Kitchen Garden)
Perfect for those quick cultivation needs - like when you need fresh herbs for tonight's dinner:
- **5-minute grow cycles** - From seed to harvest in record time
- **Single agent deployment** - One skilled gardener per task
- **Automatic harvesting** - Graceful collection 30 seconds before the timer runs out
- **Instant Barn storage** - Your yields are safely stored and ready for consumption

### 🌽 **Farm Mode** (The Production Fields)
For serious agricultural operations with customizable growing seasons:
- **Configurable timeouts** - Set your own harvest schedule (30 minutes to several hours)
- **Multi-agent workforce** - Deploy teams of AI farmhands
- **Collaborative cultivation** - Agents work together like a well-oiled combine harvester
- **Smart shutdown timing** - Automatic harvest collection 30 seconds before season end

### 🦗 **GoWild Mode** (Free-Range Farming)
Let your agents roam free and discover what grows naturally:
- **Autonomous exploration** - Agents decide what to plant and where
- **Creativity settings** - From conservative crop rotation to experimental GMOs
- **Discovery collection** - Gather unexpected yields and innovations
- **Exploration boundaries** - Keep your agents from wandering into the neighbor's field

## 🏗️ Farm Infrastructure

### 🏡 The Homestead (Frontend)
- **React 18 Greenhouse** - Where your UI components flourish
- **TypeScript Soil** - Type-safe foundation for healthy growth
- **Vite Irrigation System** - Lightning-fast development watering
- **Tailwind CSS Landscaping** - Beautiful, responsive farm aesthetics
- **Three.js Observation Tower** - 3D visualizations of your farming operations

### 🏭 The Processing Plant (Backend)
- **Express Grain Elevator** - Robust API handling and storage
- **PostgreSQL Root Cellar** - Deep storage for your data crops
- **Redis Pickle Jar** - Quick-access cache for frequently used preserves
- **Socket.io Telegraph Lines** - Real-time communication across the farm
- **Prometheus Weather Station** - Monitor your farm's vital signs

### 🌾 The Barn (Storage System)
Our revolutionary **isolated storage facility** keeps your harvests safe and organized:
- **Quarantine Zone** (`maibarn/` directory) - All outputs safely isolated from main codebase
- **Automatic Collection** - Files gathered with retry logic and validation
- **Organized Storage** - Structured directories for configs, logs, yields, and summaries
- **Easy Access** - Browse and download your harvests through the Barn UI

## 🚀 Starting Your Farm

### Prerequisites (Farm Equipment)
- Node.js 18+ (Your trusty tractor)
- PostgreSQL (The root cellar)
- Redis (The pickle jar)
- Python 3.8+ (For advanced irrigation systems)

### Setting Up Your Homestead

1. **Claim Your Land**
```bash
git clone https://github.com/yourusername/maifarm.git
cd maifarm
```

2. **Plant Your Dependencies**
```bash
npm install
```

3. **Prepare Your Fields** (`.env.development`)
```env
# Farm Configuration
PORT=4567                    # Where the farmhands report for duty
BYPASS_AUTH=true            # Open farm policy (development only!)
NODE_ENV=development        # Growing season

# Root Cellar (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm
DB_USER=farmer
DB_PASSWORD=harvest2024

# Pickle Jar (Redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Farmhand Provider
AI_PROVIDER=claude          # or 'qwen' for international workers
```

4. **Start Farming!**
```bash
npm run start               # Automated farm startup (recommended)
# or
npm run dev                 # Manual cultivation mode
```

Your farm will be open for business at `http://localhost:3000` 🎉

## 🧑‍🌾 Daily Farm Operations

### Morning Chores
```bash
npm run start               # Wake up the farmhands
npm run dev                 # Start with morning coffee (hot-reload enabled)
npm run build              # Prepare for market day
npm run preview            # Preview your produce
```

### Quality Control
```bash
npm run lint               # Check for pests and diseases
npm run typecheck          # Ensure proper crop typing
npm run format             # Beautify your fields
npm test                   # Inspect every plant
```

### Specialized Operations
```bash
# Test your harvest systems
npm test -- tests/integration/graceful-shutdown.test.ts

# Run the combine harvester
npm run test:e2e

# Check the greenhouse coverage
npm run test:coverage

# Analyze your crop yield
npm run analyze
```

## 🎭 Advanced Farming Techniques

### Multi-Agent Crop Rotation
Deploy multiple Claude agents for large-scale operations:
```bash
python orchestrator.py -n 5 -p "Cultivate a full authentication system"
```

### AI Provider Selection
Choose your farmhand nationality:
```bash
# Use Qwen workers (great for international farms)
export AI_PROVIDER=qwen
npm run qwen:test

# Or stick with Claude (the reliable local)
export AI_PROVIDER=claude
```

### Docker Greenhouse
For climate-controlled environments:
```bash
# Standard greenhouse
docker-compose up -d

# Production-grade facility
docker-compose -f docker-compose.production.yml up -d
```

## 🌟 Premium Farm Features

### 🎯 **Graceful Shutdown System** (NEW!)
Never lose a single grain during harvest:
- **30-second warning** before timeout across all modes
- **Automatic file collection** with retry logic
- **Validation checks** ensure complete harvest
- **Instant Barn storage** for immediate access

### 📊 **Analytics Dashboard**
Track your farm's productivity:
- Real-time agent performance metrics
- Historical yield analysis
- Resource utilization graphs
- Task completion rates

### 🔐 **Security Fencing**
Keep your farm secure:
- JWT-based farm access passes
- Role-based permissions (Owner, Farmhand, Visitor)
- Isolated storage prevents contamination
- Audit logging for all activities

### 🎨 **Customizable Scarecrows** (Themes)
Personalize your farm's appearance:
- Dynamic theme engine
- Dark mode for night farming
- Custom color schemes
- Responsive design for mobile farming

## 🗂️ Farm Layout

```
maifarm/                     # The main farmstead
├── src/                     # Frontend greenhouse
│   ├── components/         # UI crop varieties
│   ├── services/          # Farming tools
│   └── store/             # Seed storage
├── server/                  # Backend processing plant
│   ├── api/               # Market interfaces
│   ├── services/          # Heavy machinery
│   └── websocket/         # Communication towers
├── maibarn/                # 🔒 Isolated harvest storage
│   ├── coordination/      # Agent meeting grounds
│   ├── harvests/         # Completed crops
│   └── workspaces/       # Active fields
└── scripts/                # Farm automation
```

## 🐛 Pest Control (Troubleshooting)

### Common Infestations

**🐛 Port 4567 already in use**
- The startup script handles this automatically
- Manual fix: `lsof -i :4567` and eliminate the squatter

**🕷️ WebSocket won't connect**
- Check your scarecrow configuration (CORS)
- Ensure port 4567 is accessible through the farm gates

**🐜 Database connection failed**
- Is PostgreSQL running? (`brew services list`)
- Check your root cellar credentials in `.env`

**🦗 Graceful shutdown not collecting files**
- Verify harvest ID exists
- Check `shutdownCoordinator` logs
- Ensure 30-second grace period is respected

## 🤝 Join the Farming Community

### Contributing to the Harvest
We welcome all farmers! Whether you're:
- 🌱 Planting new features
- 🐛 Debugging pest problems
- 📚 Writing farmer's almanac entries (docs)
- 🎨 Designing better scarecrows (UI)

### Farm Tours and Support
- 📖 Check the [Farmer's Guide](docs/GRACEFUL_SHUTDOWN.md) for shutdown procedures
- 🎓 Visit [CLAUDE.md](CLAUDE.md) for AI farmhand instructions
- 🐛 Report pests at [Issues](https://github.com/yourusername/maifarm/issues)
- 💬 Join the [Farmer's Market](https://discord.gg/maifarm) (Discord)

## 📜 Farming License

This farm operates under the MIT License - see [LICENSE](LICENSE) for details. Feel free to fork this farm and start your own agricultural empire!

## 🙏 Acknowledgments

- 🤖 **Claude** - Our tireless AI farmhand
- 🌾 **The Open Source Community** - For providing quality seeds and tools
- ☕ **Coffee** - The true fuel of digital farming
- 🚜 **You** - For choosing sustainable AI farming

---

<div align="center">
  <i>Happy Farming! May your harvests be bountiful and your bugs be few.</i>
  
  **MaiFarm v2.0** - *Cultivating Code, Harvesting Innovation*
  
  🌾 🚜 🌻 🌽 🎃 🥕 🍅 🥒 🌶️ 🫘 🌾
</div>