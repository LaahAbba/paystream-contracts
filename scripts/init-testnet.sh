#!/usr/bin/env bash
set -euo pipefail

# Validate required environment variables before proceeding
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/validate-env.sh"

NETWORK="testnet"
SOURCE="${STELLAR_SOURCE_ACCOUNT:-default}"
ADMIN="${STELLAR_ADMIN_ADDRESS:?Set STELLAR_ADMIN_ADDRESS}"
TOKEN_ID="${TOKEN_CONTRACT_ID:?Set TOKEN_CONTRACT_ID}"
STREAM_ID="${STREAM_CONTRACT_ID:?Set STREAM_CONTRACT_ID}"
INITIAL_SUPPLY="${INITIAL_SUPPLY:-1000000000}"

echo "Initialising PayStream contracts on testnet..."

stellar contract invoke --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" \
  -- initialize --admin "$ADMIN" --initial_supply "$INITIAL_SUPPLY"
echo "Token initialised."

stellar contract invoke --id "$STREAM_ID" --source "$SOURCE" --network "$NETWORK" \
  -- initialize --admin "$ADMIN"
echo "Stream contract initialised."

echo "Init complete."
