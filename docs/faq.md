# PayStream FAQ

Common questions from integrators, developers, and employers using PayStream.

---

## General

### Q1: What is PayStream?

PayStream is a set of Soroban smart contracts on the Stellar blockchain that let employers stream salary to employees in real time, per second. Instead of a monthly paycheck, employees earn and can withdraw continuously as they work.

---

### Q2: Which tokens are supported?

Any [SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md) compliant token contract. This includes Stellar Asset Contracts (SACs) wrapping native XLM or any Stellar classic asset, as well as custom token contracts that implement the SEP-41 interface (`balance`, `transfer`, `approve`, etc.).

The token address is validated at stream creation time via a `try_balance` probe. Passing an address that does not implement SEP-41 will be rejected with **E012**.

---

### Q3: Can an employer run multiple concurrent streams?

Yes. Each `create_stream` call creates an independent stream with its own deposit, rate, and token. An employer can have any number of active streams to different employees, in different tokens.

---

### Q4: Can an employee receive streams from multiple employers?

Yes. Employees can receive any number of concurrent streams. Use `streams_by_employee(employee)` to list all stream IDs paying a given address.

---

## Stream Creation

### Q5: What is the minimum deposit?

The admin sets a global minimum deposit via `set_min_deposit`. The default is **10 000 stroops** (0.001 XLM equivalent). Attempting to create a stream with a deposit below this value will be rejected with **E007**.

---

### Q6: What is the maximum `rate_per_second`?

**1 000 000 000** (one billion) tokens per second. Rates above this are rejected with **E008** to prevent arithmetic overflow in the claimable calculation.

---

### Q7: Can I set a hard end time for a stream?

Yes. Pass a Unix timestamp (seconds) as `stop_time`. The stream will stop accruing at that time even if the deposit is not fully exhausted. Pass `0` for an indefinite stream.

---

### Q8: What is `cooldown_period`?

An optional minimum number of seconds the employee must wait between withdrawals. Set to `0` to allow withdrawals at any time. Withdrawing before the cooldown expires is rejected with **E010**.

---

## Withdrawals and Balances

### Q9: How is the claimable amount calculated?

```
claimable = min(
    (now - last_withdraw_time) * rate_per_second,
    deposit - withdrawn
)
```

Time is capped at `stop_time` if set. Paused intervals are excluded because `last_withdraw_time` is reset to the current timestamp on `resume_stream`.

---

### Q10: What happens when the deposit is fully streamed?

The stream transitions to **Exhausted** status. The employee can still call `withdraw` on an Exhausted stream — it returns `0` without reverting. No further accrual occurs.

---

### Q11: Is there a protocol fee on withdrawals?

Optionally. The admin can configure a fee in basis points (1 bps = 0.01%) up to a maximum of **100 bps (1%)** via `set_protocol_fee`. The fee is deducted from the withdrawal amount and sent to the configured `fee_recipient`. The default fee is **0** (disabled).

---

## Error Codes

### Q12: What do the error codes mean?

For a comprehensive list with causes and resolution steps for every error, see the
**[Error Code Reference](error-codes.md)**.

Quick summary of the most common codes:

