# PayStream Smart Contract Security Model

**Contract:** `contracts/stream` (Soroban / Stellar)  
**Issue:** [#325](https://github.com/Vera3289/paystream-contracts/issues/325)  
**Last updated:** 2026-05-29  
**Related docs:** [threat-model.md](security/threat-model.md) · [fund-lock-audit.md](security/fund-lock-audit.md) · [storage-audit.md](security/storage-audit.md)

---

## 1. Trust Model

### 1.1 Roles and Permissions

| Role | Who | What they can do |
|---|---|---|
| **Admin** | Single address set at `initialize` | Pause/unpause contract, set min deposit, set protocol fee, set stream limit, manage token allowlist, upgrade WASM, transfer admin role |
| **Employer** | Address that calls `create_stream` | Create/batch-create streams, top up, pause, resume, cancel, update rate, transfer stream ownership — **only on their own streams** |
| **Employee** | Address recorded in `stream.employee` | Withdraw earned tokens — **only from their own streams** |
| **Anyone** | Any address | Read stream state (`get_stream`, `claimable`, `stream_count`), participate in governance (propose, vote) |

Every state-mutating function calls `require_auth()` on the acting address before any state change. Role membership is verified against on-chain storage — there is no off-chain session or API key involved.

### 1.2 What Each Role Cannot Do

| Role | Explicitly blocked |
|---|---|
| Employer | Cannot withdraw employee earnings (`require_employee` check) |
| Employee | Cannot cancel, pause, or top up a stream (`require_employer` check) |
| Employer | Cannot act on another employer's streams (stream ownership checked per-stream) |
| Admin | Cannot withdraw stream funds directly; admin powers are limited to protocol configuration and WASM upgrade |
| Anyone | Cannot write to contract storage — Soroban storage is only writable by the owning contract |

### 1.3 Admin Role Security

The admin role is the highest-privilege role. Its security properties:

- **Two-step transfer** — `propose_admin` + `accept_admin`. The new admin must sign the acceptance; a typo in the address cannot permanently lock the role.
- **Replay protection** — every admin operation (`pause_contract`, `unpause_contract`, `set_min_deposit`, `set_protocol_fee`, `upgrade`, etc.) consumes a monotonically increasing nonce (`consume_admin_nonce`). A captured transaction cannot be replayed.
- **No fund access** — the admin cannot call `withdraw`, `cancel_stream`, or any function that moves escrowed tokens to an arbitrary address.

### 1.4 Employer Stream Ownership Transfer

Stream ownership can be transferred via a two-step process (`propose_employer_transfer` + `accept_employer_transfer`). The new employer must sign the acceptance. Until accepted, the original employer retains all rights.

---

## 2. Security Assumptions

These are the conditions the contract relies on being true. If any assumption is violated, the stated guarantee may not hold.

| # | Assumption | Consequence if violated |
|---|---|---|
| A-1 | The admin keypair is not compromised | Compromised admin can pause the contract, change fees, or upgrade WASM to arbitrary logic |
| A-2 | The Stellar/Soroban host correctly enforces `require_auth()` | All role checks are bypassed |
| A-3 | The token contract at `stream.token` is a correct SEP-41 implementation | A malicious token could return false balances or execute arbitrary code during `transfer` |
| A-4 | `env.ledger().timestamp()` is a reliable monotonic clock | Time manipulation could allow early withdrawal or bypass of `stop_time` and `cliff_time` |
| A-5 | Soroban's host prevents true cross-contract reentrancy | The `stream.locked` reentrancy guard is defence-in-depth; if the host allows reentrant calls, the guard is the last line of defence |
| A-6 | Stellar consensus is live and finalising ledgers | Stream data has a ~2-year TTL; a network halt longer than that could cause data expiry |

---

## 3. Threat Model

### 3.1 Fund Theft

| Threat | Mitigation |
|---|---|
| Attacker impersonates employer to cancel and receive refund | `employer.require_auth()` + `assert_eq!(stream.employer, employer)` |
| Attacker impersonates employee to withdraw earnings | `employee.require_auth()` + `assert_eq!(stream.employee, employee)` |
| Reentrancy via malicious token callback drains contract | `stream.locked = true` set before `token::transfer`; released after. Panics with E003 if reentrant call is attempted |
| Employer == employee self-stream to game accounting | `validate_create_stream` rejects `employer == employee` (E010) |

### 3.2 Fund Lock (Permanent Escrow)

| Scenario | Recovery path |
|---|---|
| Active stream, employer key lost | Contract is upgradeable; a governance-authorised WASM upgrade can add a recovery path while preserving stream state |
| Active stream, employee key lost | Same — upgrade can add emergency reassignment |
| Admin key lost | Does not affect escrowed funds; streams continue to accrue and employees can withdraw. Admin-only ops become unavailable until key is recovered |
| Stream cancelled | No escrow remains — earned tokens sent to employee, remainder refunded to employer atomically |
| Stream exhausted | No escrow remains — all tokens have been withdrawn |

No code path permanently locks escrowed funds without a recovery option. See [fund-lock-audit.md](security/fund-lock-audit.md) for the full analysis.

### 3.3 Arithmetic and Overflow

| Risk | Mitigation |
|---|---|
| Overflow in `claimable_amount` | `checked_mul` panics on overflow (E004); elapsed time uses `saturating_sub` |
| Over-withdrawal beyond deposit | `min(earned, deposit - withdrawn)` caps payout; `checked_add` on `withdrawn` |
| Rate overflow at creation | `validate_create_stream` rejects `rate_per_second > 1_000_000_000` (E008) |
| Duration overflow | `validate_create_stream` rejects effective duration > 100 years (E014) |
| Fee calculation overflow | `checked_mul` on fee amount; fee capped at 100 bps (1%) by E011 |

### 3.4 Denial of Service

| Threat | Mitigation |
|---|---|
| Spam stream creation to exhaust index | Min-deposit requirement (E007) raises cost per stream; per-employer stream limit enforced (E015) |
| Stream data expiry from Soroban storage | TTL extended to ~2 years on every `save_stream` / `load_stream` call |
| Admin key capture used to permanently pause contract | Nonce prevents replay of a captured pause transaction (E009) |
| Zero-rate stream locks deposit forever | `validate_create_stream` rejects `rate_per_second = 0` (E001) |
| Zero-deposit stream | `validate_create_stream` rejects `deposit ≤ 0` (E002) and `deposit < min_deposit` (E007) |

### 3.5 Privilege Escalation

| Threat | Mitigation |
|---|---|
| Non-admin calls `upgrade` | `require_admin` check before `update_current_contract_wasm` |
| Employee calls `cancel_stream` | `require_employer_by_id` panics with "not the employer" |
| Employer calls `withdraw` on another employer's stream | `require_employee_by_id` panics with "not the employee" |
| Replay of captured admin transaction | Monotonic nonce consumed atomically; same nonce cannot be used twice (E009) |

---

## 4. Known Limitations and Edge Cases

### 4.1 Single Admin Key

The admin role is a single address. There is no native multi-sig enforcement at the contract level. For production deployments, the admin address should be a Stellar multisig account or a hardware-secured key. See [RR-01 in threat-model.md](security/threat-model.md#4-residual-risks).

### 4.2 Token Allowlist is Admin-Controlled

The token allowlist (`add_allowed_token` / `remove_allowed_token`) is controlled solely by the admin. If the admin key is compromised, an attacker could add a malicious token contract to the allowlist. Streams created before a token is removed from the allowlist continue to use that token — removal is not retroactive.

### 4.3 Protocol Fee Applies to Withdrawals Only

The protocol fee (up to 1% / 100 bps) is deducted at withdrawal time, not at deposit time. Employers deposit the full amount; employees receive `amount - fee`. If `fee_recipient` is unset, no fee is deducted regardless of `fee_bps`.

### 4.4 Cliff and Stop Time Are Not Enforced by the Token

`cliff_time` and `stop_time` are enforced in `claimable_amount` logic inside the contract. They are not enforced by the underlying token contract. An employee cannot bypass them by calling the token contract directly — the tokens are held in the stream contract's escrow, not in the employee's account.

### 4.5 Paused Time Exclusion

When a stream is paused and resumed, `last_withdraw_time` is advanced by the paused duration. This correctly excludes paused time from accrual. However, if a stream is paused at `T1` and the employee had unclaimed earnings at `T1`, those earnings remain claimable after resume — they are not forfeited.

### 4.6 Cooldown Period

If `cooldown_period > 0`, the employee cannot withdraw more frequently than once per `cooldown_period` seconds. This is enforced at the contract level. A cooldown of 0 (the default) imposes no restriction.

### 4.7 Governance Timelock

Governance proposals have a 2-day timelock (`GOV_TIMELOCK = 172800s`) before execution. Proposals that pass the vote cannot be executed until the timelock elapses. There is currently no veto mechanism after a proposal passes.

### 4.8 Batch Stream Atomicity

`create_streams_batch` is atomic: all streams in the batch are created or none are (Soroban transaction semantics). However, token transfers within the batch are sequential. If the token contract fails mid-batch, the entire transaction reverts.

### 4.9 Public Ledger

All stream data — employer address, employee address, deposit amount, rate, and withdrawal history — is publicly visible on the Stellar ledger. There is no privacy layer. See [storage-audit.md](security/storage-audit.md).

---

## 5. Error Code Reference

| Code | Constant | Meaning |
|---|---|---|
| E001 | `ERR_ZERO_RATE` | `rate_per_second` must be > 0 |
| E002 | `ERR_ZERO_DEPOSIT` | `deposit` must be > 0 |
| E003 | `ERR_REENTRANT` | Reentrant withdraw detected |
| E004 | `ERR_OVERFLOW` | Arithmetic overflow in claimable calculation |
| E005 | `ERR_STREAM_CANCELLED` | Cannot top up a cancelled stream |
| E006 | `ERR_STREAM_EXHAUSTED` | Cannot top up an exhausted stream |
| E007 | `ERR_BELOW_MIN_DEPOSIT` | Deposit below minimum |
| E008 | `ERR_INVALID_RATE` | `rate_per_second` exceeds maximum (1 billion) |
| E009 | `ERR_BAD_NONCE` | Invalid admin nonce (replay protection) |
| E010 | `ERR_SAME_PARTY` | Employer and employee must differ |
| E011 | `ERR_FEE_TOO_HIGH` | `fee_bps` exceeds 100 (1%) |
| E012 | `ERR_INVALID_TOKEN` | Token address is not a valid SEP-41 contract |
| E013 | `ERR_UNAUTHORIZED_TRANSFER` | Not the pending employer for this stream |
| E014 | `ERR_DURATION_TOO_LONG` | Stream duration exceeds 100 years |
| E015 | `ERR_MAX_STREAMS_REACHED` | Per-employer stream limit reached |
| E016 | `ERR_STOP_TIME_PAST` | `stop_time` must be in the future |
| E017 | `ERR_ALREADY_PAUSED` | Stream is already paused |
| E018 | `ERR_NOT_PAUSED` | Stream is not paused |
| E019 | `ERR_TOKEN_NOT_ALLOWED` | Token is not on the allowlist |

---

## 6. Security Contacts

Report vulnerabilities to `security@paystream.example` — **not via public issues**.  
See [SECURITY.md](../SECURITY.md) for the full disclosure policy.
