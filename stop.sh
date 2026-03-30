#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────────
# Nester Agent Platform — Stop all servers
#
# Usage: ./stop.sh
# ────────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${DIM}→${NC} $1"; }

echo ""
echo -e "${BOLD}${CYAN}  Nester Agent Platform — Stopping...${NC}"
echo ""

stopped=0

# ── Stop via PID files ───────────────────────────────────────────────────────

if [ -f /tmp/nester-backend.pid ]; then
    pid=$(cat /tmp/nester-backend.pid)
    if kill "$pid" 2>/dev/null; then
        ok "Backend stopped (PID $pid)"
        stopped=$((stopped + 1))
    fi
    rm -f /tmp/nester-backend.pid
fi

if [ -f /tmp/nester-frontend.pid ]; then
    pid=$(cat /tmp/nester-frontend.pid)
    if kill "$pid" 2>/dev/null; then
        ok "Frontend stopped (PID $pid)"
        stopped=$((stopped + 1))
    fi
    rm -f /tmp/nester-frontend.pid
fi

if [ -f /tmp/nester-linkedin-mcp.pid ]; then
    pid=$(cat /tmp/nester-linkedin-mcp.pid)
    if kill "$pid" 2>/dev/null; then
        ok "LinkedIn MCP stopped (PID $pid)"
        stopped=$((stopped + 1))
    fi
    rm -f /tmp/nester-linkedin-mcp.pid
fi

if [ -f /tmp/nester-search-mcp.pid ]; then
    pid=$(cat /tmp/nester-search-mcp.pid)
    if kill "$pid" 2>/dev/null; then
        ok "Search MCP stopped (PID $pid)"
        stopped=$((stopped + 1))
    fi
    rm -f /tmp/nester-search-mcp.pid
fi

if [ -f /tmp/nester-scraper-mcp.pid ]; then
    pid=$(cat /tmp/nester-scraper-mcp.pid)
    if kill "$pid" 2>/dev/null; then
        ok "Web Scraper MCP stopped (PID $pid)"
        stopped=$((stopped + 1))
    fi
    rm -f /tmp/nester-scraper-mcp.pid
fi

# ── Kill anything still on our ports ─────────────────────────────────────────

for port in 8000 8001 8102 8105 3000; do
    port_pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$port_pids" ]; then
        echo "$port_pids" | xargs kill 2>/dev/null || true
        ok "Killed processes on port $port"
        stopped=$((stopped + 1))
    fi
done

# ── Done ─────────────────────────────────────────────────────────────────────

if [ "$stopped" -eq 0 ]; then
    info "No running Nester servers found"
else
    echo ""
    echo -e "  ${GREEN}All servers stopped.${NC}"
fi

echo ""
