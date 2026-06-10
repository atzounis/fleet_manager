#!/usr/bin/env bash
# Sync Fleet Manager to a Raspberry Pi and start the SQLite-based Docker stack.
#
# Usage:
#   ./scripts/deploy-rpi.sh
#   RPI_USER=antonis ./scripts/deploy-rpi.sh
#   RPI_HOST=192.168.2.200 REMOTE_DIR=fleet_manager ./scripts/deploy-rpi.sh
#
# Prerequisites on the Pi: Docker Engine + Docker Compose plugin, SSH access.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RPI_HOST="${RPI_HOST:-192.168.2.200}"
RPI_USER="${RPI_USER:-pi}"
REMOTE_DIR="${REMOTE_DIR:-fleet_manager}"
SSH_TARGET="${RPI_USER}@${RPI_HOST}"

RSYNC_EXCLUDES=(
  --exclude '.git/'
  --exclude 'venv/'
  --exclude '.venv/'
  --exclude 'node_modules/'
  --exclude '__pycache__/'
  --exclude '*.pyc'
  --exclude '.env'
  --exclude 'db.sqlite3'
  --exclude 'deploy/.env'
  --exclude 'deploy/data/'
  --exclude 'staticfiles/'
  --exclude 'firmware/examples/arduino/**/build/'
  --exclude '**/secrets.h'
)

echo "==> Syncing repository to ${SSH_TARGET}:~/${REMOTE_DIR}/"
rsync -avz --delete "${RSYNC_EXCLUDES[@]}" \
  "${REPO_ROOT}/" "${SSH_TARGET}:~/${REMOTE_DIR}/"

echo "==> Preparing remote environment"
ssh "$SSH_TARGET" bash -s -- "$REMOTE_DIR" "$RPI_HOST" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
RPI_HOST="$2"
cd ~/"${REMOTE_DIR}"

mkdir -p deploy/data

if [[ ! -f deploy/.env ]]; then
  cp deploy/env.rpi.example deploy/.env
  echo "Created deploy/.env from env.rpi.example"
fi

# Keep ALLOWED_HOSTS and OTA public URL aligned with RPI_HOST when still at defaults.
if grep -q '192.168.2.200' deploy/.env; then
  sed -i.bak \
    -e "s/ALLOWED_HOSTS=.*/ALLOWED_HOSTS=${RPI_HOST},localhost,127.0.0.1,web/" \
    -e "s|AWS_S3_PUBLIC_ENDPOINT_URL=.*|AWS_S3_PUBLIC_ENDPOINT_URL=http://${RPI_HOST}:9000|" \
    deploy/.env
  rm -f deploy/.env.bak
fi
REMOTE

echo "==> Building and starting containers on the Pi"
ssh "$SSH_TARGET" bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
cd ~/"${REMOTE_DIR}/deploy"
docker compose --env-file .env up --build -d
docker compose ps
REMOTE

cat <<EOF

Deploy complete.

  Dashboard:  http://${RPI_HOST}:61294
  Agent API:  http://${RPI_HOST}:52841/api/v1/agent/
  MinIO API:  http://${RPI_HOST}:9000  (OTA downloads; set AWS_S3_PUBLIC_ENDPOINT_URL in deploy/.env)

SQLite database on the Pi: ~/${REMOTE_DIR}/deploy/data/db.sqlite3

Next steps on the Pi:
  ssh ${SSH_TARGET}
  cd ~/${REMOTE_DIR}/deploy
  docker compose exec web python manage.py createsuperuser
  docker compose logs -f web

Point devices at FLEET_API_HOST "${RPI_HOST}" (port 52841) in secrets.h.
EOF
