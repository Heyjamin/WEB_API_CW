#!/bin/sh
set -e
DB_PATH="${DATABASE_PATH:-./data/slsea.sqlite}"

if [ ! -f "$DB_PATH" ]; then
  echo "No database at $DB_PATH — running migrate + seed..."
  node src/db/migrate.js
  node src/db/seed.js
elif [ "${FORCE_SEED}" = "true" ]; then
  echo "FORCE_SEED=true — re-migrating and reseeding $DB_PATH..."
  node src/db/migrate.js
  node src/db/seed.js
fi

exec "$@"
