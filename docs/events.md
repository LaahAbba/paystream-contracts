# Contract Event Schema

This document describes the stream contract events emitted by the `paystream-contracts` stream contract.
Each event is emitted with a topic and payload fields.

## StreamCreated
- Topic: `(created, stream_id)`
- Fired when a new stream is created by the employer.

Fields:
- `employer` — `Address`
- `employee` — `Address`
- `rate_per_second` — `i128`

Example payload:
```json
{
  "employer": "GABC...",
  "employee": "GDZY...",
  "rate_per_second": 100
}
```

## Withdrawn
- Topic: `(withdraw, stream_id)`
- Fired when an employee withdraws earned tokens.

Fields:
- `employee` — `Address`
- `amount` — `i128`

Example payload:
```json
{
  "employee": "GDZY...",
  "amount": 500
}
```

## Paused
- Topic: `(paused, stream_id)`
- Fired when an employer pauses a stream.

Fields:
- none

Example payload:
```json
{}
```

## Resumed
- Topic: `(resumed, stream_id)`
- Fired when an employer resumes a paused stream.

Fields:
- none

Example payload:
```json
{}
```

## Cancelled
- Topic: `(cancelled, stream_id)`
- Fired when an employer cancels a stream.

Fields:
- none

Example payload:
```json
{}
```

## ToppedUp
- Topic: `(topup, stream_id)`
- Fired when an employer tops up an active stream.

Fields:
- `employer` — `Address`
- `amount` — `i128`

Example payload:
```json
{
  "employer": "GABC...",
  "amount": 1000
}
```

## StreamTransferred
- Topic: `(transferred, stream_id)`
- Fired when an employee transfers stream rights to another address.

Fields:
- `previous_employee` — `Address`
- `new_employee` — `Address`

Example payload:
```json
{
  "previous_employee": "GDZY...",
  "new_employee": "GBRW..."
}
```
