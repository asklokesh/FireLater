#!/bin/bash

# =============================================================================
# FireLater Platform - Docker Stop Script
# =============================================================================
# This script stops all Docker services cleanly

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

# Change to script directory
cd "$(dirname "$0")"

echo ""
print_message "🛑 Stopping FireLater Platform..." "$YELLOW"
echo ""

# Check if Docker Compose is running
if ! docker compose ps | grep -q "Up"; then
    print_message "ℹ  No running containers found" "$BLUE"
    exit 0
fi

# Show what's running
print_message "📊 Current services:" "$BLUE"
docker compose ps

echo ""
print_message "⏳ Stopping all services..." "$YELLOW"

# Stop all services gracefully
docker compose stop

print_message "  ✓ All services stopped" "$GREEN"

# Option to remove containers and volumes
echo ""
read -p "$(echo -e ${YELLOW}Do you want to remove containers? [y/N]: ${NC})" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_message "🗑  Removing containers..." "$YELLOW"
    docker compose down
    print_message "  ✓ Containers removed" "$GREEN"

    echo ""
    read -p "$(echo -e ${RED}Do you want to remove volumes (⚠ THIS WILL DELETE ALL DATA)? [y/N]: ${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_message "🗑  Removing volumes..." "$RED"
        docker compose down -v
        print_message "  ✓ Volumes removed" "$GREEN"
    fi
fi

echo ""
print_message "✅ Platform stopped successfully!" "$GREEN"
echo ""
