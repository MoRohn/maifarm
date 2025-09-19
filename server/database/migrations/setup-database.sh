#!/bin/bash

# Database Setup Script for MaiFarm
# Creates the database, user, and applies initial migrations

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-maifarm_dev}"
DB_USER="${DB_USER:-maifarm}"
DB_PASSWORD="${DB_PASSWORD:-maifarm123}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "====================================="
echo "MaiFarm Database Setup"
echo "====================================="
echo ""

# Check if PostgreSQL is running
print_info "Checking PostgreSQL service..."
if command -v brew &> /dev/null; then
    if brew services list | grep -q "postgresql.*started"; then
        print_info "✓ PostgreSQL is running"
    else
        print_error "✗ PostgreSQL is not running"
        echo "Start it with: brew services start postgresql@15"
        exit 1
    fi
else
    # Non-brew system, check with pg_isready
    if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
        print_info "✓ PostgreSQL is running"
    else
        print_error "✗ PostgreSQL is not running"
        exit 1
    fi
fi

# Create database if it doesn't exist
print_info "Creating database '$DB_NAME'..."
if psql -U postgres -h $DB_HOST -p $DB_PORT -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    print_warning "Database '$DB_NAME' already exists"
else
    if psql -U postgres -h $DB_HOST -p $DB_PORT -c "CREATE DATABASE $DB_NAME;" 2>/dev/null; then
        print_info "✓ Database created successfully"
    else
        # Try without specifying user (uses current system user)
        if createdb $DB_NAME 2>/dev/null; then
            print_info "✓ Database created successfully"
        else
            print_error "Failed to create database. You may need to run:"
            echo "  sudo -u postgres createdb $DB_NAME"
            echo "  OR"
            echo "  createdb $DB_NAME"
            exit 1
        fi
    fi
fi

# Create user if it doesn't exist
print_info "Creating user '$DB_USER'..."
if psql -U postgres -h $DB_HOST -p $DB_PORT -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    print_warning "User '$DB_USER' already exists"
else
    if psql -U postgres -h $DB_HOST -p $DB_PORT -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null; then
        print_info "✓ User created successfully"
    else
        # Try without specifying user
        if createuser $DB_USER 2>/dev/null; then
            psql -d $DB_NAME -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null
            print_info "✓ User created successfully"
        else
            print_warning "Could not create user. It may already exist or you need sudo."
        fi
    fi
fi

# Grant privileges
print_info "Granting privileges..."
psql -U postgres -h $DB_HOST -p $DB_PORT -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || 
psql -d $DB_NAME -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || 
print_warning "Could not grant privileges. User may already have them."

# Test connection
print_info "Testing connection..."
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\q" 2>/dev/null; then
    print_info "✓ Connection successful!"
else
    print_error "✗ Cannot connect to database"
    print_error "Please check your credentials"
    exit 1
fi

echo ""
print_info "Database setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run migrations: ./apply-migrations.sh"
echo "  2. Start the application: npm run dev"
echo ""
echo "Database connection details:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""

# Ask if user wants to apply migrations now
read -p "Do you want to apply migrations now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./apply-migrations.sh
fi