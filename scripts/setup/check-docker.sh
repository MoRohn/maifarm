#!/bin/bash

echo "🐳 Docker Status Check"
echo "===================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo ""
    echo "Please install Docker Desktop from:"
    echo "https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker daemon is not running"
    echo ""
    echo "Starting Docker Desktop..."
    open -a Docker
    echo ""
    echo "Please wait for Docker to start (usually takes 20-30 seconds)"
    echo "Then run this script again or your docker-compose commands"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Show Docker version
docker --version
docker-compose --version 2>/dev/null || docker compose version

echo ""
echo "You can now use docker-compose commands:"
echo "  - docker-compose up -d     # Start all services"
echo "  - docker-compose ps        # Check service status"
echo "  - docker-compose logs -f   # View logs"
echo "  - docker-compose down      # Stop all services"