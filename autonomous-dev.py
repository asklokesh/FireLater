#!/usr/bin/env python3
"""
Autonomous Development Agent for FireLater
Uses Ollama Cloud (qwen3-coder:480b) directly via REST API
"""

import os
import sys
import json
import time
import subprocess
import urllib.request
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path("/Users/lokesh/git/firelater")
TODO_FILE = PROJECT_DIR / "AUTONOMOUS_TODO.md"
LOG_FILE = PROJECT_DIR / ".autonomous-dev.log"
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3-coder:480b-cloud"

def log(msg: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def read_file(path: str) -> str:
    try:
        full_path = PROJECT_DIR / path if not path.startswith("/") else Path(path)
        return full_path.read_text()
    except Exception as e:
        return f"Error reading {path}: {e}"

def write_file(path: str, content: str):
    full_path = PROJECT_DIR / path if not path.startswith("/") else Path(path)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content)
    log(f"Wrote: {path}")

def git_commit(message: str):
    try:
        subprocess.run(["git", "add", "-A"], cwd=PROJECT_DIR, capture_output=True)
        result = subprocess.run(["git", "commit", "-m", message], cwd=PROJECT_DIR, capture_output=True)
        if result.returncode == 0:
            log(f"Committed: {message}")
        else:
            log("No changes to commit")
    except Exception as e:
        log(f"Commit error: {e}")

