#!/bin/sh
set -eu
# Named / bind mounts hide image /data permissions; ensure the app user can write SQLite.
chown -R nextjs:nodejs /data
exec su-exec nextjs "$@"
