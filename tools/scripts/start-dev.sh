#!/bin/bash

# MaiFarm Development Server Startup Script

echo "Starting MaiFarm Development Environment..."

# Kill any existing processes
echo "Cleaning up existing processes..."
pkill -f "tsx.*apps/api/src/index.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
lsof -ti:4567 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Wait for ports to be freed
sleep 2

# Start the development server
echo "Starting development servers..."
npm run dev
