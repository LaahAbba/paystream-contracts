# API Reference

Full documentation for every PayStream contract function: parameters, return values, errors, and CLI examples.

> See [docs/performance.md](performance.md) for measured Soroban cost and resource usage for contract operations.
>
> For event schema and example payloads, see [docs/events.md](events.md).
>
> For a full error code reference with causes and resolution steps, see [docs/error-codes.md](error-codes.md).

---

## Stream Contract

### Type Reference

#### `Stream`

| Field | Type | Description |
|---|---|---|
| `id` | `u64` | Stream ID |
| `employer` | `Address` | Employer address |
| `employee` | `Address` | Employee address |
| `token` | `Address` | SEP-41 token contract address |
| `deposit` | `i128` | Total tokens locked in escrow |
| `withdrawn` | `i128` | Total tokens already withdrawn |
| `rate_per_second` | `i128` | Tokens streamed per second |
| `start_time` | `u64` | Ledger timestamp when stream was created |
| `stop_time` | `u64` | Hard stop timestamp (0 = indefinite) |
| `last_withdraw_time` | `u64` | Timestamp of last withdrawal or resume |
| `cooldown_period` | `u64` | Minimum seconds between withdrawals (0 = none) |
| `status` | `StreamStatus` | `Active` / `Paused` / `Cancelled` / `Exhausted` |
| `locked` | `bool` | Reentrancy guard — always `false` at rest |
| `cliff_time` | `u64` | No tokens claimable before this timestamp (0 = no cliff) |
| `paused_at` | `u64` | Timestamp when stream was last paused (0 if not paused) |

#### `StreamParams` (used in `create_streams_batch`)

| Field | Type | Description |
|---|---|---|
| `employee` | `Address` | Employee address |
| `token` | `Address` | SEP-41 token contract address |
| `deposit` | `i128` | Deposit for this stream |
| `rate_per_second` | `i128` | Tokens per second |
| `stop_time` | `u64` | Hard stop timestamp (0 = indefinite) |
| `cliff_time` | `u64` | Cliff timestamp (0 = no cliff) |

#### `StreamStatus`

| Value | Meaning |
|---|---|
| `Active` | Accruing normally |
| `Paused` | Accrual stopped; resumable by employer |
| `Cancelled` | Terminated; earned tokens paid, remainder refunded |
| `Exhausted` | Deposit fully streamed |

**Lifecycle:**
```
Active → Paused → Active
Active → Cancelled
Active → Exhausted
Paused → Cancelled
```

#### `PauseEvent`

| Field | Type | Description |
|---|---|---|
| `stream_id` | `u64` | Stream ID |
| `timestamp` | `u64` | Ledger timestamp of the event |
| `is_pause` | `bool` | `true` = paused, `false` = resumed |

---

## Admin Functions

### `initialize`

Set the contract admin. Must be called once after deployment.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Address that becomes the contract admin |

**Returns:** nothing

**Errors:** Panics if `admin` auth fails

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- initialize --admin $ADMIN_ADDRESS
```

---

### `propose_admin`

Step 1 of two-step admin transfer. Nominates a new admin.

**Caller:** Current admin

| Parameter | Type | Description |
|---|---|---|
| `current_admin` | `Address` | Must match the stored admin |
| `new_admin` | `Address` | Address being nominated |

**Returns:** nothing

**Errors:** Panics if caller is not the current admin

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- propose_admin --current_admin $ADMIN_ADDRESS --new_admin $NEW_ADMIN_ADDRESS
```

---

### `accept_admin`

Step 2 of two-step admin transfer. Nominated admin accepts the role.

**Caller:** Pending (nominated) admin

| Parameter | Type | Description |
|---|---|---|
| `new_admin` | `Address` | Must match the address set by `propose_admin` |

**Returns:** nothing

**Errors:** Panics if no pending admin is set, or if `new_admin` does not match

```bash
stellar contract invoke --id $STREAM_ID --source $NEW_ADMIN_KEY --network testnet \
  -- accept_admin --new_admin $NEW_ADMIN_ADDRESS
```

---

### `pause_contract`

