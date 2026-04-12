#!/usr/bin/env bash
# deploy/backup.sh — Daily SQLite backup for Ledger
#
# Uses SQLite's built-in backup API (safe for live databases) to snapshot
# the database and rotate old backups.
#
# Backups are written to BACKUP_DIR (default: /var/backups/ledger).
# Keeps the last KEEP_DAYS daily backups (default: 7).
#
# Usage (run as root or a user with access to the Docker volume):
#   deploy/backup.sh [--backup-dir /path/to/dir] [--keep-days N]
#
# This script is normally invoked by the ledger-backup.timer systemd unit
# installed by deploy/setup.sh.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

BACKUP_DIR="/var/backups/ledger"
KEEP_DAYS=7
DB_PATH="/var/lib/docker/volumes/ledger_ledger_data/_data/ledger.db"

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --keep-days)  KEEP_DAYS="$2";  shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[ledger-backup]${NC} $*"; }
success() { echo -e "${GREEN}[ledger-backup]${NC} $*"; }
die()     { echo -e "${RED}[ledger-backup] ERROR:${NC} $*" >&2; exit 1; }

# ── Checks ────────────────────────────────────────────────────────────────────

command -v sqlite3 &>/dev/null || die "'sqlite3' is not installed. Run: apt-get install sqlite3"

[[ -f "$DB_PATH" ]] || die "Database not found at $DB_PATH. Is the ledger container running?"

# ── Backup ────────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DEST="$BACKUP_DIR/ledger-${TIMESTAMP}.db"

info "Backing up $DB_PATH → $DEST"

# sqlite3 .backup uses the SQLite Online Backup API — safe for live databases.
sqlite3 "$DB_PATH" ".backup '$DEST'"

chmod 600 "$DEST"
success "Backup complete: $DEST ($(du -sh "$DEST" | cut -f1))"

# ── Rotation ──────────────────────────────────────────────────────────────────

info "Removing backups older than ${KEEP_DAYS} days…"
find "$BACKUP_DIR" -name "ledger-*.db" -mtime +"$KEEP_DAYS" -print -delete
success "Rotation done. Current backups:"
ls -lh "$BACKUP_DIR"/ledger-*.db 2>/dev/null || true
