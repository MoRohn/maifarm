# MaiFarm Quick Start Guide

## 🚀 Super Simple Startup

After updating your shell config (`source ~/.zshrc`), you can use:

### The Smart 'farm' Command

```bash
# Auto-detects environment and starts appropriately
farm

# Force specific environments
farm-dev   # Development with auth bypass
farm-prod  # Production mode (requires auth)
```

## How It Works

The `farm` command now:
1. **Automatically detects** your environment
2. **In Development**: Enables auth bypass, no login needed
3. **In Production**: Uses proper authentication
4. **Smart defaults**: Development mode on your local machine

## Environment Detection

The script detects environment based on:
- `NODE_ENV` environment variable (if set)
- Presence of `.env.production` or `.env.staging` files
- Hostname containing "prod" or "stage"
- Default: Development mode

## Manual Control

You can always override:

```bash
# Force development mode from anywhere
NODE_ENV=development farm

# Force production mode
NODE_ENV=production farm
```

## What Each Command Does

| Command | Environment | Auth | Port | Notes |
|---------|------------|------|------|-------|
| `farm` | Auto-detect | Auto | 4567 | Smart default |
| `farm-dev` | Development | Bypass | 4567 | For local development |
| `farm-prod` | Production | Required | 4567 | For production/staging |

## Quick Troubleshooting

If `farm` command not found:
```bash
source ~/.zshrc
```

If you see auth errors:
- Make sure you're using `farm` (not the old version)
- Or explicitly use `farm-dev` for development

## Accessing the App

Once started:
- **Dashboard**: http://localhost:3000
- **API**: http://localhost:4567
- **Health Check**: http://localhost:4567/api/healthz

## That's It!

Just type `farm` and go! 🌱