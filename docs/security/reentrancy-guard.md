# Reentrancy Guard — `withdraw` Function

**Issue:** #269  
**Severity:** Critical  
**Status:** Implemented

---

## Overview

The `withdraw` function transfers tokens to the employee via a cross-contract call to the SEP-41 token contract. In EVM-style environments this creates a reentrancy window. Soroban's host prevents true re-entrant calls today, but the contract implements defence-in-depth via a `locked` boolean flag on the `Stream` struct.

## Implementation

The guard follows the **check-effects-interactions** pattern:

```
1. CHECK  — assert !stream.locked (E003)
2. EFFECT — set stream.locked = true, update withdrawn + last_withdraw_time, save_stream
3. INTERACT — token::transfer(contract → employee)
4. EFFECT — set stream.locked = false, save_stream
```

Relevant code in `contracts/stream/src/lib.rs`:

```rust
assert!(!stream.locked, "{}", ERR_REENTRANT);
stream.locked = true;
save_stream(&env, &stream);

stream.withdrawn = stream.withdrawn.checked_add(amount)...;
stream.last_withdraw_time = now;
if stream.withdrawn >= stream.deposit {
    stream.status = StreamStatus::Exhausted;
}

token_client.transfer(&env.current_contract_address(), &employee, &employee_amount);
stream.locked = false;
save_stream(&env, &stream);
```

## Why This Is Safe

- **State updated before transfer:** `withdrawn` and `last_withdraw_time` are persisted before the token transfer. A second call in the same ledger timestamp will compute `claimable_amount = 0` and return early.
- **Locked flag:** If the host ever allows re-entrant calls, the `locked = true` assertion (E003) will panic the re-entrant invocation.
- **No double-spend:** Unit tests in `test.rs` (`test_double_withdraw_yields_zero`, `test_withdraw_releases_lock`) verify that a second withdraw at the same timestamp returns 0 and that the lock is released after a successful withdraw.

## Error Code

`E003: reentrant withdraw detected` — defined in `types.rs` as `ERR_REENTRANT`.

## Test Coverage

| Test | What it proves |
|---|---|
| `test_double_withdraw_yields_zero` | Second withdraw at same timestamp returns 0; employee balance unchanged |
| `test_withdraw_releases_lock` | `stream.locked` is `false` after a successful withdraw |
