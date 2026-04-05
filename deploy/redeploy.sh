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
systemctl restart ledger

success "Ledger redeployed successfully."
