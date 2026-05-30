/**
 * PayStream SDK Example — using the @paystream/sdk package.
 * 
 * This example demonstrates:
 * 1. Connecting to the network via PayStreamClient
 * 2. Creating a stream with a cliff period
 * 3. Querying stream status and claimable amount
 * 4. Withdrawing tokens
 */

const { Keypair, Networks } = require("@stellar/stellar-sdk");
const { PayStreamClient } = require("@paystream/sdk");

// 1. Configuration
const CONFIG = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  contractId: process.env.STREAM_CONTRACT_ID || "CD...",
  tokenContractId: process.env.TOKEN_CONTRACT_ID || "CA...",
};

// 2. Setup Identities
const employer = Keypair.fromSecret(process.env.EMPLOYER_SECRET || "S...");
const employee = Keypair.fromPublicKey(process.env.EMPLOYEE_PUBLIC || "G...");

const client = new PayStreamClient({
  rpcUrl: CONFIG.rpcUrl,
  networkPassphrase: CONFIG.networkPassphrase,
  contractId: CONFIG.contractId,
});

/**
 * Sign and submit a transaction prepared by the SDK client.
 */
async function signAndSubmit(unsignedXdr, signerKeypair) {
  // In a browser, you would use freighter.signTransaction(unsignedXdr)
  // In Node.js, we use the stellar-sdk to sign the XDR
  const { TransactionBuilder } = require("@stellar/stellar-sdk");
  const tx = TransactionBuilder.fromXDR(unsignedXdr, CONFIG.networkPassphrase);
  tx.sign(signerKeypair);
  
  console.log("Submitting transaction...");
  const hash = await client.submitTransaction(tx.toXDR());
  console.log("Transaction confirmed:", hash);
  return hash;
}

async function example() {
  try {
    console.log("--- PayStream SDK Example ---");

    // 3. Create a stream
    // deposit: 100 XLM (1000,000,000 stroops)
    // rate: 0.01 XLM/sec (100,000 stroops/sec)
    // stopTime: 0 (indefinite)
    // cooldown: 3600s (1 hour)
    // cliff: 1 day from now
    const deposit = 1000000000n;
    const rate = 100000n;
    const stopTime = 0n;
    const cooldown = 3600n;
    const cliff = BigInt(Math.floor(Date.now() / 1000) + 86400);

    console.log("Preparing create_stream transaction...");
    const createXdr = await client.createStream(
      employer.publicKey(),
      employee.publicKey(),
      CONFIG.tokenContractId,
      deposit,
      rate,
      stopTime,
      cooldown,
      cliff
    );

    await signAndSubmit(createXdr, employer);

    // 4. Query total streams
    const count = await client.streamCount();
    const streamId = count - 1n; // Assuming we just created the latest stream
    console.log(`Latest Stream ID: ${streamId}`);

    // 5. Get stream details
    const stream = await client.getStream(streamId);
    console.log("Stream Details:", {
      status: stream.status,
      employer: stream.employer,
      employee: stream.employee,
      deposit: stream.deposit.toString(),
      cliffTime: new Date(Number(stream.cliffTime) * 1000).toLocaleString(),
    });

    // 6. Check claimable amount
    const claimable = await client.claimable(streamId);
    console.log(`Claimable Amount: ${claimable} stroops`);

    // 7. Employee withdraws (if any claimable)
    if (claimable > 0n) {
      console.log("Preparing withdraw transaction...");
      const withdrawXdr = await client.withdraw(employee.publicKey(), streamId);
      await signAndSubmit(withdrawXdr, employee);
    } else {
      console.log("Nothing to withdraw yet (cliff period or no earnings).");
    }

    console.log("--- Example Completed ---");
  } catch (err) {
    console.error("Example failed:", err);
  }
}

example();
