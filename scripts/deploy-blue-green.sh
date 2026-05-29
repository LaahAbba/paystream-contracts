#!/usr/bin/env bash
# deploy-blue-green.sh — zero-downtime blue-green deployment for the PayStream API.
#
# Usage:
#   ./scripts/deploy-blue-green.sh <blue|green> <image_tag>
#
# Required environment variables:
#   HEALTH_URL   — base URL of the inactive slot, e.g. http://green.internal:3000
#   LB_TARGET    — load-balancer target group ARN or nginx upstream name to switch
#
# The script:
#   1. Deploys the new image to the inactive slot.
#   2. Runs a health check against the inactive slot.
#   3. Switches load-balancer traffic to the new slot on success.
#   4. Prints rollback instructions on failure.
set -euo pipefail

SLOT="${1:?Usage: $0 <blue|green> <image_tag>}"
IMAGE_TAG="${2:?Usage: $0 <blue|green> <image_tag>}"
HEALTH_URL="${HEALTH_URL:?HEALTH_URL must be set}"
HEALTH_RETRIES="${HEALTH_RETRIES:-10}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"

if [[ "$SLOT" != "blue" && "$SLOT" != "green" ]]; then
  echo "ERROR: slot must be 'blue' or 'green'" >&2
  exit 1
fi

echo "==> Deploying image '${IMAGE_TAG}' to slot '${SLOT}'"

# ---------------------------------------------------------------------------
# Step 1: deploy to the inactive slot
# Replace this block with your actual deployment command, e.g.:
#   docker service update --image "paystream-api:${IMAGE_TAG}" "paystream-${SLOT}"
#   kubectl set image deployment/paystream-${SLOT} api=paystream-api:${IMAGE_TAG}
# ---------------------------------------------------------------------------
echo "    Updating ${SLOT} slot with image ${IMAGE_TAG}..."
# <your deploy command here>

# ---------------------------------------------------------------------------
# Step 2: health check
# ---------------------------------------------------------------------------
echo "==> Running health check against ${HEALTH_URL}/health"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${HEALTH_URL}/health" || true)
  if [[ "$STATUS" == "200" ]]; then
    echo "    Health check passed (attempt ${i})"
    break
  fi
  echo "    Attempt ${i}/${HEALTH_RETRIES}: got HTTP ${STATUS}, retrying in ${HEALTH_INTERVAL}s..."
  if [[ "$i" -eq "$HEALTH_RETRIES" ]]; then
    echo "ERROR: health check failed after ${HEALTH_RETRIES} attempts. Aborting." >&2
    echo "Rollback: re-run this script with the previous image tag targeting the same slot," >&2
    echo "          or switch the load balancer back to the previous slot manually." >&2
    exit 1
  fi
  sleep "$HEALTH_INTERVAL"
done

# ---------------------------------------------------------------------------
# Step 3: switch traffic
# Replace this block with your actual load-balancer switch command, e.g.:
#   aws elbv2 modify-listener --listener-arn "$LB_TARGET" \
#     --default-actions Type=forward,TargetGroupArn="$SLOT_TARGET_GROUP_ARN"
#   nginx -s reload  (after updating upstream config)
# ---------------------------------------------------------------------------
echo "==> Switching load-balancer traffic to slot '${SLOT}'"
# <your lb switch command here>

echo "==> Deployment complete. Active slot: ${SLOT}"
echo "    To roll back: switch the load balancer back to the previous slot."
