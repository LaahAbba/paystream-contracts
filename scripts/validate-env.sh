#!/usr/bin/env bash
# validate-env.sh – Validate required environment variables before running
# PayStream scripts.  Source this file or run it directly.
#
# Usage:
#   source scripts/validate-env.sh          # in another script
#   ./scripts/validate-env.sh               # standalone check
#
# Exit codes:
#   0 – all required vars present and valid
#   1 – one or more vars missing or invalid

set -euo pipefail

ERRORS=()
WARNINGS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

require_var() {
    local name="$1"
    local value="${!name:-}"
    if [[ -z "$value" ]]; then
        ERRORS+=("MISSING: $name is required but not set")
    fi
}

validate_stellar_address() {
    local name="$1"
    local value="${!name:-}"
    if [[ -n "$value" ]] && ! [[ "$value" =~ ^G[A-Z2-7]{55}$ ]]; then
        ERRORS+=("INVALID: $name must be a valid Stellar public key (G...56 chars), got: $value")
    fi
}

validate_contract_id() {
    local name="$1"
    local value="${!name:-}"
    if [[ -n "$value" ]] && ! [[ "$value" =~ ^C[A-Z2-7]{55}$ ]]; then
        ERRORS+=("INVALID: $name must be a valid Soroban contract ID (C...56 chars), got: $value")
    fi
}

validate_positive_integer() {
    local name="$1"
    local value="${!name:-}"
    if [[ -n "$value" ]] && ! [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
        ERRORS+=("INVALID: $name must be a positive integer, got: $value")
    fi
}

validate_network() {
    local value="${NETWORK:-}"
    if [[ -n "$value" ]] && ! [[ "$value" =~ ^(testnet|mainnet|local)$ ]]; then
        ERRORS+=("INVALID: NETWORK must be one of: testnet, mainnet, local — got: $value")
    fi
}

warn_deprecated() {
    local name="$1"
    local replacement="$2"
    if [[ -n "${!name:-}" ]]; then
        WARNINGS+=("DEPRECATED: $name is deprecated; use $replacement instead")
    fi
}

# ---------------------------------------------------------------------------
# Validations
# ---------------------------------------------------------------------------

require_var NETWORK
validate_network

require_var STELLAR_SOURCE_ACCOUNT
require_var STELLAR_ADMIN_ADDRESS
validate_stellar_address STELLAR_ADMIN_ADDRESS

require_var TOKEN_CONTRACT_ID
validate_contract_id TOKEN_CONTRACT_ID

require_var STREAM_CONTRACT_ID
validate_contract_id STREAM_CONTRACT_ID

validate_positive_integer INITIAL_SUPPLY

# Deprecated variable warnings
warn_deprecated SOURCE_ACCOUNT "STELLAR_SOURCE_ACCOUNT"

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo "⚠️  Warnings:" >&2
    for w in "${WARNINGS[@]}"; do
        echo "   $w" >&2
    done
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo "❌ Environment validation failed:" >&2
    for e in "${ERRORS[@]}"; do
        echo "   $e" >&2
    done
    echo "" >&2
    echo "Copy .env.example to .env and fill in the required values." >&2
    exit 1
fi

echo "✅ Environment variables validated successfully."
