#!/bin/sh
set -eu

# Read-only deployment check. Run from the repository root on the cloud VM.
CADDY_CONTAINER="${CADDY_CONTAINER:-minute_caddy}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
API_DOMAIN="${API_DOMAIN:-thienlong-api.duckdns.org}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

backend_id="$(compose ps -q backend)"
if [ -z "$backend_id" ]; then
  echo "ERROR: backend container is not running."
  echo "Run: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --build --wait"
  exit 1
fi

caddy_networks="$(docker inspect "$CADDY_CONTAINER" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}')"
backend_networks="$(docker inspect "$backend_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}')"

echo "Caddy networks:   $caddy_networks"
echo "Backend networks: $backend_networks"

shared_network=""
for caddy_network in $caddy_networks; do
  for backend_network in $backend_networks; do
    if [ "$caddy_network" = "$backend_network" ]; then
      shared_network="$caddy_network"
      break 2
    fi
  done
done

if [ -z "$shared_network" ]; then
  echo "ERROR: $CADDY_CONTAINER and backend do not share a Docker network."
  echo "Set CADDY_NETWORK in $ENV_FILE to one of: $caddy_networks"
  echo "Then recreate backend with the Compose command above."
  exit 1
fi

echo "Shared network: $shared_network"
echo "Backend health through Docker DNS:"
docker exec "$CADDY_CONTAINER" wget -qO- http://thienlong-api:8000/health
echo

echo "Public health:"
curl -fsS "https://$API_DOMAIN/health"
echo
curl -fsS "https://$API_DOMAIN/health/ready"
echo
echo "Cloud connectivity is ready."
