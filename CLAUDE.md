# FireLater ITSM Platform - Claude Code Instructions

## Project Overview

FireLater is a multi-tenant IT Service Management (ITSM) SaaS platform with schema-per-tenant PostgreSQL isolation. Built with Fastify backend and Next.js 14+ frontend.

## Tech Stack

- **Backend**: Node.js, Fastify, TypeScript, Drizzle ORM
- **Frontend**: Next.js 14+ (App Router), React, TypeScript, TailwindCSS, shadcn/ui
- **Database**: PostgreSQL with schema-per-tenant multi-tenancy
- **Cache**: Redis with BullMQ for background jobs
- **Testing**: Vitest (unit/integration), Playwright (E2E)

## Directory Structure

```
backend/
  src/
    routes/       # Fastify route handlers (HTTP layer)
    services/     # Business logic (database operations, caching)
    db/           # Drizzle schema and migrations
    jobs/         # BullMQ background job processors
    lib/          # Shared utilities (cache, auth, multi-tenancy)

frontend/
  src/
    app/          # Next.js App Router pages
    components/   # React components (ui/ for shadcn primitives)
    lib/          # Client utilities
    hooks/        # React hooks
```

## Common Commands

### Backend (run from /backend)
```bash
npm run dev          # Start dev server with hot reload
npm run build        # TypeScript compilation
npm run test         # Run Vitest tests
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run migrate      # Run database migrations
npm run migrate:gen  # Generate new migration
npm run seed         # Seed database
```

### Frontend (run from /frontend)
```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run test         # Run Vitest tests
npm run lint         # ESLint
```

### E2E Tests (run from /e2e)
```bash
npm run test         # Run Playwright tests
```

## Architecture Patterns

### Multi-Tenancy
- Each tenant has isolated PostgreSQL schema (`tenant_<slug>`)
- Tenant context passed via `tenantSlug` parameter to all service functions
- Public schema contains tenant registry and shared config

### Service Layer Caching
Services use Redis caching pattern:
```typescript
import { cacheService } from '../lib/cache';

// Read with cache
const cacheKey = `${tenantSlug}:namespace:operation:${JSON.stringify(params)}`;
return cacheService.getOrSet(cacheKey, fetcherFn, { ttl: 600 }); // 10 min TTL

// Invalidate on mutations
await cacheService.invalidateTenant(tenantSlug, 'namespace');
```

### Route/Service Separation
- Routes handle HTTP concerns (request/response, validation, auth)
- Services contain business logic and database operations
- Routes call services, never access DB directly

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Authentication secret

## Testing

Backend tests run with Vitest against test database. Run `npm test` from backend directory. Tests use isolated tenant schemas.

## Code Style

- Use existing patterns in the codebase
- Services return typed objects, not raw query results
- Use Drizzle query builder for database operations
- Cache reads, invalidate on writes
