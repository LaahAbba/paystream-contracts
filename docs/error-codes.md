# Error Code Reference

Complete reference for all error codes emitted by the PayStream smart contracts. Use the
code number (e.g. **E001**) or keyword search to find the error you received.

> **Source of truth:** [`contracts/stream/src/types.rs`](../contracts/stream/src/types.rs) and
> [`contracts/stream/src/access_control.rs`](../contracts/stream/src/access_control.rs).

---

## Quick-look table

| Code | Constant | Short description | Thrown by |
|------|----------|-------------------|-----------|
| [E001](#e001-zero-rate) | `ERR_ZERO_RATE` | `rate_per_second` must be > 0 | `create_stream`, `update_rate` |
| [E002](#e002-zero-deposit) | `ERR_ZERO_DEPOSIT` | `deposit` must be positive | `create_stream`, `set_min_deposit` |
| [E003](#e003-reentrant-withdraw) | `ERR_REENTRANT` | Reentrant withdraw detected | `withdraw` |
| [E004](#e004-arithmetic-overflow) | `ERR_OVERFLOW` | Arithmetic overflow in claimable calculation | `create_stream`, `create_streams_batch` |
| [E005](#e005-stream-cancelled) | `ERR_STREAM_CANCELLED` | Cannot top up a cancelled stream | `top_up` |
| [E006](#e006-stream-exhausted) | `ERR_STREAM_EXHAUSTED` | Cannot top up an exhausted stream | `top_up` |
| [E007](#e007-below-minimum-deposit) | `ERR_BELOW_MIN_DEPOSIT` | Deposit below the protocol minimum | `create_stream`, `create_streams_batch` |
| [E008](#e008-invalid-rate) | `ERR_INVALID_RATE` | `rate_per_second` exceeds maximum | `create_stream`, `update_rate` |
| [E009](#e009-bad-nonce) | `ERR_BAD_NONCE` | Invalid admin nonce | All admin operations |
| [E010](#e010-same-party--withdraw-cooldown) | `ERR_SAME_PARTY` / `ERR_WITHDRAW_COOLDOWN` | Employer = employee **or** cooldown not expired | `create_stream`, `withdraw` |
| [E011](#e011-fee-too-high) | `ERR_FEE_TOO_HIGH` | `fee_bps` exceeds 100 (1 %) | `set_protocol_fee` |
| [E012](#e012-invalid-token) | `ERR_INVALID_TOKEN` | Token is not a valid SEP-41 contract | `create_stream`, `create_streams_batch` |
| [E013](#e013-unauthorized-transfer) | `ERR_UNAUTHORIZED_TRANSFER` | Not the pending employer for this stream | `accept_employer_transfer` |
| [E014](#e014-duration-too-long) | `ERR_DURATION_TOO_LONG` | Stream duration exceeds the allowed maximum | `create_stream`, `create_streams_batch` |
| [E015](#e015-max-streams-reached) | `ERR_MAX_STREAMS_REACHED` | Employer has hit the stream limit | `create_stream`, `create_streams_batch` |
| [E016](#e016-stop-time-in-past--already-paused) | `ERR_STOP_TIME_PAST` / `ERR_ALREADY_PAUSED` | `stop_time` is in the past **or** stream already paused | `create_stream`, `pause_stream` |
| [E017](#e017-not-paused) | `ERR_NOT_PAUSED` | Stream is not paused | `resume_stream` |
| [E018](#e018-token-not-allowed) | `ERR_TOKEN_NOT_ALLOWED` | Token is not on the admin allowlist | `create_stream`, `create_streams_batch` |
| [E019](#e019-cliff-after-stop) | `ERR_CLIFF_AFTER_STOP` | Cliff time must be ≤ stop time | `create_stream`, `create_streams_batch` |
| [—](#access-control-errors) | `ERR_NOT_ADMIN` | Caller is not the contract admin | All admin-gated functions |
| [—](#access-control-errors) | `ERR_NOT_EMPLOYER` | Caller is not the stream employer | Employer-gated functions |
| [—](#access-control-errors) | `ERR_NOT_EMPLOYEE` | Caller is not the stream employee | `withdraw` |
| [—](#access-control-errors) | `ERR_NOT_DELEGATE` | Caller is not the stream delegate | Delegate-gated functions |

> **Note on duplicate codes:** Due to an incremental development history, codes **E010** and **E016**
> each cover two distinct errors. See the individual entries below for details.

---

## Numbered error codes

### E001 — Zero Rate

| | |
|---|---|
| **Constant** | `ERR_ZERO_RATE` |
| **Message** | `E001: rate_per_second must be greater than zero` |
| **Thrown by** | `create_stream`, `create_streams_batch`, `update_rate` |

#### Cause

The `rate_per_second` parameter was set to `0` or a negative value. A stream with a zero rate would
never accrue any earnings for the employee, so the contract rejects it early.

#### Resolution

Pass a positive integer for `rate_per_second`.  
A common starting point: to stream **10 USDC per hour** with a token that has 7 decimal places, use
`rate_per_second = 10_0000000 / 3600 ≈ 27_778` (round up to avoid dust).

```bash
# ✗ Bad
--rate_per_second 0

# ✓ Good — streams ~10 USDC/hour (7 decimals)
--rate_per_second 27778
```

---

### E002 — Zero Deposit

| | |
|---|---|
| **Constant** | `ERR_ZERO_DEPOSIT` |
| **Message** | `E002: deposit must be positive` |
| **Thrown by** | `create_stream`, `create_streams_batch`, `set_min_deposit` |

#### Cause

The `deposit` parameter was `0` or negative. The contract requires a strictly positive deposit to
fund the escrow.

#### Resolution

Provide a positive value for `deposit`. Remember to account for the protocol fee: the net deposit
stored in the stream will be `deposit - fee`, so the gross value you pass must cover the fee as
well.

```bash
# ✗ Bad
--deposit 0

# ✓ Good
--deposit 1000000
```

---

### E003 — Reentrant Withdraw

| | |
|---|---|
| **Constant** | `ERR_REENTRANT` |
| **Message** | `E003: reentrant withdraw detected` |
| **Thrown by** | `withdraw` |

#### Cause

The `withdraw` function sets a per-stream `locked` flag before executing the token transfer. If a
subsequent call to `withdraw` for the same stream arrives while the flag is set (e.g. through a
cross-contract re-entry attack), this error is raised.

Under normal operation — a single transaction calling `withdraw` once — you will **never** see this
error. It is a defense-in-depth guard.

#### Resolution

- **Integration developers:** Do not call `withdraw` from a contract that is itself called by
  `withdraw`. There is no legitimate use-case for that pattern.
- **If you see this in tests:** Check whether your test invokes `withdraw` inside a hook or callback
  that is triggered by the token transfer.

---

### E004 — Arithmetic Overflow

| | |
|---|---|
| **Constant** | `ERR_OVERFLOW` |
| **Message** | `E004: arithmetic overflow in claimable calculation` |
| **Thrown by** | `create_stream`, `create_streams_batch` (fee calculation) |

#### Cause

The protocol fee calculation `deposit × fee_bps` overflowed an `i128`. This requires an
astronomically large deposit (close to `i128::MAX`) combined with a non-zero fee and is effectively
impossible with real-world token supplies.

#### Resolution

Reduce the deposit amount. If you are stress-testing with synthetic large values, keep `deposit ×
100` below `i128::MAX` (~1.7 × 10³⁸).

---

### E005 — Stream Cancelled

| | |
|---|---|
| **Constant** | `ERR_STREAM_CANCELLED` |
| **Message** | `E005: cannot top up a cancelled stream` |
| **Thrown by** | `top_up` |

#### Cause

`top_up` was called on a stream whose status is `Cancelled`. Once cancelled, a stream is terminal;
funds have already been settled between employer and employee.

#### Resolution

Do not top up cancelled streams. If you need to continue paying the employee, create a new stream
with `create_stream`.

---

### E006 — Stream Exhausted

| | |
|---|---|
| **Constant** | `ERR_STREAM_EXHAUSTED` |
| **Message** | `E006: cannot top up an exhausted stream` |
| **Thrown by** | `top_up` |

#### Cause

`top_up` was called on a stream whose status is `Exhausted` (all deposited tokens have been
withdrawn). The contract prevents top-ups on exhausted streams to avoid confusion about the
stream's terminal state.

#### Resolution

Call `top_up` only on `Active` or `Paused` streams. Check the stream's status first using
`get_stream`.

```bash
# Check status before top-up
stellar contract invoke --id <STREAM_CONTRACT> -- get_stream --stream_id 42
```

---

### E007 — Below Minimum Deposit

| | |
|---|---|
| **Constant** | `ERR_BELOW_MIN_DEPOSIT` |
| **Message** | `E007: deposit below minimum` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

The `deposit` amount is less than the protocol-wide minimum deposit configured by the admin. The
default minimum is **10,000 token units** (raw, before decimal scaling).

#### Resolution

1. Query the current minimum: there is no dedicated getter, but it is stored in `ContractConfig`
   (key `Config`). Use the admin nonce query as a sanity check that the contract is initialized.
2. Increase your `deposit` to meet or exceed the minimum, or ask the admin to lower it via
   `set_min_deposit`.

```bash
# ✓ Ensure deposit ≥ min_deposit
--deposit 100000   # 100,000 raw units — safely above the default 10,000
```

---

### E008 — Invalid Rate

| | |
|---|---|
| **Constant** | `ERR_INVALID_RATE` |
| **Message** | `E008: rate_per_second exceeds maximum` |
| **Thrown by** | `create_stream`, `create_streams_batch`, `update_rate` |

#### Cause

`rate_per_second` exceeds **1,000,000,000** (1 billion). This cap exists to prevent arithmetic
overflow in `claimable_amount` for any realistic elapsed time up to ~292 years.

#### Resolution

Lower `rate_per_second` to ≤ 1,000,000,000. For reference, 1 billion units/second of a 7-decimal
token equals 100 tokens/second or 8.64 million tokens/day — far beyond any real salary scenario.

```bash
# ✗ Bad — exceeds cap
--rate_per_second 2000000000

# ✓ Good
--rate_per_second 1000000000
```

---

### E009 — Bad Nonce

| | |
|---|---|
| **Constant** | `ERR_BAD_NONCE` |
| **Message** | `E009: invalid admin nonce` |
| **Thrown by** | `pause_contract`, `unpause_contract`, `set_min_deposit`, `set_protocol_fee`, `set_max_streams_per_employer`, `upgrade` |

#### Cause

Admin operations are protected by a sequential nonce to prevent replay attacks. The `nonce`
parameter you supplied does not match the currently stored nonce. Nonces start at **0** and
increment by 1 after each consumed admin operation.

#### Resolution

1. Read the current nonce: `stellar contract invoke -- admin_nonce`
2. Use that value as the `nonce` parameter in your next admin call.
3. If two admin transactions are submitted concurrently, one will fail — retry with the updated
   nonce.

```bash
# Step 1 — fetch current nonce
NONCE=$(stellar contract invoke --id <STREAM_CONTRACT> -- admin_nonce)

# Step 2 — use it
stellar contract invoke --id <STREAM_CONTRACT> --source <ADMIN_KEY> \
  -- pause_contract --admin <ADMIN_ADDRESS> --nonce $NONCE
```

---

### E010 — Same Party / Withdraw Cooldown

> This code covers **two** distinct errors due to a historical numbering collision.

#### E010-A: Same Party

| | |
|---|---|
| **Constant** | `ERR_SAME_PARTY` |
| **Message** | `E010: employer and employee must differ` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

**Cause:** The `employer` and `employee` addresses are identical. A stream to yourself would be
meaningless and is rejected.

**Resolution:** Use two different addresses for `employer` and `employee`.

#### E010-B: Withdraw Cooldown

| | |
|---|---|
| **Constant** | `ERR_WITHDRAW_COOLDOWN` |
| **Message** | `E010: withdraw cooldown not expired` |
| **Thrown by** | `withdraw` |

**Cause:** The stream has a non-zero `cooldown_period` and not enough time has elapsed since the
last withdrawal (`now < last_withdraw_time + cooldown_period`).

**Resolution:** Wait until the cooldown expires before calling `withdraw` again. Query
`last_withdraw_time` and `cooldown_period` from `get_stream` to calculate when you can next
withdraw.

```bash
# Check stream times
stellar contract invoke --id <STREAM_CONTRACT> -- get_stream --stream_id <ID>
# wait until: ledger_timestamp >= last_withdraw_time + cooldown_period
```

---

### E011 — Fee Too High

| | |
|---|---|
| **Constant** | `ERR_FEE_TOO_HIGH` |
| **Message** | `E011: fee_bps exceeds maximum of 100` |
| **Thrown by** | `set_protocol_fee` |

#### Cause

`fee_bps` was set to a value greater than **100** basis points (1 %). The contract caps the
protocol fee at 1 % to protect users.

#### Resolution

Use a value in the range **0–100** for `fee_bps`.

```bash
# ✗ Bad — 200 bps = 2%
--fee_bps 200

# ✓ Good — 50 bps = 0.5%
--fee_bps 50
```

---

### E012 — Invalid Token

| | |
|---|---|
| **Constant** | `ERR_INVALID_TOKEN` |
| **Message** | `E012: token address is not a valid SEP-41 contract` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

The token contract at the given address does not implement the SEP-41 interface (specifically, the
`balance` function probe failed). This can happen if:

- The address is wrong or typo'd.
- The contract at that address is not a token contract.
- The contract is not yet deployed.

#### Resolution

1. Verify the token address on the Stellar explorer for your network.
2. Ensure the contract at that address is a SEP-41-compliant token.
3. If you are deploying a test token, make sure it is deployed **before** creating a stream.

---

### E013 — Unauthorized Transfer

| | |
|---|---|
| **Constant** | `ERR_UNAUTHORIZED_TRANSFER` |
| **Message** | `E013: not the pending employer for this stream` |
| **Thrown by** | `accept_employer_transfer` |

#### Cause

`accept_employer_transfer` was called by an address that does not match the `new_employer` set by
the preceding `propose_employer_transfer` call.

#### Resolution

- The address calling `accept_employer_transfer` must be the **exact** address nominated in
  `propose_employer_transfer`.
- If the wrong address was nominated, the current employer must call `propose_employer_transfer`
  again with the correct address.

---

### E014 — Duration Too Long

| | |
|---|---|
| **Constant** | `ERR_DURATION_TOO_LONG` |
| **Message** | `E014: stream duration exceeds maximum allowed` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

The effective duration of the stream exceeds **100 years** (≈ 3.15 × 10⁹ seconds). Duration is
computed in two ways:

1. **Deposit-based:** `deposit / rate_per_second` > 100 years.
2. **Stop-time-based:** `stop_time - now` > 100 years.

#### Resolution

- Lower the `deposit` or raise `rate_per_second` so the deposit-based duration fits within 100
  years.
- Set `stop_time` to a timestamp within 100 years from now, or use `0` (no stop time) and control
  duration through the deposit/rate ratio.

---

### E015 — Max Streams Reached

| | |
|---|---|
| **Constant** | `ERR_MAX_STREAMS_REACHED` |
| **Message** | `E015: maximum streams per employer reached` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

The employer has already created the maximum number of streams allowed by the protocol. The default
limit is **100 streams per employer** (configured in `ContractConfig.max_streams`).

#### Resolution

- Cancel streams that are no longer needed to free up slots.
- Ask the admin to increase the limit via `set_max_streams_per_employer`.
- For batch creation, check that `current_stream_count + batch_size ≤ max_limit` before submitting.

---

### E016 — Stop Time in Past / Already Paused

> This code covers **two** distinct errors due to a historical numbering collision.

#### E016-A: Stop Time in Past

| | |
|---|---|
| **Constant** | `ERR_STOP_TIME_PAST` |
| **Message** | `E016: stop_time must be in the future` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

**Cause:** A non-zero `stop_time` was provided but the timestamp is already in the past relative to
the current ledger time.

**Resolution:** Pass a `stop_time` in the future, or use `0` for an open-ended stream.

```bash
# Check current ledger time via Stellar CLI or RPC, then add your desired duration
STOP_TIME=$(($(date +%s) + 2592000))   # 30 days from now
stellar contract invoke ... -- create_stream ... --stop_time $STOP_TIME
```

#### E016-B: Already Paused

| | |
|---|---|
| **Constant** | `ERR_ALREADY_PAUSED` |
| **Message** | `E016: stream is already paused` |
| **Thrown by** | `pause_stream` |

**Cause:** `pause_stream` was called on a stream that is already in the `Paused` state.

**Resolution:** Call `get_stream` to check the current `status` before pausing. If the stream is
already paused, call `resume_stream` first.

---

### E017 — Not Paused

| | |
|---|---|
| **Constant** | `ERR_NOT_PAUSED` |
| **Message** | `E017: stream is not paused` |
| **Thrown by** | `resume_stream` |

#### Cause

`resume_stream` was called on a stream that is not in the `Paused` state (it is `Active`,
`Cancelled`, or `Exhausted`).

#### Resolution

Call `get_stream` to verify the stream's `status` is `Paused` before calling `resume_stream`. If
the stream is `Active`, no action is needed.

---

### E018 — Token Not Allowed

| | |
|---|---|
| **Constant** | `ERR_TOKEN_NOT_ALLOWED` |
| **Message** | `E018: token is not on the allowlist` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

The contract has a token allowlist configured by the admin, and the token address you provided is
not on it. When the allowlist is non-empty, **only listed tokens** can be used in streams.

> If the allowlist is empty (not yet configured), all valid SEP-41 tokens are accepted.

#### Resolution

1. Check the current allowlist: `stellar contract invoke -- get_allowed_tokens`
2. Use one of the listed token addresses.
3. If you control the admin, add your token: `stellar contract invoke -- add_allowed_token --token <TOKEN_ADDRESS>`

---

### E019 — Cliff After Stop

| | |
|---|---|
| **Constant** | `ERR_CLIFF_AFTER_STOP` |
| **Message** | `E019: cliff time must be before or equal to stop time` |
| **Thrown by** | `create_stream`, `create_streams_batch` |

#### Cause

A `cliff_time` was provided that is **later** than `stop_time`. A cliff after the stop time would
mean the employee can never claim any tokens, which is almost certainly a configuration error.

The check only triggers when **both** `cliff_time > 0` and `stop_time > 0`.

#### Resolution

Ensure `cliff_time ≤ stop_time`. Common patterns:

```bash
# 6-month cliff, 2-year vesting
CLIFF=$(($(date +%s) + 15552000))   # +6 months
STOP=$(($(date +%s)  + 63072000))   # +2 years

stellar contract invoke ... \
  --cliff_time $CLIFF \
  --stop_time  $STOP
```

---

## Access control errors

These errors do not carry numeric codes; they are plain string panics produced by the
`access_control` module.

| Constant | Message | When it occurs |
|---|---|---|
| `ERR_NOT_ADMIN` | `not the admin` | Caller does not match the stored admin address |
| `ERR_NOT_PENDING_ADMIN` | `not the pending admin` | Caller does not match the pending admin set by `propose_admin` |
| `ERR_NOT_EMPLOYER` | `not the employer` | Caller does not match the stream's employer |
| `ERR_NOT_EMPLOYEE` | `not the employee` | Caller does not match the stream's employee |
| `ERR_NOT_DELEGATE` | `not the delegate` | Caller does not match the stream's optional delegate |

### Common cause

The most common reason is a **key/address mismatch**: the Stellar CLI `--source` key does not
match the address passed as a parameter, or the address used during signing differs from the one
stored on-chain.

### Resolution

1. Confirm which address is expected: call `get_stream` (for employer/employee/delegate) or
   `admin_nonce` + inspect the `Admin` storage key.
2. Ensure you sign with the keypair that owns that address.
3. For `ERR_NOT_PENDING_ADMIN` / unauthorized transfer: verify the two-step proposal was issued
   for the correct address and has not expired.

---

## General troubleshooting tips

1. **"stream not found"** — the stream ID does not exist. Call `stream_count` to see the total, and
   confirm you have the correct numeric ID.
2. **"contract is paused"** — the admin has paused the contract globally. Wait for
   `unpause_contract` or contact the admin.
3. **"proposal not found / not active / not passed"** — governance calls require the proposal to
   exist and be in the correct state. Use `get_proposal` to inspect it.
4. **Token transfer failures** — if `create_stream` or `top_up` fails without one of the E-codes
   above, the underlying SEP-41 token rejected the transfer (insufficient balance or allowance).
   Approve the stream contract for at least the deposit amount before calling `create_stream`.

---

## See also

- [API Reference](api-reference.md) — full function signatures, parameters, and CLI examples
- [Events Reference](events.md) — on-chain events emitted alongside errors
- [Access Control Guide](../contracts/stream/ACCESS_CONTROL.md) — role model and permission matrix
- [FAQ](faq.md) — answers to common integration questions
