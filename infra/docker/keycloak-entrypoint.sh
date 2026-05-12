#!/bin/bash
set -e

# Execute Keycloak start command
exec /opt/keycloak/bin/kc.sh start --optimized "$@"