Pause the entire contract. Blocks `create_stream`, `create_streams_batch`, and `withdraw`.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `nonce` | `u64` | Current admin nonce — get with `admin_nonce` |

**Returns:** nothing

**Errors:** E009 if nonce is wrong; panics if caller is not admin

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- pause_contract --admin $ADMIN_ADDRESS --nonce 0
```

---

### `unpause_contract`

Resume normal contract operation.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `nonce` | `u64` | Current admin nonce |

**Returns:** nothing

**Errors:** E009 if nonce is wrong; panics if caller is not admin

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- unpause_contract --admin $ADMIN_ADDRESS --nonce 1
```

---

### `set_min_deposit`

Set the minimum deposit enforced on `create_stream`.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `nonce` | `u64` | Current admin nonce |
| `amount` | `i128` | New minimum deposit (must be > 0) |

**Returns:** nothing

**Errors:** E002 if `amount` ≤ 0; E009 if nonce is wrong

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- set_min_deposit --admin $ADMIN_ADDRESS --nonce 2 --amount 100000
```

---

### `set_protocol_fee`

Set the protocol fee deducted from each withdrawal.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `nonce` | `u64` | Current admin nonce |
| `fee_bps` | `u32` | Fee in basis points (0–100; max 1%) |
| `fee_recipient` | `Address` | Address that receives the fee |

**Returns:** nothing

**Errors:** E011 if `fee_bps` > 100; E009 if nonce is wrong

> Fee is deducted at withdrawal time. If `fee_recipient` is unset, no fee is taken regardless of `fee_bps`.

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- set_protocol_fee --admin $ADMIN_ADDRESS --nonce 3 --fee_bps 50 --fee_recipient $FEE_ADDRESS
```

---

### `set_max_streams_per_employer`

Set the maximum number of streams an employer can create.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `nonce` | `u64` | Current admin nonce |
| `limit` | `u32` | New per-employer stream limit |

**Returns:** nothing

**Errors:** E009 if nonce is wrong

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- set_max_streams_per_employer --admin $ADMIN_ADDRESS --nonce 4 --limit 200
```

---

### `add_allowed_token`

Add a token to the admin-controlled allowlist. Once any token is added, only listed tokens are accepted by `create_stream`.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `token` | `Address` | SEP-41 token contract address to allow |

**Returns:** nothing

**Errors:** Panics if caller is not admin

> An empty allowlist means all tokens are accepted. Adding the first token activates the allowlist.

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- add_allowed_token --admin $ADMIN_ADDRESS --token $TOKEN_ADDRESS
```

---

### `remove_allowed_token`

Remove a token from the allowlist. Does not affect existing streams using that token.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `token` | `Address` | Token address to remove |

**Returns:** nothing

**Errors:** Panics if caller is not admin

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- remove_allowed_token --admin $ADMIN_ADDRESS --token $TOKEN_ADDRESS
```

---

### `get_allowed_tokens`

Return the current token allowlist.

**Caller:** Anyone

**Returns:** `Vec<Address>` — empty list means allowlist is not active (all tokens accepted)

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- get_allowed_tokens
```

---

### `upgrade`

Replace the contract WASM in-place. The new WASM must be uploaded to the network before calling this.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |
| `new_wasm_hash` | `BytesN<32>` | Hash of the uploaded WASM blob |
| `nonce` | `u64` | Current admin nonce |

**Returns:** nothing

**Errors:** E009 if nonce is wrong; panics if caller is not admin

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- upgrade --admin $ADMIN_ADDRESS --new_wasm_hash $WASM_HASH --nonce 5
```

---

### `migrate`

No-op migration hook. Call after `upgrade` to confirm the new WASM is operational.

**Caller:** Admin

| Parameter | Type | Description |
|---|---|---|
| `admin` | `Address` | Must match the stored admin |

**Returns:** nothing

```bash
stellar contract invoke --id $STREAM_ID --source $ADMIN_KEY --network testnet \
  -- migrate --admin $ADMIN_ADDRESS
```

---

### `admin_nonce`

Return the current admin nonce. Use this before any admin operation to get the correct nonce value.

**Caller:** Anyone

**Returns:** `u64`

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- admin_nonce
```

