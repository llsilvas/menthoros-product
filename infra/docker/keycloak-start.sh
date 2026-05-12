#!/bin/bash
set -e

echo "Starting Keycloak in production mode..."
echo "Database: $KC_DB_URL"
echo "Hostname: $KC_HOSTNAME"

# Execute Keycloak com modo production
exec /opt/keycloak/bin/kc.sh start \
    --db=postgres \
    --db-url="$KC_DB_URL" \
    --db-username="$KC_DB_USERNAME" \
    --db-password="$KC_DB_PASSWORD" \
    --hostname="$KC_HOSTNAME" \
    --proxy=edge \
    --health-enabled=true \
    --metrics-enabled=true \
    --bootstrap-admin-username="$KC_BOOTSTRAP_ADMIN_USERNAME" \
    --bootstrap-admin-password="$KC_BOOTSTRAP_ADMIN_PASSWORD"
