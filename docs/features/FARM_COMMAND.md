# MaiFarm `farm` Command

The `farm` command is a convenient CLI tool for running MaiFarm in production mode.

## Installation

The `farm` command has been automatically installed and added to your shell configuration.

### Manual Installation (if needed)

If you need to reinstall or install for another user:

```bash
cd /path/to/maifarm
./install-farm-command.sh
```

### Verify Installation

```bash
# Check if command is available
farm help

# Or test with status
farm status
```

## Usage

```bash
farm [command]
```

## Available Commands

### `farm` or `farm start`
Start MaiFarm in production mode (default command)

```bash
farm
# or
farm start
```

**What it does:**
- Checks if MaiFarm is already running
- Builds production assets if needed
- Starts the production server on port 4567
- Opens at: http://localhost:4567

### `farm stop`
Stop the MaiFarm production server

```bash
farm stop
```

**What it does:**
- Stops any process running on port 4567
- Gracefully shuts down the server

### `farm restart`
Restart the MaiFarm production server

```bash
farm restart
```

**What it does:**
- Stops the current server
- Waits 2 seconds
- Starts a fresh instance

### `farm status`
Check if MaiFarm is running

```bash
farm status
```

**Output includes:**
- Server status (Running/Not Running)
- Port number
- URL to access
- Health check results

### `farm logs`
View MaiFarm production logs

```bash
farm logs
```

**What it does:**
- Shows real-time server logs
- Useful for debugging
- Press Ctrl+C to exit

### `farm build`
Build production assets

```bash
farm build
```

**What it does:**
- Compiles TypeScript
- Builds frontend with Vite
- Prepares optimized production bundle
- Creates static files in `apps/dashboard/dist/`

### `farm dev`
Start MaiFarm in development mode

```bash
farm dev
```

**What it does:**
- Runs development servers
- Frontend on port 3000
- Backend on port 4567
- Hot module reloading enabled

### `farm help`
Show help and usage information

```bash
farm help
```

## Quick Start Examples

### First Time Setup
```bash
# 1. Build production assets
farm build

# 2. Start production server
farm start

# 3. Open browser to http://localhost:4567
```

### Daily Usage
```bash
# Start MaiFarm
farm

# Check if running
farm status

# View logs
farm logs

# Stop when done
farm stop
```

### Development Workflow
```bash
# Start in dev mode for coding
farm dev

# When ready for production testing
farm stop
farm build
farm start
```

### Troubleshooting
```bash
# If server won't start
farm stop
farm status
farm start

# If you need to rebuild
farm build
farm restart

# Check logs for errors
farm logs
```

## File Locations

- **Main script:** `/path/to/maifarm/farm`
- **Installer:** `/path/to/maifarm/install-farm-command.sh`
- **Shell config:** `~/.zshrc` (or `~/.bashrc` for bash users)

## System-Wide Installation (Optional)

To make the `farm` command available to all users on the system:

```bash
sudo ln -sf /path/to/maifarm/farm /usr/local/bin/farm
```

**Note:** This requires administrator (sudo) privileges.

## Environment

The `farm` command uses these settings:

- **Production Mode:** `NODE_ENV=production`
- **Port:** 4567
- **Build Output:** `apps/dashboard/dist/`
- **Working Directory:** `/path/to/maifarm`

## Advanced Usage

### Custom Port (edit the farm script)

Open `/path/to/maifarm/farm` and modify:

```bash
# Change from port 4567 to custom port
lsof -ti:YOUR_PORT | xargs kill -9
```

### PM2 Integration

For production environments with PM2:

```bash
# The farm logs command will detect PM2 automatically
farm logs  # Uses PM2 logs if available
```

## Uninstallation

To remove the `farm` command:

1. **Remove from shell config:**
   ```bash
   # Edit your shell config file
   nano ~/.zshrc  # or ~/.bashrc

   # Remove these lines:
   # MaiFarm Command
   alias farm="/path/to/maifarm/farm"
   export PATH="/path/to/maifarm:$PATH"
   ```

2. **Reload shell:**
   ```bash
   source ~/.zshrc
   ```

3. **Remove system-wide symlink (if installed):**
   ```bash
   sudo rm /usr/local/bin/farm
   ```

## Support

For issues or questions:

1. Check MaiFarm documentation: `CLAUDE.md`
2. View troubleshooting: `farm help`
3. Check logs: `farm logs`
4. Verify status: `farm status`

## Version

MaiFarm Command v1.0.0

Last updated: January 2025
