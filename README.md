# FireLater - Lightweight IT Service Management Platform

FireLater is a streamlined ITSM SaaS platform designed for organizations that need core IT operations capabilities without the complexity and cost of enterprise solutions.

## Features

- **Service Catalog** - Drag-and-drop catalog builder with request workflows
- **Issue Management** - Issue tracking, assignment, and resolution
- **On-Call Management** - Calendar-based scheduling with rotations
- **Application Registry** - Inventory with health scoring
- **Change Management** - Change requests with approval workflows
- **Cloud Integrations** - AWS resource sync and cost reporting

## Tech Stack

### Backend
- Node.js 20+ with Fastify
- PostgreSQL 15+ (multi-tenant schema-per-tenant)
- Redis for caching and queues
- BullMQ for background jobs

### Frontend
- Next.js 14+ (App Router)
- shadcn/ui + Tailwind CSS
- TanStack Query + Zustand

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### Development Setup

1. **Clone the repository**
```bash
git clone https://github.com/your-org/firelater.git
cd firelater
```

2. **Start infrastructure with Docker**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

3. **Setup Backend**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run dev
```

4. **Setup Frontend**
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your configuration
npm install
npm run dev
```

5. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Docs: http://localhost:3001/docs

## Docker Deployment

### Build Images
```bash
docker build -t firelater-backend ./backend
docker build -t firelater-frontend ./frontend
```

### Run with Docker Compose
```bash
docker-compose up -d
```

## Environment Variables

See `.env.example` files in `backend/` and `frontend/` directories for all configuration options.

### Required Backend Variables
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT signing
- `JWT_REFRESH_SECRET` - Secret for refresh tokens

### Required Frontend Variables
- `NEXT_PUBLIC_API_URL` - Backend API URL

## Project Structure

```
firelater/
├── backend/              # Fastify API server
│   ├── src/
│   │   ├── config/       # Configuration
│   │   ├── middleware/   # Auth, logging, etc.
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── jobs/         # Background jobs
│   │   └── utils/        # Utilities
│   └── tests/            # Test suites
├── frontend/             # Next.js application
│   ├── src/
│   │   ├── app/          # App router pages
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   ├── lib/          # Utilities
│   │   └── services/     # API clients
│   └── public/           # Static assets
├── docker/               # Docker configurations
├── monitoring/           # Prometheus/Grafana
└── docs/                 # Documentation
```

## API Documentation

API documentation is available at `/docs` when running the backend server.

## Testing

### Backend Tests
```bash
cd backend
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Frontend Tests
```bash
cd frontend
npm run lint          # ESLint
npm run build         # Type check + build
```

## Deployment

### CI/CD
GitHub Actions workflows are configured for:
- **CI** (`ci.yml`) - Lint, test, build on every push/PR
- **Deploy** (`deploy.yml`) - Build and push Docker images on main/tags

### Production Checklist
- [ ] Configure production environment variables
- [ ] Set up PostgreSQL with proper backups
- [ ] Configure Redis with persistence
- [ ] Set up SSL/TLS certificates
- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation
- [ ] Configure CDN for frontend assets

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design, database schema, and API specifications.

## License

Proprietary - All rights reserved