---

### `max_streams_per_employer`

Return the current per-employer stream limit.

**Caller:** Anyone

**Returns:** `u32`

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- max_streams_per_employer
```


---

## Employer Stream Functions

### `create_stream`

Create a salary stream and lock the deposit in escrow. The employer must pre-approve at least `deposit` tokens to the stream contract before calling.

**Caller:** Employer

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Employer address; tokens are pulled from here |
| `employee` | `Address` | Employee address; receives streamed tokens |
| `token_address` | `Address` | SEP-41 token contract address |
| `deposit` | `i128` | Total tokens to lock in escrow |
| `rate_per_second` | `i128` | Tokens streamed per second |
| `stop_time` | `u64` | Hard stop timestamp in seconds (0 = indefinite) |
| `cooldown_period` | `u64` | Minimum seconds between withdrawals (0 = no restriction) |
| `cliff_time` | `u64` | Timestamp before which nothing is claimable (0 = no cliff) |

**Returns:** `u64` — the new stream ID

**Errors:**

| Code | Condition |
|---|---|
| E001 | `rate_per_second` ≤ 0 |
| E002 | `deposit` ≤ 0 |
| E007 | `deposit` < minimum deposit |
| E008 | `rate_per_second` > 1,000,000,000 |
| E010 | `employer` == `employee` |
| E014 | Effective stream duration > 100 years |
| E015 | Employer has reached the per-employer stream limit |
| E016 | `stop_time` is in the past (when non-zero) |
| E018 | Token is not on the allowlist (when allowlist is active) |
| E019 | Token is not a valid SEP-41 contract |
| — | Contract is paused |
| — | Token transfer fails (insufficient balance or allowance) |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- create_stream \
    --employer $EMPLOYER_ADDRESS \
    --employee $EMPLOYEE_ADDRESS \
    --token_address $TOKEN_ID \
    --deposit 3600000000 \
    --rate_per_second 1000000 \
    --stop_time 0 \
    --cooldown_period 0 \
    --cliff_time 0
```

---

### `create_streams_batch`

Create multiple salary streams atomically. All streams succeed or all revert. Cheaper than N individual calls for N ≥ 2 (one base fee instead of N).

**Caller:** Employer

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Employer address |
| `params` | `Vec<StreamParams>` | List of stream parameters (see `StreamParams` type above) |

**Returns:** `Vec<u64>` — new stream IDs in the same order as `params`

**Errors:** Same per-stream validations as `create_stream`; panics if `params` is empty or would exceed the per-employer limit

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- create_streams_batch \
    --employer $EMPLOYER_ADDRESS \
    --params '[
      {"employee":"GEMPLOYEE1...","token":"CTOKEN...","deposit":1000000,"rate_per_second":100,"stop_time":0,"cliff_time":0},
      {"employee":"GEMPLOYEE2...","token":"CTOKEN...","deposit":2000000,"rate_per_second":200,"stop_time":0,"cliff_time":0}
    ]'
```

---

### `top_up`

Add more funds to an active or paused stream.

**Caller:** Employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Must match the stream's employer |
| `stream_id` | `u64` | ID of the stream to top up |
| `amount` | `i128` | Additional tokens to deposit (must be > 0) |

**Returns:** nothing

**Errors:**

| Code | Condition |
|---|---|
| E005 | Stream is Cancelled |
| E006 | Stream is Exhausted |
| — | `amount` ≤ 0 |
| — | Caller is not the stream's employer |
| — | Token transfer fails |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- top_up --employer $EMPLOYER_ADDRESS --stream_id 1 --amount 500000
```

---

### `pause_stream`

Pause an active stream. Accrual stops immediately; paused time is excluded from earnings.

**Caller:** Employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Must match the stream's employer |
| `stream_id` | `u64` | ID of the stream to pause |

**Returns:** nothing

**Errors:**

