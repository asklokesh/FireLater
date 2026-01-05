#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           FireLater Development Environment Startup           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
  lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

# Function to wait for service health
wait_for_service() {
  local service=$1
  local port=$2
  local max_attempts=30
  local attempt=1

  echo -e "${YELLOW}Waiting for $service to be healthy...${NC}"

  while [ $attempt -le $max_attempts ]; do
    if port_in_use $port; then
      echo -e "${GREEN}✓ $service is healthy${NC}"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  echo -e "${RED}✗ $service failed to start${NC}"
  return 1
}

# Check prerequisites
echo -e "${BLUE}[1/7] Checking prerequisites...${NC}"

if ! command_exists docker; then
  echo -e "${RED}✗ Docker is not installed${NC}"
  exit 1
fi

if ! command_exists node; then
  echo -e "${RED}✗ Node.js is not installed${NC}"
  exit 1
fi

if ! command_exists npm; then
  echo -e "${RED}✗ npm is not installed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All prerequisites installed${NC}"
echo ""

# Check if services are already running
echo -e "${BLUE}[2/7] Checking for running services...${NC}"

if docker ps | grep -q "firelater-postgres\|firelater-redis\|firelater-minio"; then
  echo -e "${YELLOW}Infrastructure services already running${NC}"
else
  echo -e "${BLUE}Starting infrastructure services (PostgreSQL, Redis, MinIO)...${NC}"
  docker compose up -d postgres redis minio

  # Wait for services to be healthy
  echo -e "${YELLOW}Waiting for services to be healthy (this may take 30-60 seconds)...${NC}"
  sleep 5

  # Check Docker health status
  max_wait=60
  elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    postgres_health=$(docker inspect --format='{{.State.Health.Status}}' firelater-postgres 2>/dev/null || echo "starting")
    redis_health=$(docker inspect --format='{{.State.Health.Status}}' firelater-redis 2>/dev/null || echo "starting")
    minio_health=$(docker inspect --format='{{.State.Health.Status}}' firelater-minio 2>/dev/null || echo "starting")

    if [ "$postgres_health" = "healthy" ] && [ "$redis_health" = "healthy" ] && [ "$minio_health" = "healthy" ]; then
      echo -e "${GREEN}✓ All infrastructure services are healthy${NC}"
      break
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  if [ $elapsed -ge $max_wait ]; then
    echo -e "${YELLOW}⚠ Health check timeout, but services may still be starting${NC}"
  fi
fi
echo ""

# Install backend dependencies if needed
echo -e "${BLUE}[3/7] Checking backend dependencies...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing backend dependencies...${NC}"
  npm install
else
  echo -e "${GREEN}✓ Backend dependencies already installed${NC}"
fi
cd ..
echo ""

# Run migrations
echo -e "${BLUE}[4/7] Running database migrations...${NC}"
cd backend
npm run migrate 2>&1 | tail -n 5
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Migrations completed${NC}"
else
  echo -e "${RED}✗ Migration failed${NC}"
  exit 1
fi
cd ..
echo ""

# Install frontend dependencies if needed
echo -e "${BLUE}[5/7] Checking frontend dependencies...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing frontend dependencies...${NC}"
  npm install
else
  echo -e "${GREEN}✓ Frontend dependencies already installed${NC}"
fi
cd ..
echo ""

# Kill existing backend/frontend processes if running
if port_in_use 3001; then
  echo -e "${YELLOW}Stopping existing backend process...${NC}"
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  sleep 2
fi

if port_in_use 3000; then
  echo -e "${YELLOW}Stopping existing frontend process...${NC}"
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Start backend
echo -e "${BLUE}[6/7] Starting backend API server...${NC}"
cd backend
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
wait_for_service "Backend API" 3001
echo ""

# Start frontend
echo -e "${BLUE}[7/7] Starting frontend development server...${NC}"
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend to be ready
wait_for_service "Frontend" 3000
echo ""

# Display status
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Platform Started Successfully!                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Services:${NC}"
echo -e "  ${GREEN}✓${NC} PostgreSQL:  running on port 5432"
echo -e "  ${GREEN}✓${NC} Redis:       running on port 6379"
echo -e "  ${GREEN}✓${NC} MinIO:       running on ports 9000 (API), 9001 (Console)"
echo -e "  ${GREEN}✓${NC} Backend API: http://localhost:3001"
echo -e "  ${GREEN}✓${NC} Frontend:    http://localhost:3000"
echo ""
echo -e "${BLUE}Process IDs:${NC}"
echo -e "  Backend:  $BACKEND_PID"
echo -e "  Frontend: $FRONTEND_PID"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Backend:  tail -f backend.log"
echo -e "  Frontend: tail -f frontend.log"
echo ""
echo -e "${YELLOW}First Time Setup:${NC}"
echo -e "  1. Visit ${BLUE}http://localhost:3000${NC}"
echo -e "  2. Click 'Register' to create your first tenant"
echo -e "  3. Fill in:"
echo -e "     - Tenant Name: Your organization name"
echo -e "     - Tenant Slug: URL identifier (e.g., 'acme-corp')"
echo -e "     - Admin Email: Your email address"
echo -e "     - Admin Name: Your name"
echo -e "     - Admin Password: Minimum 8 characters"
echo ""
echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  ./stop-dev.sh"
echo ""
echo -e "${GREEN}Ready to use!${NC}"
