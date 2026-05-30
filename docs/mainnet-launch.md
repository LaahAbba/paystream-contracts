# Mainnet Launch Checklist

Complete every item and obtain sign-off before deploying PayStream to Stellar mainnet.
Reference the detailed runbook at [docs/runbooks/mainnet-deploy.md](runbooks/mainnet-deploy.md).

---

## 1. Security Audit

- [x] Trail of Bits audit completed (April 2026) — see [audits/2026-04-trail-of-bits.md](../audits/2026-04-trail-of-bits.md)
- [x] HIGH-01 resolved: employer identity check in `top_up`
- [x] MED-01 resolved: overflow protection in `claimable_amount`
- [x] MED-02 resolved: dual-transfer reentrancy documented
- [ ] **LOW-02 resolved: `initialize` re-call guard** ← **BLOCKING** (see [audits/remediation.md](../audits/remediation.md))
- [ ] Final audit sign-off obtained from security team
- [ ] No critical or high findings open

## 2. Test Coverage

- [ ] Line coverage ≥ 90% (`cargo llvm-cov --all-features`)
- [ ] All existing tests pass on `main` branch: `make test`
- [ ] Fuzz targets run for ≥ 24 hours without new findings
- [ ] Property-based tests pass (`prop_tests.rs`)
- [ ] Auth and multisig tests pass (`auth_tests.rs`, `multisig_tests.rs`)
- [ ] Coverage threshold enforced in CI (fails build if < 90%)

## 3. Load Testing

- [ ] Batch stream creation tested with N = 50, 100, 200 streams per transaction
- [ ] Sustained withdraw throughput tested (100 concurrent employees)
- [ ] Gas/fee benchmarks recorded — see [benchmarks/gas-optimization-report.md](../benchmarks/gas-optimization-report.md)
- [ ] No resource-limit panics observed under peak load
- [ ] Ledger entry TTL extension verified under high-volume scenarios

## 4. Disaster Recovery (DR) Runbook

- [ ] DR runbook reviewed and up to date — see [docs/runbooks/mainnet-deploy.md § Rollback](runbooks/mainnet-deploy.md)
- [ ] Rollback WASM (previous known-good build) uploaded to network in advance
- [ ] `pause_contract` / `unpause_contract` flow tested on testnet
- [ ] `upgrade` flow tested on testnet with a dummy WASM hash
- [ ] On-call rotation defined; escalation contacts documented
- [ ] Incident response runbook linked in team wiki

## 5. Legal & Compliance

- [ ] Legal review of token streaming model completed
- [ ] Terms of service and privacy policy published
- [ ] Jurisdiction-specific restrictions identified and documented
- [ ] KYC/AML requirements assessed (if applicable)
- [ ] Open-source license (Apache 2.0) confirmed for all dependencies: `make license-check`
- [ ] SECURITY.md up to date with responsible disclosure contact

## 6. Infrastructure & Operations

- [ ] Admin key is a hardware wallet or multisig — **never a hot key**
- [ ] Admin key has ≥ 10 XLM for deployment fees
- [ ] `STELLAR_ADMIN_ADDRESS` set and verified
- [ ] Testnet end-to-end deployment completed successfully
- [ ] Monitoring and alerting configured (event indexer, error rates, notification service)
- [ ] Codecov badge reflects ≥ 90% coverage on `main`
- [ ] All CI jobs green on the release commit

## 7. Frontend & SDK

- [ ] Demo UI points to mainnet contract addresses
- [ ] USDC mainnet address configured (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`)
- [ ] SDK published to npm with correct mainnet defaults
- [ ] Contextual help tooltips and help center links present in UI (issue #342)
- [ ] Stream templates feature working in production build (issue #341)

## 8. Documentation

- [ ] [docs/api-reference.md](api-reference.md) reflects final contract interface
- [ ] [docs/quickstart.md](quickstart.md) tested end-to-end by a new developer
- [ ] CHANGELOG.md updated for the release version
- [ ] All ADRs up to date

## 9. Deployment Execution

- [ ] Release commit tagged: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] WASM SHA256 hashes recorded for both contracts
- [ ] Token contract deployed and initialized
- [ ] Stream contract deployed and initialized
- [ ] Post-deploy smoke test passed (create → withdraw → cancel)
- [ ] Contract IDs recorded in team deployment log

---

## Sign-Off

| Role | Name | Date |
|---|---|---|
| Lead Engineer | | |
| Security | | |
| Legal / Compliance | | |
| Product | | |

> **Mainnet is blocked until LOW-02 is resolved and all items above are checked.**
