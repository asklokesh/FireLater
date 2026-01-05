# FireLater Platform - Docker Deployment Guide

This guide explains how to run the entire FireLater platform using Docker.

## 🐳 Overview

The Docker deployment includes all necessary services:

- **Frontend**: Next.js application (Port 3000)
- **Backend**: Fastify API server (Port 3001)
- **PostgreSQL**: Primary database (Port 5432)
- **Redis**: Cache and message queue (Port 6379)
- **MinIO**: S3-compatible object storage (Ports 9000, 9001)

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 4GB RAM available for Docker
- Ports 3000, 3001, 5432, 6379, 9000, 9001 available

### Check Prerequisites

```bash
# Check Docker version
docker --version
docker-compose --version

# Check available ports
lsof -i :3000,3001,5432,6379,9000,9001
```

## 🚀 Quick Start

### 1. Initial Setup

```bash
# Clone the repository (if not already done)
cd /path/to/firelater

# Copy environment configuration
cp .env.docker.example .env.docker

# Edit configuration with your values
nano .env.docker  # or use your preferred editor
```

### 2. Start the Platform

```bash
# Start all services
./docker-start.sh
```

This script will:
1. Stop any local running services
2. Verify environment configuration
3. Build Docker images
4. Start all services
5. Wait for health checks
6. Run database migrations
7. Display access URLs

### 3. Access the Platform

Once started, access the platform at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/docs
- **MinIO Console**: http://localhost:9001

### 4. Stop the Platform

```bash
# Graceful shutdown
./docker-stop.sh

# Or manually
docker-compose down

# Stop and remove all data (DESTRUCTIVE!)
docker-compose down -v
```

## 🔧 Configuration

### Environment Variables

Edit `.env.docker` to configure:

#### Required Configuration

```bash
# JWT Secrets (MUST CHANGE IN PRODUCTION)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars

# Generate secure secrets with:
openssl rand -base64 64
```

#### Database Configuration

```bash
POSTGRES_USER=firelater
POSTGRES_PASSWORD=firelater_password
POSTGRES_DB=firelater
```

#### Optional Integrations

```bash
# Email (SendGrid)
SENDGRID_API_KEY=your-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_BOT_TOKEN=xoxb-...

# Microsoft Teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...

# PagerDuty
PAGERDUTY_API_KEY=your-api-key
```

## 📊 Service Management

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Restart Services

```bash
# Restart specific service
docker-compose restart backend

# Restart all services
docker-compose restart
```

### Check Service Status

```bash
# List all containers
docker-compose ps

# Check health status
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
```

### Execute Commands in Containers

```bash
# Backend shell
docker-compose exec backend sh

# Run migrations manually
docker-compose exec backend npm run migrate

# Database shell
docker-compose exec postgres psql -U firelater -d firelater

# Redis CLI
docker-compose exec redis redis-cli
```

## 🗄️ Database Management

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U firelater firelater > backup.sql

# Create compressed backup
docker-compose exec postgres pg_dump -U firelater firelater | gzip > backup.sql.gz
```

### Restore Database

```bash
# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U firelater -d firelater

# Restore from compressed backup
gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U firelater -d firelater
```

### Reset Database

```bash
# ⚠️ WARNING: This will delete all data!

# Stop services
docker-compose down

# Remove database volume
docker volume rm firelater_postgres_data

# Start services (will create fresh database)
./docker-start.sh
```

## 🔍 Troubleshooting

### Services Won't Start

1. **Check logs**:
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   ```

2. **Verify ports are available**:
   ```bash
   lsof -i :3000,3001,5432,6379,9000,9001
   ```

3. **Rebuild images**:
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Database Connection Errors

1. **Check PostgreSQL is running**:
   ```bash
   docker-compose exec postgres pg_isready -U firelater
   ```

2. **Verify credentials in .env.docker**

3. **Check database logs**:
   ```bash
   docker-compose logs postgres
   ```

### Backend API Not Responding

1. **Check backend logs**:
   ```bash
   docker-compose logs backend
   ```

2. **Verify health endpoint**:
   ```bash
   curl http://localhost:3001/health
   ```

3. **Restart backend**:
   ```bash
   docker-compose restart backend
   ```

### Frontend Not Loading

1. **Check frontend logs**:
   ```bash
   docker-compose logs frontend
   ```

2. **Verify API URL**:
   ```bash
   docker-compose exec frontend env | grep NEXT_PUBLIC_API_URL
   ```

3. **Rebuild frontend**:
   ```bash
   docker-compose build frontend
   docker-compose up -d frontend
   ```

### Out of Disk Space

1. **Clean up unused Docker resources**:
   ```bash
   # Remove unused images
   docker image prune -a

   # Remove unused volumes
   docker volume prune

   # Remove everything unused
   docker system prune -a --volumes
   ```

2. **Check disk usage**:
   ```bash
   docker system df
   ```

## 🔒 Production Deployment

### Security Checklist

- [ ] Change all default passwords
- [ ] Generate new JWT secrets (64+ character random strings)
- [ ] Enable HTTPS with SSL certificates
- [ ] Configure firewall rules
- [ ] Set up log rotation
- [ ] Enable database backups
- [ ] Configure monitoring and alerts
- [ ] Review and minimize exposed ports
- [ ] Set up proper CORS configuration
- [ ] Enable rate limiting
- [ ] Configure CSP headers

### Production Environment Variables

```bash
# Use production values
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_SWAGGER=false

# Set strong secrets
JWT_SECRET=$(openssl rand -base64 64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64)
```

### Using Docker Compose Override

Create `docker-compose.override.yml` for production-specific settings:

```yaml
version: '3.8'

services:
  backend:
    restart: always
    environment:
      LOG_LEVEL: warn
      RATE_LIMIT_MAX_REQUESTS: 1000
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  frontend:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

## 📈 Monitoring

### Health Checks

All services have built-in health checks:

```bash
# Check all service health
docker-compose ps

# Test specific endpoints
curl http://localhost:3001/health
curl http://localhost:3000
```

### Resource Usage

```bash
# Monitor container stats
docker stats

# Check specific container
docker stats firelater-backend
```

## 🆘 Support

For issues or questions:

1. Check logs: `docker-compose logs [service]`
2. Verify configuration: `.env.docker`
3. Review documentation: `/docs`
4. Open an issue: GitHub repository

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Documentation](https://hub.docker.com/_/postgres)
- [Redis Docker Documentation](https://hub.docker.com/_/redis)
- [MinIO Documentation](https://min.io/docs/minio/container/index.html)
