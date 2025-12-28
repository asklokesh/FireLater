# FireLater - IT Service Management Platform

## IMPORTANT: ACTION REQUIRED

You are running in autonomous mode. DO NOT just analyze or summarize.
You MUST actively implement tasks from `@fix_plan.md`.

**Your job is to:**
1. Read `@fix_plan.md` to find the next uncompleted task (marked with `- [ ]`)
2. Implement that task by writing/editing actual code files
3. After completing a task, update `@fix_plan.md` to mark it done (change `- [ ]` to `- [x]`)
4. Continue to the next task

DO NOT output summaries, status reports, or analysis. WRITE CODE.

## Project Overview

FireLater is a modern IT Service Management (ITSM) platform with multi-tenant architecture, built with:
- **Backend**: Node.js + Fastify + PostgreSQL + Redis + BullMQ
- **Frontend**: Next.js 15 + Tailwind CSS + Zustand

## Current State

The platform is 94% complete with 29 of 31 phases done. All core functionality is implemented.

## Primary Goal

Complete the remaining features from `@fix_plan.md`. Pick the first uncompleted task and implement it NOW.

## Key Directories

- `/backend` - Fastify API server
- `/frontend` - Next.js application
- `/docker-compose.yml` - Production setup
- `/docker-compose.dev.yml` - Development infrastructure
- `/specs` - Project requirements and specifications

## Development Commands

```bash
# Start infrastructure
docker compose -f docker-compose.dev.yml up -d

# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev

# Run tests
cd backend && npm test
```

## API Endpoints

Backend runs on http://localhost:3001
Frontend runs on http://localhost:3000
API documentation: http://localhost:3001/documentation

## Constraints

- Follow existing code patterns and naming conventions
- Do not use emojis in code or UI
- Prefer editing existing files over creating new ones
- Use TypeScript strict mode
- Follow existing Tailwind CSS class patterns

## Ralph Autonomous Development

This project is configured for Ralph autonomous development loop.

### Ralph Control Files
- `PROMPT.md` - This file, main instructions
- `@fix_plan.md` - Prioritized task list (18 tasks)
- `@AGENT.md` - Build and run instructions
- `specs/requirements.md` - Detailed requirements
- `.claude/settings.local.json` - Pre-approved tool permissions

### How Ralph Achieves Autonomy

Ralph does NOT use `--dangerously-skip-permissions`. Instead it uses:

1. **Pre-approved permissions** in `.claude/settings.local.json` - specific commands are
   whitelisted so Claude won't prompt for approval
2. **Stdin piping** - PROMPT.md is piped to claude, running in batch mode
3. **Loop orchestration** - bash script handles repeated invocations with rate limiting

### Running Ralph

```bash
# Start autonomous development with monitoring
ralph --monitor

# Or with custom settings
ralph --monitor --calls 50 --timeout 60

# Check status
ralph --status
```

### Alternative: Direct Claude Code

For fully autonomous execution, you can also use:

```bash
# Option 1: Use permission bypass (use with caution in sandboxed environments)
claude --dangerously-skip-permissions

# Option 2: Specify allowed tools explicitly
claude --allowedTools "Bash(npm:*)" "Bash(git:*)" "Read" "Write" "Edit" "Grep" "Glob"
```

The `.claude/settings.local.json` in this project already pre-approves common development
commands for autonomous operation.
