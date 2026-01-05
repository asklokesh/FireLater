#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           FireLater Development Environment Shutdown          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a port is in use and kill it
kill_port() {
  local port=$1
  local service=$2

  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Stopping $service on port $port...${NC}"
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}✓ $service stopped${NC}"
  else
    echo -e "${BLUE}$service not running${NC}"
  fi
}

# Stop backend and frontend
echo -e "${BLUE}[1/2] Stopping application servers...${NC}"
kill_port 3001 "Backend API"
kill_port 3000 "Frontend"
echo ""

# Stop Docker services
echo -e "${BLUE}[2/2] Stopping infrastructure services...${NC}"
if docker ps | grep -q "firelater-postgres\|firelater-redis\|firelater-minio"; then
  docker compose stop postgres redis minio
  echo -e "${GREEN}✓ Infrastructure services stopped${NC}"
else
  echo -e "${BLUE}Infrastructure services not running${NC}"
fi
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                All Services Stopped Successfully!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} Docker volumes are preserved. Use ${BLUE}docker compose down -v${NC} to remove data."
echo ""
