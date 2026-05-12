#!/bin/bash
set -e

echo "Starting Keycloak..."

# Force rebuild if KC_DB is set and differs from what was built
if [ -n "$KC_DB" ]; then
  echo "Detected KC_DB=$KC_DB, forcing rebuild..."
  /opt/keycloak/bin/kc.sh build
fi

# Start Keycloak with optimized flag
exec /opt/keycloak/bin/kc.sh start --optimized "$@"
