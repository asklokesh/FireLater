#!/bin/bash
# Autonomous Development Loop for FireLater
# Uses Aider with qwen3-coder:480b-cloud via Ollama

PROJECT_DIR="/Users/lokesh/git/firelater"
TODO_FILE="$PROJECT_DIR/AUTONOMOUS_TODO.md"
LOG_FILE="$PROJECT_DIR/.autonomous-dev.log"
AIDER_CMD="$HOME/.local/bin/aider"
ITERATION=0

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
    echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize TODO file
init_todo() {
    if [ ! -f "$TODO_FILE" ]; then
        cat > "$TODO_FILE" << 'EOF'
# FireLater Autonomous Development

## Priority Queue (Next task to execute)
- [ ] AUDIT: Perform comprehensive security audit of authentication flow
- [ ] AUDIT: Check for SQL injection vulnerabilities in all database queries
- [ ] AUDIT: Review error handling across all API endpoints
- [ ] PERF: Analyze and optimize slow database queries
- [ ] TEST: Add missing unit tests for critical business logic
- [ ] STABILITY: Add proper input validation to all API endpoints
- [ ] STABILITY: Implement rate limiting for public endpoints
- [ ] UX: Review and improve error messages shown to users
- [ ] DOCS: Update API documentation with examples
- [ ] PROD: Review production deployment configuration

## In Progress

## Completed

## Session Notes

EOF
        log "${GREEN}Initialized AUTONOMOUS_TODO.md with starter tasks${NC}"
    fi
}

# Get the next uncompleted task
get_next_task() {
    grep -m 1 "^- \[ \]" "$TODO_FILE" 2>/dev/null | sed 's/^- \[ \] //'
}

# Mark a task as complete
complete_task() {
    local task="$1"
    local escaped_task=$(echo "$task" | sed 's/[[\.*^$()+?{|]/\\&/g')
    sed -i '' "s/^- \[ \] ${escaped_task}/- [x] ${escaped_task}/" "$TODO_FILE" 2>/dev/null || \
    sed -i "s/^- \[ \] ${escaped_task}/- [x] ${escaped_task}/" "$TODO_FILE"
}

# Add session note
add_note() {
    local note="$1"
    echo "- [$(date '+%Y-%m-%d %H:%M')] $note" >> "$TODO_FILE"
}

# Run Aider for a specific task
run_aider_task() {
    local task="$1"
    local iteration="$2"

    log "${GREEN}Executing: $task${NC}"

    cd "$PROJECT_DIR"

    # Build the focused prompt
    local prompt="You are working on FireLater, an ITSM SaaS platform.

CURRENT TASK: $task

INSTRUCTIONS:
1. Read relevant files to understand the current state
2. Implement the necessary changes to complete this task
3. Follow existing code patterns (check similar files)
4. No emojis in code or UI
5. TypeScript strict mode
6. Make focused, minimal changes
7. If you discover related issues, note them but stay focused on current task

PROJECT CONTEXT:
- Backend: Node.js + Fastify + PostgreSQL at /backend
- Frontend: Next.js 15 + Tailwind at /frontend
- Multi-tenant architecture with schema-per-tenant

EXECUTE THIS TASK NOW. Make the necessary code changes."

    # Run Aider
    timeout 600 "$AIDER_CMD" \
        --model ollama/qwen3-coder:480b-cloud \
        --yes \
        --auto-commits \
        --no-suggest-shell-commands \
        --message "$prompt" \
        2>&1 | tee -a "$LOG_FILE"

    return ${PIPESTATUS[0]}
}

# Analysis phase - find new tasks
run_analysis() {
    log "${YELLOW}Running codebase analysis to find improvements...${NC}"

    cd "$PROJECT_DIR"

    local prompt="You are auditing FireLater, an ITSM SaaS platform.

MISSION: Analyze this codebase and identify issues that need fixing.

ANALYZE FOR:
1. Security vulnerabilities (auth, injection, XSS)
2. Missing error handling
3. Performance issues
4. Missing tests
5. Code quality problems
6. Production readiness gaps

OUTPUT FORMAT - Add new tasks to AUTONOMOUS_TODO.md:
For each issue found, add a line like:
- [ ] CATEGORY: Brief description of issue and fix needed

Categories: SECURITY, BUG, PERF, TEST, STABILITY, UX, DOCS, REFACTOR

Read key files: README.md, backend/src/routes/*.ts, frontend/src/app/**/*.tsx

Add 3-5 high-priority tasks to AUTONOMOUS_TODO.md under '## Priority Queue'.
Focus on actionable, specific tasks."

    timeout 600 "$AIDER_CMD" \
        --model ollama/qwen3-coder:480b-cloud \
        --yes \
        --auto-commits \
        --no-suggest-shell-commands \
        --file AUTONOMOUS_TODO.md \
        --message "$prompt" \
        2>&1 | tee -a "$LOG_FILE"
}

# Main loop
main() {
    echo ""
    log "${GREEN}========================================${NC}"
    log "${GREEN}  FireLater Autonomous Development     ${NC}"
    log "${GREEN}  Model: qwen3-coder:480b-cloud        ${NC}"
    log "${GREEN}========================================${NC}"
    echo ""

    init_todo

    while true; do
        ITERATION=$((ITERATION + 1))
        log "${YELLOW}=== Iteration $ITERATION ===${NC}"

        # Get next task
        local task=$(get_next_task)

        if [ -z "$task" ]; then
            log "${YELLOW}No pending tasks. Running analysis to find new work...${NC}"
            run_analysis
            sleep 5
            continue
        fi

        # Execute the task
        run_aider_task "$task" "$ITERATION"
        local result=$?

        if [ $result -eq 0 ]; then
            complete_task "$task"
            add_note "Completed: $task"
            log "${GREEN}Task completed successfully${NC}"
        else
            log "${RED}Task may have failed (exit code: $result)${NC}"
            add_note "ISSUE: $task - needs review"
        fi

        # Brief pause to respect rate limits
        log "Pausing 10 seconds before next iteration..."
        sleep 10
    done
}

# Handle interrupts
cleanup() {
    log "${RED}Stopping autonomous development...${NC}"
    add_note "Session ended by user"
    exit 0
}
trap cleanup INT TERM

# Verify aider is installed
if [ ! -f "$AIDER_CMD" ]; then
    echo -e "${RED}Aider not found at $AIDER_CMD${NC}"
    echo "Install with: pipx install aider-chat"
    exit 1
fi

# Verify model is available
if ! ollama list | grep -q "qwen3-coder:480b-cloud"; then
    echo -e "${RED}Model qwen3-coder:480b-cloud not found${NC}"
    echo "Pull with: ollama pull qwen3-coder:480b-cloud"
    exit 1
fi

# Run
main