| Code | Condition |
|---|---|
| E017 | Stream is already Paused |
| — | Stream is not Active |
| — | Caller is not the stream's employer |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- pause_stream --employer $EMPLOYER_ADDRESS --stream_id 1
```

---

### `resume_stream`

Resume a paused stream. `last_withdraw_time` is advanced by the paused duration so paused time is excluded from accrual.

**Caller:** Employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Must match the stream's employer |
| `stream_id` | `u64` | ID of the stream to resume |

**Returns:** nothing

**Errors:**

| Code | Condition |
|---|---|
| E018 | Stream is not Paused |
| — | Caller is not the stream's employer |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- resume_stream --employer $EMPLOYER_ADDRESS --stream_id 1
```

---

### `cancel_stream`

Cancel an active or paused stream. The employee receives all earned tokens; the employer is refunded the remainder. Both transfers happen atomically.

**Caller:** Employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Must match the stream's employer |
| `stream_id` | `u64` | ID of the stream to cancel |

**Returns:** nothing

**Errors:** Panics if stream is already Cancelled or Exhausted; panics if caller is not the employer

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- cancel_stream --employer $EMPLOYER_ADDRESS --stream_id 1
```

---

### `update_rate`

Update the `rate_per_second` of an active stream. Earnings accrued at the old rate are crystallised first; the new rate applies from the current timestamp.

**Caller:** Employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Must match the stream's employer |
| `stream_id` | `u64` | ID of the stream to update |
| `new_rate` | `i128` | New tokens per second (must be > 0 and ≤ 1,000,000,000) |

**Returns:** nothing

**Errors:**

| Code | Condition |
|---|---|
| E001 | `new_rate` ≤ 0 |
| E008 | `new_rate` > 1,000,000,000 |
| — | Stream is not Active |
| — | Caller is not the stream's employer |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- update_rate --employer $EMPLOYER_ADDRESS --stream_id 1 --new_rate 2000000
```

---

### `propose_employer_transfer`

Step 1 of two-step stream ownership transfer. Proposes a new employer for a stream.

**Caller:** Current employer (must match `stream.employer`)

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Current employer |
| `stream_id` | `u64` | ID of the stream to transfer |
| `new_employer` | `Address` | Proposed new employer |

**Returns:** nothing

**Errors:** Panics if caller is not the stream's employer

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYER_KEY --network testnet \
  -- propose_employer_transfer \
    --employer $EMPLOYER_ADDRESS \
    --stream_id 1 \
    --new_employer $NEW_EMPLOYER_ADDRESS
```

---

### `accept_employer_transfer`

Step 2 of two-step stream ownership transfer. New employer accepts and takes ownership.

**Caller:** Proposed new employer

| Parameter | Type | Description |
|---|---|---|
| `new_employer` | `Address` | Must match the address set by `propose_employer_transfer` |
| `stream_id` | `u64` | ID of the stream being transferred |

**Returns:** nothing

**Errors:** E013 if caller does not match the pending employer

```bash
stellar contract invoke --id $STREAM_ID --source $NEW_EMPLOYER_KEY --network testnet \
  -- accept_employer_transfer --new_employer $NEW_EMPLOYER_ADDRESS --stream_id 1
```

---

## Employee Functions

### `withdraw`

Withdraw all claimable tokens earned so far. Returns 0 if nothing is claimable.

**Caller:** Employee (must match `stream.employee`)

| Parameter | Type | Description |
|---|---|---|
| `employee` | `Address` | Must match the stream's employee |
| `stream_id` | `u64` | ID of the stream to withdraw from |

**Returns:** `i128` — amount transferred to the employee (after protocol fee, if any)

**Errors:**

| Code | Condition |
|---|---|
| E003 | Reentrant withdraw detected |
| E010 | Cooldown period has not elapsed since last withdrawal |
| — | Contract is paused |
| — | Stream is not Active or Exhausted |
| — | Caller is not the stream's employee |

```bash
stellar contract invoke --id $STREAM_ID --source $EMPLOYEE_KEY --network testnet \
  -- withdraw --employee $EMPLOYEE_ADDRESS --stream_id 1
```


---

## Read Functions

### `get_stream`

Read the full state of a stream.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `stream_id` | `u64` | ID of the stream to read |

**Returns:** `Stream` (see type reference above)

**Errors:** Panics if stream not found

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- get_stream --stream_id 1
```

