# Multi-Sig Employer Accounts

PayStream stream operations work natively with multi-sig Stellar accounts as the employer. No contract changes are required — Soroban's auth framework handles threshold signature collection transparently.

## How it works

Every employer operation (`create_stream`, `top_up`, `pause_stream`, `resume_stream`, `cancel_stream`, `update_rate`, `propose_employer_transfer`) calls `employer.require_auth()`. When the employer address is a Stellar account with a multi-sig policy, the Soroban host collects signatures from the account's signers and verifies the threshold before executing the operation.

The contract stores the employer's `Address` (the multi-sig account address) — not individual signer keys. All on-chain records, events, and stream ownership refer to the account address.

## Setting up a 2-of-3 multi-sig employer on testnet

### 1. Create the employer account

```bash
stellar keys generate employer-multisig --network testnet
stellar keys generate signer-a --network testnet
stellar keys generate signer-b --network testnet
stellar keys generate signer-c --network testnet

# Fund the employer account
stellar account fund $(stellar keys address employer-multisig) --network testnet
```

### 2. Configure the multi-sig threshold

Set the medium threshold to 2 and add three signers each with weight 1:

```bash
EMPLOYER=$(stellar keys address employer-multisig)
SIGNER_A=$(stellar keys address signer-a)
SIGNER_B=$(stellar keys address signer-b)
SIGNER_C=$(stellar keys address signer-c)

stellar tx new set-options \
  --source-account $EMPLOYER \
  --med-threshold 2 \
  --signer "$SIGNER_A:1" \
  --signer "$SIGNER_B:1" \
  --signer "$SIGNER_C:1" \
  --network testnet \
  --sign-with-key employer-multisig
```

### 3. Create a stream from the multi-sig employer

Any two of the three signers must sign the transaction. Build and sign with two signers:

```bash
STREAM_CONTRACT=<YOUR_STREAM_CONTRACT_ID>
TOKEN=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5  # testnet USDC
EMPLOYEE=<EMPLOYEE_ADDRESS>

# Build the transaction (unsigned)
stellar contract invoke \
  --id $STREAM_CONTRACT \
  --source $EMPLOYER \
  --network testnet \
  --build-only \
  -- create_stream \
  --employer $EMPLOYER \
  --employee $EMPLOYEE \
  --token_address $TOKEN \
  --deposit 3600000000 \
  --rate_per_second 1000000 \
  --stop_time 0 \
  --cooldown_period 0 \
  --cliff_time 0 \
  > tx.xdr

# Sign with signer-a
stellar tx sign tx.xdr --sign-with-key signer-a --network testnet > tx-signed-a.xdr

# Sign with signer-b (2-of-3 threshold met)
stellar tx sign tx-signed-a.xdr --sign-with-key signer-b --network testnet > tx-signed-ab.xdr

# Submit
stellar tx submit tx-signed-ab.xdr --network testnet
```

### 4. Subsequent operations

All other employer operations (`top_up`, `pause_stream`, `cancel_stream`, etc.) follow the same pattern: build the transaction, collect signatures from any 2 of the 3 signers, submit.

## JavaScript example

```js
import { Contract, TransactionBuilder, Networks, Keypair, Account } from "@stellar/stellar-sdk";

const signerA = Keypair.fromSecret(process.env.SIGNER_A_SECRET);
const signerB = Keypair.fromSecret(process.env.SIGNER_B_SECRET);
const employerAddress = process.env.EMPLOYER_ADDRESS;

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const account = await server.loadAccount(employerAddress);

const tx = new TransactionBuilder(account, {
  fee: "100",
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call("top_up", ...) // build your operation
  )
  .setTimeout(30)
  .build();

// Sign with 2 of 3 signers
tx.sign(signerA);
tx.sign(signerB);

await server.submitTransaction(tx);
```

## Testing 2-of-3 multi-sig

The stream contract test suite includes `contracts/stream/src/multisig_tests.rs` which covers:

- `create_stream` with a multi-sig employer
- `top_up`, `pause_stream`, `resume_stream`, `cancel_stream`, `update_rate`
- `propose_employer_transfer` / `accept_employer_transfer`
- `create_streams_batch`
- Explicit 2-of-3 auth structure using `mock_auths` with two signers

Run the tests:

```bash
cargo test -p paystream-stream multisig
```

## Security considerations

- The multi-sig threshold applies to **all** employer operations, including cancellation and fund withdrawal. Ensure your threshold policy matches your security requirements.
- Losing access to enough signers to meet the threshold will lock the employer out of stream management. Keep signer keys in separate secure locations.
- The `propose_employer_transfer` / `accept_employer_transfer` flow allows migrating stream ownership to a new employer address (including a new multi-sig account) without disrupting the stream.
- Consider using a higher threshold (e.g., 3-of-5) for mainnet deployments managing large deposits.
