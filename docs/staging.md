# Staging Environment

PayStream maintains a persistent staging deployment on Stellar testnet for integration testing and demos. Staging uses independent testnet contracts and can be configured with separate staging database and Redis instances to mirror production while isolating pre-release traffic.

## Contract IDs

Staging contracts are redeployed automatically on every merge to `develop`. The latest IDs appear in the [Deploy Staging workflow summary](../../actions/workflows/staging.yml).

| Contract | Network  |
|----------|----------|
| Token    | Testnet  |
| Stream   | Testnet  |

## Required Repository Secrets

Staging access is restricted through the GitHub `staging` environment and team-level secret permissions.

Configure these in **Settings → Secrets and variables → Actions** under the `staging` environment:

| Secret | Description |
|--------|-------------|
| `STAGING_DEPLOYER_SECRET` | Secret key of the Stellar account that pays deploy fees |
| `STAGING_ADMIN_ADDRESS` | Public key set as contract admin on initialisation |

## Auto-Redeploy on Main Merge

The [`.github/workflows/staging.yml`](../../.github/workflows/staging.yml) workflow triggers on every push to `main` and:

1. Builds WASM contracts
2. Deploys fresh token and stream contracts to Stellar testnet
3. Initialises both contracts with `STAGING_ADMIN_ADDRESS`
4. Runs a smoke test (`stream_count` returns 0)
5. Prints the new contract IDs to the workflow summary

## Manual Redeploy

Trigger a manual redeploy from the Actions tab:

1. Go to **Actions → Deploy Staging**
2. Click **Run workflow** → **Run workflow**

## Funding the Deployer Account

The staging deployer account must hold XLM to pay transaction fees. Fund it via [Stellar Friendbot](https://friendbot.stellar.org/?addr=<DEPLOYER_PUBLIC_KEY>) or the Stellar CLI:

```bash
stellar keys fund <DEPLOYER_PUBLIC_KEY> --network testnet
```
