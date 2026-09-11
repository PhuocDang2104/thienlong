#!/usr/bin/env bash
# Run from cron on the VNPT host. Uses the existing production Compose project.
set -euo pipefail
umask 077
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${BACKUP_DIR:-$repo_dir/backups}"
mkdir -p -- "$backup_dir"
backup_file="$backup_dir/thienlong-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose=(docker compose --env-file "$repo_dir/.env" -f "$repo_dir/deploy/docker-compose.yml")
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_file.partial"
test -s "$backup_file.partial"
mv -- "$backup_file.partial" "$backup_file"
printf 'Backup saved: %s\n' "$backup_file"
# Retention is deliberately operator-managed; copy encrypted backups off-host.