---

### `claimable`

Query how many tokens the employee can withdraw right now.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `stream_id` | `u64` | ID of the stream to query |

**Returns:** `i128` — claimable token amount

**Formula:**
```
effective_end  = min(now, stop_time)   # stop_time ignored when 0
elapsed        = effective_end - last_withdraw_time
earned         = elapsed * rate_per_second
claimable      = min(earned, deposit - withdrawn)
```
Returns 0 before `cliff_time` (when set), and 0 for Cancelled or Exhausted streams.

**Errors:** Panics if stream not found

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- claimable --stream_id 1
```

---

### `claimable_at`

Query how many tokens would be claimable at an arbitrary timestamp. Useful for projections and UI previews.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `stream_id` | `u64` | ID of the stream to query |
| `timestamp` | `u64` | Hypothetical ledger timestamp (Unix seconds) |

**Returns:** `i128`

**Errors:** Panics if stream not found

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- claimable_at --stream_id 1 --timestamp 1800000000
```

---

### `stream_count`

Total number of streams ever created (monotonically increasing).

**Caller:** Anyone

**Returns:** `u64`

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- stream_count
```

---

### `streams_by_employer`

Return all stream IDs created by an employer.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `employer` | `Address` | Employer address to query |

**Returns:** `Vec<u64>`

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- streams_by_employer --employer $EMPLOYER_ADDRESS
```

---

### `streams_by_employee`

Return all stream IDs paying an employee.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `employee` | `Address` | Employee address to query |

**Returns:** `Vec<u64>`

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- streams_by_employee --employee $EMPLOYEE_ADDRESS
```

---

### `pause_history`

Return the full pause/resume event log for a stream.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `stream_id` | `u64` | ID of the stream to query |

**Returns:** `Vec<PauseEvent>` (see type reference above)

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- pause_history --stream_id 1
```

---

## Governance Functions

Governance allows any address to propose and vote on changes to protocol parameters. Passed proposals are subject to a 2-day timelock before execution.

### Governance Types

#### `GovParam`

| Value | Controlled parameter |
|---|---|
| `MinDeposit` | Minimum deposit for stream creation |
| `MaxDuration` | Maximum streams per employer |
| `FeeBps` | Protocol fee in basis points |

#### `ProposalStatus`

| Value | Meaning |
|---|---|
| `Active` | Voting open |
| `Passed` | Vote passed; awaiting timelock |
| `Rejected` | Vote failed |
| `Executed` | Applied on-chain |

#### `Proposal`

| Field | Type | Description |
|---|---|---|
| `id` | `u64` | Proposal ID |
| `param` | `GovParam` | Parameter being changed |
| `new_value` | `u64` | Proposed new value |
| `votes_for` | `u64` | Votes in favour |
| `votes_against` | `u64` | Votes against |
| `status` | `ProposalStatus` | Current status |
| `executable_after` | `u64` | Earliest timestamp the proposal can be executed (timelock) |

---

### `propose_parameter`

Create a governance proposal to change a protocol parameter.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `proposer` | `Address` | Address creating the proposal |
| `param` | `GovParam` | Which parameter to change |
| `new_value` | `u64` | Proposed new value |

**Returns:** `u64` — the new proposal ID

```bash
stellar contract invoke --id $STREAM_ID --source $PROPOSER_KEY --network testnet \
  -- propose_parameter \
    --proposer $PROPOSER_ADDRESS \
    --param '{"MinDeposit":{}}' \
    --new_value 50000
```

---

### `vote`

Cast a vote on an active proposal. Each address may vote once per proposal.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `voter` | `Address` | Voting address |
| `proposal_id` | `u64` | ID of the proposal to vote on |
| `support` | `bool` | `true` = vote for, `false` = vote against |

**Returns:** nothing

**Errors:** Panics if proposal is not Active; panics if voter has already voted

```bash
stellar contract invoke --id $STREAM_ID --source $VOTER_KEY --network testnet \
  -- vote --voter $VOTER_ADDRESS --proposal_id 1 --support true
```

---

### `tally`

