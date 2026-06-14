#!/usr/bin/env bash
# deploy/redeploy.sh — Rebuild and restart Ledger after a code change
#
# Usage (run from the repo root):
#   sudo deploy/redeploy.sh

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

info()    { echo -e "${CYAN}[ledger]${NC} $*"; }
success() { echo -e "${GREEN}[ledger]${NC} $*"; }
die()     { echo -e "${RED}[ledger] ERROR:${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "This script must be run as root (sudo deploy/redeploy.sh)."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

[[ -f "$ENV_FILE" ]] || die ".env not found at $PROJECT_DIR. Run deploy/setup.sh first."

info "Rebuilding Docker image…"
docker compose -f "$PROJECT_DIR/docker-compose.yml" --env-file "$ENV_FILE" build

info "Restarting service…"
docker compose -f "$PROJECT_DIR/docker-compose.yml" --env-file "$ENV_FILE" down --remove-orphans || true
# Remove container if it was started outside compose (blocks compose up).
docker rm -f ledger 2>/dev/null || true
docker compose -f "$PROJECT_DIR/docker-compose.yml" --env-file "$ENV_FILE" up -d --no-build --force-recreate
systemctl reset-failed ledger 2>/dev/null || true

success "Ledger redeployed successfully."