| Code | Constant | Meaning |
|---|---|---|
| E001 | `ERR_ZERO_RATE` | `rate_per_second` must be > 0 |
| E002 | `ERR_ZERO_DEPOSIT` | `deposit` must be > 0 |
| E003 | `ERR_REENTRANT` | Reentrant withdraw detected (defence-in-depth guard) |
| E004 | `ERR_OVERFLOW` | Arithmetic overflow in claimable calculation |
| E005 | `ERR_STREAM_CANCELLED` | Cannot top up a cancelled stream |
| E006 | `ERR_STREAM_EXHAUSTED` | Cannot top up an exhausted stream |
| E007 | `ERR_BELOW_MIN_DEPOSIT` | Deposit is below the configured minimum |
| E008 | `ERR_INVALID_RATE` | `rate_per_second` exceeds the maximum of 1 000 000 000 |
| E009 | `ERR_BAD_NONCE` | Admin nonce mismatch — replay protection triggered |
| E010 | `ERR_SAME_PARTY` / `ERR_WITHDRAW_COOLDOWN` | Employer = employee, or cooldown not expired |
| E011 | `ERR_FEE_TOO_HIGH` | `fee_bps` exceeds the maximum of 100 |
| E012 | `ERR_INVALID_TOKEN` | Token address is not a valid SEP-41 contract |
| E013 | `ERR_UNAUTHORIZED_TRANSFER` | Caller is not the pending employer for this stream |
| E014 | `ERR_DURATION_TOO_LONG` | Stream duration exceeds 100 years |
| E015 | `ERR_MAX_STREAMS_REACHED` | Employer has hit the stream limit |
| E016 | `ERR_STOP_TIME_PAST` / `ERR_ALREADY_PAUSED` | `stop_time` in the past, or stream already paused |
| E017 | `ERR_NOT_PAUSED` | `resume_stream` called on a non-paused stream |
| E018 | `ERR_TOKEN_NOT_ALLOWED` | Token is not on the admin allowlist |
| E019 | `ERR_CLIFF_AFTER_STOP` | `cliff_time` is later than `stop_time` |

---

## Employer Transfer

### Q13: Can an employer transfer ownership of a stream to another address?

Yes, via a two-step process to prevent accidental transfers:

1. Current employer calls `propose_employer_transfer(stream_id, new_employer)`.
2. New employer calls `accept_employer_transfer(new_employer, stream_id)`.

Until the new employer accepts, the current employer retains full control. After acceptance, the old employer loses all control and the new employer gains it.

---

## Testnet vs Mainnet

### Q14: What are the differences between testnet and mainnet deployments?

| Aspect | Testnet | Mainnet |
|---|---|---|
| Network passphrase | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| Friendbot funding | Available at `https://friendbot.stellar.org` | Not available — fund from exchange |
| Token contracts | Use testnet SACs or deploy your own test token | Use real asset SACs |
| Ledger close time | ~5 seconds | ~5 seconds |
| Data persistence | Testnet resets periodically | Permanent |
| Contract IDs | Different from mainnet | — |

Always test on testnet before deploying to mainnet. See [docs/testnet.md](testnet.md) for the full testnet deployment guide.

---

### Q15: How do I estimate the fee for a `create_stream` transaction?

Stellar charges a base fee per transaction plus resource fees for CPU, memory, and storage. For a single `create_stream` call, expect approximately **100–500 stroops** in total fees on mainnet under normal network load. Use `stellar transaction simulate` to get an exact fee estimate before submitting.

For batch creation (`create_streams_batch`), one base fee covers all streams in the batch, making it significantly cheaper than N individual calls for N ≥ 2.

---

### Q16: How do I handle the admin nonce in my integration?

Call `admin_nonce()` before any admin operation to get the current nonce, then pass it as the `nonce` argument. The nonce increments after each successful admin call. This prevents replay attacks where a signed admin transaction is submitted more than once.

```typescript
const nonce = await contract.admin_nonce();
await contract.set_min_deposit({ admin, nonce, amount: 50_000n });
```

---

### Q17: Can I query historical stream events off-chain?

Yes. All state changes emit on-chain events that can be indexed by Horizon or a custom indexer. Key event topics:

| Topic | Emitted by |
|---|---|
| `created` | `create_stream`, `create_streams_batch` |
| `withdraw` | `withdraw` |
| `status` | `pause_stream`, `resume_stream`, `cancel_stream` |
| `topup` | `top_up` |
| `paused` | `pause_contract`, `unpause_contract` |
| `emp_prop` | `propose_employer_transfer` |
| `emp_acc` | `accept_employer_transfer` |

See [docs/events.md](events.md) for the full event schema.
