# @paystream/sdk

TypeScript SDK for the PayStream Soroban contracts on Stellar.

## Install

```bash
npm install @paystream/sdk @stellar/stellar-sdk
# For browser wallet support:
npm install @freighter-api/freighter-api
```

## Usage

### Read-only queries

```ts
import { PayStreamClient } from "@paystream/sdk";
import { Networks } from "@stellar/stellar-sdk";

const client = new PayStreamClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  contractId: "C...",
});

const stream = await client.getStream(0n);
const claimable = await client.claimable(0n);
const count = await client.streamCount();
```

### Create a stream (with Freighter)

```ts
import { PayStreamClient, connectFreighter, freighterSignTransaction } from "@paystream/sdk";
import { Networks } from "@stellar/stellar-sdk";

const client = new PayStreamClient({ rpcUrl, networkPassphrase: Networks.TESTNET, contractId });

const employer = await connectFreighter();
const unsignedXdr = await client.createStream(
  employer,
  "G<EMPLOYEE>",
  "C<TOKEN>",
  1_000_000n,   // deposit (stroops)
  100n,          // rate_per_second
  0n,            // stop_time (0 = indefinite)
  0n,            // cooldown_period
  0n             // cliff_time
);
const signedXdr = await freighterSignTransaction(unsignedXdr, Networks.TESTNET);
const txHash = await client.submitTransaction(signedXdr);
```

### Withdraw

```ts
const employee = await connectFreighter();
const xdr = await client.withdraw(employee, 0n);
const signed = await freighterSignTransaction(xdr, Networks.TESTNET);
await client.submitTransaction(signed);
```

### Real-time claimable polling (#104)

```ts
import { pollClaimable } from "@paystream/sdk";

const handle = pollClaimable(client, 0n, 5000, (amount) => {
  console.log("Claimable:", amount.toString());
});

// Stop polling later:
handle.unsubscribe();
```

## API

| Method | Description |
|---|---|
| `getStream(id)` | Read full stream state |
| `claimable(id)` | Query withdrawable amount now |
| `claimableAt(id, ts)` | Query withdrawable at arbitrary timestamp |
| `streamCount()` | Total streams created |
| `initialize(admin)` | Init contract (admin only) |
| `createStream(...)` | Create a stream, lock deposit |
| `createStreamsBatch(employer, params[])` | Create multiple streams atomically |
| `withdraw(employee, id)` | Withdraw all claimable earnings |
| `topUp(employer, id, amount)` | Add funds to active stream |
| `updateRate(employer, id, rate)` | Update rate of active stream |
| `pauseStream(employer, id)` | Pause accrual |
| `resumeStream(employer, id)` | Resume accrual |
| `cancelStream(employer, id)` | Cancel, pay earned share, refund remainder |
| `submitTransaction(signedXdr)` | Submit a signed transaction and wait |
| `connectFreighter()` | Connect Freighter wallet, return public key |
| `getFreighterPublicKey()` | Get current Freighter public key |
| `freighterSignTransaction(xdr, network)` | Sign XDR with Freighter |
| `isFreighterConnected()` | Check if Freighter is installed and connected |
| `pollClaimable(client, id, ms, cb)` | Poll claimable balance at interval |
