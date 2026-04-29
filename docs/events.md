# Stream Contract Event Reference

This reference documents all on-chain events emitted by the PayStream contract, including event topics, data fields, and example JSON payloads.

## Event structure

Soroban events are published with a topic tuple and an event payload. For PayStream events, the topic is typically:

- `(symbol_short!("event_name"), stream_id)` for stream-specific events
- `(symbol_short!("paused"),)` for contract-level pause changes

The event data payload is a tuple or single value depending on event type.

## Events

### `created`

Emitted when a new salary stream is created.

- Topic: `("created", stream_id)`
- Data: `(employer_address, employee_address, rate_per_second)`

```json
{
  "topic": ["created", 1],
  "data": ["G...EMPLOYER...", "G...EMPLOYEE...", 10]
}
```

---

### `withdraw`

Emitted when an employee withdraws claimable earnings.

- Topic: `("withdraw", stream_id)`
- Data: `(employee_address, amount)`

```json
{
  "topic": ["withdraw", 1],
  "data": ["G...EMPLOYEE...", 2000]
}
```

---

### `status`

Emitted when a stream's status changes (cancelled).

- Topic: `("status", stream_id)`
- Data: `StreamStatus`

`StreamStatus` values: `Active`, `Paused`, `Cancelled`, `Exhausted`

```json
{
  "topic": ["status", 1],
  "data": "Cancelled"
}
```

---

### `topup`

Emitted when an employer tops up a stream's deposit.

- Topic: `("topup", stream_id)`
- Data: `(employer_address, amount)`

```json
{
  "topic": ["topup", 1],
  "data": ["G...EMPLOYER...", 5000]
}
```

---

### `paused` (stream-level)

Emitted when an employer pauses a specific stream.

- Topic: `("paused", stream_id)`
- Data: `(employer_address, employee_address, paused_at)`

```json
{
  "topic": ["paused", 1],
  "data": ["G...EMPLOYER...", "G...EMPLOYEE...", 1714000000]
}
```

---

### `resumed`

Emitted when an employer resumes a paused stream.

- Topic: `("resumed", stream_id)`
- Data: `(employer_address, employee_address, resumed_at)`

```json
{
  "topic": ["resumed", 1],
  "data": ["G...EMPLOYER...", "G...EMPLOYEE...", 1714003600]
}
```

---

### `paused` (contract-level)

Emitted by `pause_contract` and `unpause_contract`. Does not include a stream ID.

- Topic: `("paused",)`
- Data: `bool` — `true` when paused, `false` when unpaused

```json
{
  "topic": ["paused"],
  "data": true
}
```

---

### `nearexhst`

Emitted when a stream's remaining deposit falls below a warning threshold (7 days or 1 day of streaming at the current rate).

- Topic: `("nearexhst", stream_id)`
- Data: `(employer_address, threshold_days)`

`threshold_days` is `7` or `1`.

```json
{
  "topic": ["nearexhst", 1],
  "data": ["G...EMPLOYER...", 7]
}
```

---

### `ratechng`

Emitted when an employer updates the `rate_per_second` of an active stream.

- Topic: `("ratechng", stream_id)`
- Data: `(old_rate, new_rate)`

```json
{
  "topic": ["ratechng", 1],
  "data": [10, 15]
}
```

---

### `emp_prop`

Emitted when an employer proposes a two-step ownership transfer.

- Topic: `("emp_prop", stream_id)`
- Data: `(old_employer_address, new_employer_address)`

```json
{
  "topic": ["emp_prop", 1],
  "data": ["G...OLD_EMPLOYER...", "G...NEW_EMPLOYER..."]
}
```

---

### `emp_acc`

Emitted when the new employer accepts a stream ownership transfer.

- Topic: `("emp_acc", stream_id)`
- Data: `(old_employer_address, new_employer_address)`

```json
{
  "topic": ["emp_acc", 1],
  "data": ["G...OLD_EMPLOYER...", "G...NEW_EMPLOYER..."]
}
```

---

### `propcreat`

Emitted when a governance proposal is created.

- Topic: `("propcreat", proposal_id)`
- Data: `proposal_id`

```json
{
  "topic": ["propcreat", 1],
  "data": 1
}
```

---

### `propexec`

Emitted when a governance proposal is executed after the timelock.

- Topic: `("propexec", proposal_id)`
- Data: `proposal_id`

```json
{
  "topic": ["propexec", 1],
  "data": 1
}
```

---

## Notes

- Event topics are stable symbols and should be indexed by off-chain listeners.
- `stream_id` identifies the stream for stream-specific lifecycle events.
- The contract-level `paused` event has no stream ID in its topic.
- See [docs/indexer.md](indexer.md) for a guide on setting up an event indexer.