def call_llm(messages: list) -> str:
    """Call Ollama API with the given messages"""
    payload = json.dumps({
        "model": MODEL,
        "messages": messages,
        "stream": False
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=payload,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            content = result.get('message', {}).get('content', '')
            return content
    except Exception as e:
        log(f"LLM Error: {e}")
        return f"ERROR: {e}"

def init_todo():
    if not TODO_FILE.exists():
        TODO_FILE.write_text("""# FireLater Autonomous Development

## Priority Queue
- [ ] AUDIT: Security audit of authentication flow in backend/src/routes/auth.ts
- [ ] AUDIT: Check SQL injection vulnerabilities in database queries
- [ ] AUDIT: Review error handling across API endpoints
- [ ] STABILITY: Add input validation to all API endpoints
- [ ] TEST: Add unit tests for critical business logic
- [ ] PERF: Optimize slow database queries
- [ ] SECURITY: Implement rate limiting
- [ ] UX: Improve error messages
- [ ] DOCS: Update API documentation
- [ ] PROD: Review production configuration

## Completed

## Session Log

""")
        log("Initialized TODO file")

def get_next_task() -> str:
    content = TODO_FILE.read_text()
    for line in content.split("\n"):
        if line.strip().startswith("- [ ]"):
            return line.strip()[6:].strip()
    return ""

def mark_task_complete(task: str):
    content = TODO_FILE.read_text()
    content = content.replace(f"- [ ] {task}", f"- [x] {task}")
    TODO_FILE.write_text(content)

def add_session_note(note: str):
    content = TODO_FILE.read_text()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    note_line = f"- [{timestamp}] {note}\n"

    if "## Session Log" in content:
        parts = content.split("## Session Log")
        content = parts[0] + "## Session Log\n" + note_line + parts[1].lstrip("\n")

    TODO_FILE.write_text(content)

def get_file_list() -> list:
    """Get list of important project files"""
    files = []

    # Backend routes
    routes_dir = PROJECT_DIR / "backend" / "src" / "routes"
    if routes_dir.exists():
        files.extend([str(f.relative_to(PROJECT_DIR)) for f in routes_dir.glob("*.ts")][:10])

    # Backend services
    services_dir = PROJECT_DIR / "backend" / "src" / "services"
    if services_dir.exists():
        files.extend([str(f.relative_to(PROJECT_DIR)) for f in services_dir.glob("*.ts")][:10])

    # Frontend pages
    pages_dir = PROJECT_DIR / "frontend" / "src" / "app"
    if pages_dir.exists():
        files.extend([str(f.relative_to(PROJECT_DIR)) for f in pages_dir.rglob("page.tsx")][:10])

    return files

def execute_task(task: str):
    """Execute a single task using the LLM"""
    log(f"Executing: {task}")

    # Read project context
    readme = read_file("README.md")[:3000]

    # Determine relevant files based on task keywords
    relevant_files = []
    task_lower = task.lower()

    if "auth" in task_lower:
        for f in ["backend/src/routes/auth.ts", "backend/src/middleware/auth.ts", "backend/src/services/auth.service.ts"]:
            if (PROJECT_DIR / f).exists():
                relevant_files.append(f)

    if "sql" in task_lower or "database" in task_lower or "query" in task_lower:
        services_dir = PROJECT_DIR / "backend" / "src" / "services"
        if services_dir.exists():
            relevant_files.extend([str(f.relative_to(PROJECT_DIR)) for f in services_dir.glob("*.ts")][:5])

    if "api" in task_lower or "endpoint" in task_lower or "error" in task_lower:
        routes_dir = PROJECT_DIR / "backend" / "src" / "routes"
        if routes_dir.exists():
            relevant_files.extend([str(f.relative_to(PROJECT_DIR)) for f in routes_dir.glob("*.ts")][:5])

    if "validation" in task_lower or "input" in task_lower:
        for d in ["backend/src/routes", "backend/src/schemas"]:
            dir_path = PROJECT_DIR / d
            if dir_path.exists():
                relevant_files.extend([str(f.relative_to(PROJECT_DIR)) for f in dir_path.glob("*.ts")][:3])

    if "test" in task_lower:
        test_dir = PROJECT_DIR / "backend" / "src" / "tests"
        if test_dir.exists():
            relevant_files.extend([str(f.relative_to(PROJECT_DIR)) for f in test_dir.glob("*.ts")][:5])

    if "frontend" in task_lower or "ui" in task_lower or "ux" in task_lower:
        pages_dir = PROJECT_DIR / "frontend" / "src" / "app"
        if pages_dir.exists():
            relevant_files.extend([str(f.relative_to(PROJECT_DIR)) for f in pages_dir.rglob("page.tsx")][:5])

    # Default: grab some key files
    if not relevant_files:
        relevant_files = get_file_list()[:5]

    # Read file contents
    file_context = ""
    for f in relevant_files[:5]:  # Limit to 5 files
        content = read_file(f)
        if not content.startswith("Error"):
            file_context += f"\n\n=== {f} ===\n{content[:5000]}"

    messages = [
        {
            "role": "system",
            "content": """You are a senior software engineer working on FireLater, an ITSM SaaS platform.

Analyze code and provide specific, actionable fixes.

RESPONSE FORMAT:
1. Brief analysis (2-3 sentences)
2. For each file to modify:

FILE: path/to/file.ts
```typescript
// Show the specific function or section that needs to change
// Include enough context to locate it
```

RULES:
- Be concise and specific
- Follow existing code patterns
- No emojis
- TypeScript strict mode
- Only show changed code sections, not entire files"""
        },
        {
            "role": "user",
            "content": f"""TASK: {task}

PROJECT: FireLater - ITSM SaaS Platform
- Backend: Node.js + Fastify + PostgreSQL
- Frontend: Next.js 15 + Tailwind CSS
- Multi-tenant architecture

PROJECT README:
{readme}

RELEVANT CODE:
{file_context[:20000]}

Execute this task. Provide specific code changes."""
        }
    ]

    log("Calling LLM...")
    response = call_llm(messages)
    log(f"Got response ({len(response)} chars)")
    print("\n" + "="*50)
    print(response[:2000])  # Show first part of response
    print("="*50 + "\n")

    # Parse and apply changes
    changes_made = apply_changes(response)

    return changes_made

def apply_changes(response: str) -> bool:
    """Parse LLM response and apply file changes"""
    lines = response.split("\n")
    current_file = None
    current_content = []
    in_code_block = False
    changes_made = False

    for line in lines:
        if line.strip().startswith("FILE:"):
            # Save previous file if any
            if current_file and current_content:
                if save_file_changes(current_file, "\n".join(current_content)):
                    changes_made = True

            current_file = line.replace("FILE:", "").strip()
            current_content = []
            in_code_block = False
        elif line.startswith("```"):
            if in_code_block and current_file and current_content:
                if save_file_changes(current_file, "\n".join(current_content)):
                    changes_made = True
                current_content = []
            in_code_block = not in_code_block
        elif in_code_block and current_file:
            current_content.append(line)

    # Handle last file
    if current_file and current_content:
        if save_file_changes(current_file, "\n".join(current_content)):
            changes_made = True

    return changes_made

def save_file_changes(filepath: str, content: str) -> bool:
    """Save changes to a file"""
    if not content.strip():
        return False

    # Clean up filepath
    filepath = filepath.strip().strip("`").strip()
    if not filepath:
        return False

    full_path = PROJECT_DIR / filepath

    # Safety checks
    if len(content) < 20:
        log(f"Skipping {filepath} - content too small")
        return False

    # Check if it looks like a partial snippet vs full file
    if full_path.exists():
        existing = full_path.read_text()
        # If new content is much smaller, it's probably a snippet - skip
        if len(content) < len(existing) * 0.2 and len(existing) > 200:
            log(f"Skipping {filepath} - appears to be snippet, not full replacement")
            return False

    try:
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content)
        log(f"Updated: {filepath}")
        return True
    except Exception as e:
        log(f"Error writing {filepath}: {e}")
        return False

def run_analysis():
    """Analyze codebase and add new tasks"""
    log("Running codebase analysis to find new tasks...")

    # Get list of files to analyze
    files = get_file_list()[:10]
    file_summary = "\n".join(files)

    messages = [
        {
            "role": "system",
            "content": "You are a senior software engineer auditing a codebase. Be concise and specific."
        },
        {
            "role": "user",
            "content": f"""Analyze this ITSM SaaS project and identify 3-5 specific issues that need fixing.

PROJECT: FireLater
- Backend: Node.js + Fastify + PostgreSQL
- Frontend: Next.js 15 + Tailwind

KEY FILES:
{file_summary}

README:
{read_file('README.md')[:2000]}

Sample code from auth route:
{read_file('backend/src/routes/auth.ts')[:3000]}

Output exactly in this format, one per line:
- [ ] CATEGORY: Specific description of issue and file location

Categories: SECURITY, BUG, PERF, TEST, STABILITY, UX, DOCS, REFACTOR

Be specific about file paths and what needs to change."""
        }
    ]

    response = call_llm(messages)

    # Add new tasks to TODO
    content = TODO_FILE.read_text()
    added = 0
    for line in response.split("\n"):
        line = line.strip()
        if line.startswith("- [ ]"):
            if line not in content:
                content = content.replace("## Priority Queue\n", f"## Priority Queue\n{line}\n")
                added += 1

    if added > 0:
        TODO_FILE.write_text(content)
        log(f"Added {added} new tasks from analysis")
    else:
        log("No new tasks found in analysis")

def main():
    print()
    log("=" * 50)
    log("FireLater Autonomous Development Agent")
    log(f"Model: {MODEL}")
    log(f"Project: {PROJECT_DIR}")
    log("=" * 50)
    print()

    os.chdir(PROJECT_DIR)
    init_todo()

    iteration = 0
    consecutive_failures = 0
    max_failures = 3

    while True:
        iteration += 1
        log(f"--- Iteration {iteration} ---")

        task = get_next_task()

        if not task:
            log("No pending tasks. Running analysis...")
            run_analysis()
            time.sleep(10)
            continue

        try:
            changes_made = execute_task(task)
            mark_task_complete(task)
            add_session_note(f"Completed: {task}")

            if changes_made:
                git_commit(f"Auto: {task[:50]}")

            log(f"Task completed: {task}")
            consecutive_failures = 0

        except Exception as e:
            log(f"Error executing task: {e}")
            add_session_note(f"FAILED: {task} - {str(e)[:100]}")
            consecutive_failures += 1

            if consecutive_failures >= max_failures:
                log(f"Too many consecutive failures ({max_failures}). Pausing...")
                time.sleep(60)
                consecutive_failures = 0

        log("Pausing 15 seconds before next iteration...")
        time.sleep(15)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\nStopped by user")
        sys.exit(0)
