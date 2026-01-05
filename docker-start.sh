#!/bin/bash

# =============================================================================
# FireLater Platform - Docker Startup Script
# =============================================================================
# This script stops all local services and starts the entire platform in Docker

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo ""
    print_message "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$BLUE"
    print_message "$1" "$BLUE"
    print_message "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$BLUE"
    echo ""
}

# Change to script directory
cd "$(dirname "$0")"

print_header "🚀 FireLater Platform - Docker Startup"

# Step 1: Stop all local services
print_message "📛 Step 1: Stopping all local services..." "$YELLOW"

# Kill Node.js processes (backend, frontend)
print_message "  • Stopping Node.js processes..." "$BLUE"
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "node.*dist/index.js" 2>/dev/null || true
sleep 2

print_message "  ✓ Local services stopped" "$GREEN"

# Step 2: Check for .env.docker file
print_message "📝 Step 2: Checking environment configuration..." "$YELLOW"

if [ ! -f ".env.docker" ]; then
    print_message "  ⚠ .env.docker not found. Creating from example..." "$YELLOW"
    cp .env.docker.example .env.docker
    print_message "  ⚠ IMPORTANT: Please edit .env.docker with your actual configuration!" "$RED"
    print_message "  Press Enter to continue after editing, or Ctrl+C to abort..." "$YELLOW"
    read
fi

print_message "  ✓ Environment configuration ready" "$GREEN"

# Step 3: Stop existing Docker containers
print_message "🐳 Step 3: Stopping existing Docker containers..." "$YELLOW"
docker compose down 2>/dev/null || true
print_message "  ✓ Existing containers stopped" "$GREEN"

# Step 4: Pull latest images
print_message "📥 Step 4: Pulling latest base images..." "$YELLOW"
docker compose pull 2>/dev/null || print_message "  ⚠ Pull skipped (might be offline or custom build)" "$YELLOW"

# Step 5: Build application images
print_message "🔨 Step 5: Building application images..." "$YELLOW"
print_message "  • Building backend..." "$BLUE"
docker compose build backend

print_message "  • Building frontend..." "$BLUE"
docker compose build frontend

print_message "  ✓ Images built successfully" "$GREEN"

# Step 6: Start all services
print_message "🚀 Step 6: Starting all services..." "$YELLOW"
docker compose --env-file .env.docker up -d

print_message "  ✓ Services started" "$GREEN"

# Step 7: Wait for services to be healthy
print_message "⏳ Step 7: Waiting for services to be healthy..." "$YELLOW"

print_message "  • Waiting for PostgreSQL..." "$BLUE"
timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -U firelater 2>/dev/null; do sleep 2; done' || {
    print_message "  ✗ PostgreSQL failed to start" "$RED"
    exit 1
}
print_message "  ✓ PostgreSQL is ready" "$GREEN"

print_message "  • Waiting for Redis..." "$BLUE"
timeout 30 bash -c 'until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 2; done' || {
    print_message "  ✗ Redis failed to start" "$RED"
    exit 1
}
print_message "  ✓ Redis is ready" "$GREEN"

print_message "  • Waiting for MinIO..." "$BLUE"
timeout 30 bash -c 'until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do sleep 2; done' || {
    print_message "  ✗ MinIO failed to start" "$RED"
    exit 1
}
print_message "  ✓ MinIO is ready" "$GREEN"

print_message "  • Waiting for Backend API..." "$BLUE"
timeout 90 bash -c 'until curl -sf http://localhost:3001/health > /dev/null 2>&1; do sleep 3; done' || {
    print_message "  ✗ Backend API failed to start" "$RED"
    docker compose logs backend | tail -50
    exit 1
}
print_message "  ✓ Backend API is ready" "$GREEN"

print_message "  • Waiting for Frontend..." "$BLUE"
timeout 90 bash -c 'until curl -sf http://localhost:3000 > /dev/null 2>&1; do sleep 3; done' || {
    print_message "  ✗ Frontend failed to start" "$RED"
    docker compose logs frontend | tail -50
    exit 1
}
print_message "  ✓ Frontend is ready" "$GREEN"

# Step 8: Run database migrations
print_message "🔄 Step 8: Running database migrations..." "$YELLOW"
docker compose exec -T backend node dist/migrations/run.js || {
    print_message "  ⚠ Migrations might have failed. Check logs with: docker compose logs backend" "$YELLOW"
}
print_message "  ✓ Migrations completed" "$GREEN"

# Step 9: Show status
print_header "✅ FireLater Platform Started Successfully!"

print_message "📊 Service Status:" "$GREEN"
docker compose ps

echo ""
print_message "🌐 Access URLs:" "$GREEN"
print_message "  • Frontend:       http://localhost:3000" "$BLUE"
print_message "  • Backend API:    http://localhost:3001" "$BLUE"
print_message "  • API Docs:       http://localhost:3001/docs" "$BLUE"
print_message "  • MinIO Console:  http://localhost:9001" "$BLUE"
print_message "  • PostgreSQL:     localhost:5432" "$BLUE"
print_message "  • Redis:          localhost:6379" "$BLUE"

echo ""
print_message "📝 Useful Commands:" "$YELLOW"
print_message "  • View logs:      docker compose logs -f [service]" "$BLUE"
print_message "  • Stop platform:  docker compose down" "$BLUE"
print_message "  • Restart:        docker compose restart [service]" "$BLUE"
print_message "  • Shell access:   docker compose exec [service] sh" "$BLUE"

echo ""
print_message "🎉 Platform is ready to use!" "$GREEN"
echo ""
