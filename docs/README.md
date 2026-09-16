# MaiFarm Documentation

The project overview is in the root [README](../README.md).

## Getting started

| Guide | What it covers |
|-------|----------------|
| [Setup](development/SETUP.md) | Automated and manual installation |
| [Quick start](development/QUICK_START.md) | Your first farm, start to finish |
| [Startup guide](development/STARTUP_GUIDE.md) | Starting, stopping, and restarting services |
| [Testing](development/TESTING_INSTRUCTIONS.md) | Running the test suites |
| [Integration guide](development/INTEGRATION_GUIDE.md) | Adding providers and services |

## Architecture

| Document | What it covers |
|----------|----------------|
| [System architecture](architecture/MAIFARM_ARCHITECTURE_COMPREHENSIVE.md) | End-to-end system design |
| [Terminal streaming](architecture/TERMINAL_STREAMING_ARCHITECTURE.md) | tmux → WebSocket output pipeline |
| [AI engines](architecture/engines.md) | Engine abstraction and configuration |
| [Engine baseline](architecture/engine-baseline.md) | Reference engine settings |
| [Workflow diagram](diagrams/maifarm-workflow-diagram.html) | Interactive farm lifecycle diagram |

## Features

| Document | What it covers |
|----------|----------------|
| [`farm` command](features/FARM_COMMAND.md) | Installing and using the CLI |
| [Command structure](features/FARM_COMMANDS.md) | Dashboard vs. CLI interfaces |
| [Incubation commands](features/CLI_INCUBATION_COMMANDS.md) | Incubation workflows |
| [GPT-OSS journey](features/GPT_OSS_USER_JOURNEY.md) | Running fully local models |

## Operations

| Document | What it covers |
|----------|----------------|
| [Production runbook](operations/PRODUCTION_RUNBOOK.md) | Day-to-day production procedures |
| [Deployment checklist](operations/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Pre-release and go-live steps |
| [Troubleshooting](operations/TROUBLESHOOTING.md) | Common failures and fixes |
| [Agent backend runbook](operations/AI_AGENT_BACKEND_RUNBOOK.md) | Operating agent providers |
| [Logging standards](operations/LOGGING_STANDARDS.md) | `LogCategory` conventions |
| [Environment parity](operations/ENV_PARITY.md) | Keeping dev, test, and prod aligned |

## Reference

| Card | What it covers |
|------|----------------|
| [MaiFarm quick reference](reference/MAIFARM_QUICK_REFERENCE.md) | Everyday commands |
| [Logging quick reference](reference/LOGGING_QUICK_REFERENCE.md) | Logger usage patterns |
| [Analytics quick reference](reference/ANALYTICS_QUICK_REFERENCE.md) | Metrics and analytics APIs |

## Elsewhere in the repo

| Location | Contents |
|----------|----------|
| [`apps/orchestrator/`](../apps/orchestrator/) | Orchestrator architecture and runbook |
| [`apps/api/src/database/migrations/`](../apps/api/src/database/migrations/) | Migration status |
| [`ios/docs/`](../ios/docs/) | iOS build, TestFlight, and App Store guides |
| [`cli/README.md`](../cli/README.md) | CLI internals |
| [`marketing/`](marketing/) | Product one-pager, pitch script, and social copy |

## Writing docs

- Put new documents in the matching folder above and link them here.
- Prefer updating an existing guide over adding a new one.
- Keep point-in-time status reports out of `docs/`. Use pull request descriptions for those.