Finalise voting on a proposal and set its status to `Passed` or `Rejected`.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | ID of the proposal to tally |

**Returns:** nothing

**Errors:** Panics if proposal is not Active

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- tally --proposal_id 1
```

---

### `execute_proposal`

Execute a passed proposal after the 2-day timelock has elapsed.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | ID of the proposal to execute |

**Returns:** nothing

**Errors:** Panics if proposal is not Passed; panics if timelock has not elapsed

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- execute_proposal --proposal_id 1
```

---

### `get_proposal`

Read the full state of a governance proposal.

**Caller:** Anyone

| Parameter | Type | Description |
|---|---|---|
| `proposal_id` | `u64` | ID of the proposal to read |

**Returns:** `Proposal` (see type reference above)

**Errors:** Panics if proposal not found

```bash
stellar contract invoke --id $STREAM_ID --source $ANY_KEY --network testnet \
  -- get_proposal --proposal_id 1
```

---

## Error Code Reference

| Code | Constant | Meaning |
|---|---|---|
| E001 | `ERR_ZERO_RATE` | `rate_per_second` must be > 0 |
| E002 | `ERR_ZERO_DEPOSIT` | `deposit` must be > 0 |
| E003 | `ERR_REENTRANT` | Reentrant withdraw detected |
| E004 | `ERR_OVERFLOW` | Arithmetic overflow in claimable calculation |
| E005 | `ERR_STREAM_CANCELLED` | Cannot top up a cancelled stream |
| E006 | `ERR_STREAM_EXHAUSTED` | Cannot top up an exhausted stream |
| E007 | `ERR_BELOW_MIN_DEPOSIT` | Deposit is below the configured minimum |
| E008 | `ERR_INVALID_RATE` | `rate_per_second` exceeds maximum (1,000,000,000) |
| E009 | `ERR_BAD_NONCE` | Invalid admin nonce (replay protection) |
| E010 | `ERR_SAME_PARTY` | `employer` and `employee` must be different addresses |
| E011 | `ERR_FEE_TOO_HIGH` | `fee_bps` exceeds 100 (1%) |
| E012 | `ERR_INVALID_TOKEN` | Token address is not a valid SEP-41 contract |
| E013 | `ERR_UNAUTHORIZED_TRANSFER` | Caller is not the pending employer for this stream |
| E014 | `ERR_DURATION_TOO_LONG` | Stream duration exceeds 100 years |
| E015 | `ERR_MAX_STREAMS_REACHED` | Employer has reached the per-employer stream limit |
| E016 | `ERR_STOP_TIME_PAST` | `stop_time` must be in the future (when non-zero) |
| E017 | `ERR_ALREADY_PAUSED` | Stream is already Paused |
| E018 | `ERR_NOT_PAUSED` | Stream is not Paused |
| E019 | `ERR_TOKEN_NOT_ALLOWED` | Token is not on the admin allowlist |

---

## On-Chain Events

All state-mutating functions emit events. Subscribe via Horizon or a Soroban RPC stream.

| Event symbol | Emitted by | Payload |
|---|---|---|
| `created` | `create_stream` | `(employer, employee, rate_per_second)` |
| `withdraw` | `withdraw` | `(employee, amount)` |
| `cancelled` | `cancel_stream` | `(employer, employee, refund, employee_payout)` |
| `paused` | `pause_stream` | `(employer, employee, paused_at)` |
| `resumed` | `resume_stream` | `(employer, employee, resumed_at)` |
| `topup` | `top_up` | `(employer, amount)` |
| `paused` | `pause_contract` / `unpause_contract` | `bool` |
| `emp_prop` | `propose_employer_transfer` | `(old_employer, new_employer)` |
| `emp_acc` | `accept_employer_transfer` | `(old_employer, new_employer)` |
| `ratechng` | `update_rate` | `(old_rate, new_rate)` |
| `nearexhst` | `withdraw` (warning) | `(employer, threshold_days)` |
| `propcreat` | `propose_parameter` | `proposal_id` |
| `propexec` | `execute_proposal` | `proposal_id` |

> For full event schema and example payloads, see [docs/events.md](events.md).
