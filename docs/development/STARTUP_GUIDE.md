# 🚀 MaiFarm Startup Guide

## ✅ Recommended Method (Easiest)

Use the automated startup script:

```bash
/tmp/start-maifarm.sh
```

This script:
- ✅ Kills any existing processes on ports 3000 and 4567
- ✅ Sets all required environment variables
- ✅ Starts backend with auth bypass enabled
- ✅ Starts frontend
- ✅ Verifies both are running
- ✅ Shows you the URLs and PIDs

---

## 📋 Alternative Methods

### Method 1: NPM Scripts (Simpler but may need manual env vars)

```bash
# Start both frontend and backend
npm run start
```

**OR** start them separately:

```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend  
npm run dev:client
```

### Method 2: Manual Start (Full Control)

**Backend:**
```bash
cd /path/to/maifarm
BYPASS_AUTH=true \
NODE_ENV=development \
PORT=4567 \
NODE_OPTIONS=--max-old-space-size=8192 \
npx tsx apps/api/src/index.ts
```

**Frontend (in separate terminal):**
```bash
cd /path/to/maifarm
npm run dev:client
```

---

## 🔑 Critical Environment Variables

These MUST be set for the backend to work properly:

| Variable | Value | Why It's Needed |
|----------|-------|-----------------|
| `BYPASS_AUTH` | `true` | Skips JWT authentication in development |
| `NODE_ENV` | `development` | Enables dev mode features |
| `PORT` | `4567` | Backend API port |
| `NODE_OPTIONS` | `--max-old-space-size=8192` | Prevents memory issues |

**Why your manual start didn't work:**
- Missing `BYPASS_AUTH=true` → Backend requires authentication → 401 errors
- Missing proper environment variables → Server may crash or behave incorrectly

---

## 🛑 Stopping the Application

```bash
# Kill by port
lsof -ti:4567 | xargs kill  # Backend
lsof -ti:3000 | xargs kill  # Frontend

# Or if you know the PIDs
kill <BACKEND_PID> <FRONTEND_PID>
```

---

## 🔍 Troubleshooting

### Backend won't start
```bash
# Check what's using port 4567
lsof -ti:4567

# Kill it
lsof -ti:4567 | xargs kill -9

# Check backend logs
tail -f /tmp/api-server.log
```

### Frontend won't start
```bash
# Check what's using port 3000
lsof -ti:3000

# Kill it
lsof -ti:3000 | xargs kill -9

# Check frontend logs
tail -f /tmp/frontend.log
```

### Getting 401 errors
```bash
# Verify BYPASS_AUTH is set
echo $BYPASS_AUTH

# If empty, set it:
export BYPASS_AUTH=true

# Restart backend
lsof -ti:4567 | xargs kill
/tmp/start-maifarm.sh
```

### Database errors
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# If not, start it:
brew services start postgresql@15

# Verify database exists
psql -U maifarm -d maifarm_dev -c "SELECT 1;"
```

---

## 📍 Access Points

Once started:

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:4567
- **API Health**: http://localhost:4567/api/health
- **WebSocket**: ws://localhost:4567

---

## 🎯 Quick Health Check

```bash
# Check if both are running
lsof -ti:3000 && lsof -ti:4567 && echo "✅ Both running" || echo "❌ Something is down"

# Test backend
curl http://localhost:4567/api/health

# Test frontend
curl http://localhost:3000 | grep "MaiFarm"
```

---

## 💡 Pro Tips

1. **Use the startup script** (`/tmp/start-maifarm.sh`) - it handles everything correctly
2. **Check logs** if something fails - they're in `/tmp/api-server.log` and `/tmp/frontend.log`
3. **Always kill old processes** before starting new ones to avoid port conflicts
4. **The .env.development file** already has correct settings - you don't need to modify it

---

## 📝 What I Did to Fix It

The key difference between my command and a manual start:

**My command (works):**
```bash
BYPASS_AUTH=true NODE_ENV=development PORT=4567 npx tsx apps/api/src/index.ts
```

**Your manual start (fails):**
```bash
npm run dev:server  # May not load BYPASS_AUTH=true correctly
```

The issue is that `npm run dev:server` may not properly load environment variables from `.env.development` in all cases. The startup script explicitly sets them, guaranteeing they're available.
