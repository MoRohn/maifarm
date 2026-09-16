#!/bin/bash

# MaiFarm Smart Startup Script
# Automatically detects environment and applies correct settings

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Detect environment based on multiple factors
detect_environment() {
    # Check if explicitly set
    if [[ -n "$NODE_ENV" ]]; then
        echo "$NODE_ENV"
        return
    fi

    # Check for production indicators (only in actual production environment)
    if [[ "$HOSTNAME" == *"prod"* ]] || [[ "$USER" == "deploy" ]]; then
        echo "production"
        return
    fi

    # Check for staging indicators
    if [[ "$HOSTNAME" == *"stage"* ]] || [[ "$HOSTNAME" == *"staging"* ]]; then
        echo "staging"
        return
    fi

    # Default to development (presence of .env files doesn't determine environment)
    echo "development"
}

# Get the environment
ENV=$(detect_environment)

echo -e "${CYAN}${BOLD}🌱 MaiFarm Smart Startup${NC}"
echo -e "${BLUE}Detected environment: ${YELLOW}${ENV}${NC}"

# Apply environment-specific settings
case "$ENV" in
    development)
        echo -e "${GREEN}✓ Starting in DEVELOPMENT mode with auth bypass${NC}"
        export NODE_ENV=development
        export BYPASS_AUTH=true
        export VITE_BYPASS_AUTH=true

        # Load development environment if it exists
        if [[ -f ".env.development" ]]; then
            set -a
            source .env.development
            set +a
        fi

        # Start with development settings
        npm run start
        ;;

    staging)
        echo -e "${YELLOW}✓ Starting in STAGING mode${NC}"
        export NODE_ENV=staging
        export BYPASS_AUTH=false

        # Load staging environment if it exists
        if [[ -f ".env.staging" ]]; then
            set -a
            source .env.staging
            set +a
        fi

        # Build and start
        npm run build
        npm run start:prod
        ;;

    production)
        echo -e "${RED}✓ Starting in PRODUCTION mode${NC}"
        export NODE_ENV=production
        export BYPASS_AUTH=false

        # Load production environment if it exists
        if [[ -f ".env.production" ]]; then
            set -a
            source .env.production
            set +a
        fi

        # Ensure build is up to date
        npm run build

        # Start with PM2 if available, otherwise use start:prod
        if command -v pm2 &> /dev/null; then
            echo -e "${GREEN}Using PM2 for production${NC}"
            pm2 start ecosystem.config.js --env production
        else
            npm run start:prod
        fi
        ;;

    *)
        echo -e "${RED}Unknown environment: $ENV${NC}"
        exit 1
        ;;
esac