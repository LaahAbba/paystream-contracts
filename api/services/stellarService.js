/**
 * Stellar/Soroban Service
 * Handles interactions with Stellar network and smart contracts
 */

const { Server, Networks, TransactionBuilder, BASE_FEE } = require('stellar-sdk');
const { xdr, SorobanRpc } = require('soroban-client');

class StellarService {
  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'testnet';
    this.serverUrl = this.network === 'mainnet' 
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
    this.sorobanRpcUrl = this.network === 'mainnet'
      ? 'https://rpc.mainnet.stellar.org'
      : 'https://soroban-testnet.stellar.org';
    
    this.server = new Server(this.serverUrl);
    this.rpc = new SorobanRpc.Server(this.sorobanRpcUrl, { allowHttp: false });
    
    this.streamContractId = process.env.STREAM_CONTRACT_ID;
    this.tokenContractId = process.env.TOKEN_CONTRACT_ID;
  }

  /**
   * Get network passphrase for transaction building
   */
  getNetworkPassphrase() {
    return this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  /**
   * Build and submit a transaction to a smart contract
   */
  async submitContractTransaction({
    sourceKey,
    contractId,
    functionName,
    args = [],
    memo = null
  }) {
    try {
      const sourceAccount = await this.server.loadAccount(sourceKey);
      const contract = new this.rpc.Contract(contractId);

      // Build the transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      })
        .addOperation(contract.call(functionName, ...args))
        .setTimeout(30)
        .build();

      // Simulate the transaction
      const simResult = await this.rpc.simulateTransaction(transaction);
      
      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      // Prepare the transaction for submission
      const preparedTx = SorobanRpc.assembleTransaction(transaction, simResult).build();

      // Sign the transaction (in a real implementation, this would be done by the client)
      // For now, we'll assume the transaction is pre-signed or we have a signing mechanism
      
      // Submit the transaction
      const result = await this.rpc.sendTransaction(preparedTx);
      
      if (result.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${result.status}`);
      }

      // Wait for transaction confirmation
      const txResult = await this.rpc.getTransaction(result.hash);
      
      if (txResult.status !== 'SUCCESS') {
        throw new Error(`Transaction not successful: ${txResult.status}`);
      }

      return {
        hash: result.hash,
        status: txResult.status,
        result: txResult.returnValue,
      };

    } catch (error) {
      console.error('Contract transaction error:', error);
      throw new Error(`Contract execution failed: ${error.message}`);
    }
  }

  /**
   * Call a read-only contract method
   */
  async callContractMethod({
    contractId,
    functionName,
    args = []
  }) {
    try {
      const contract = new this.rpc.Contract(contractId);
      
      const result = await this.rpc.simulateTransaction(
        new TransactionBuilder(
          new this.rpc.Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '1'),
          {
            fee: BASE_FEE,
            networkPassphrase: this.getNetworkPassphrase(),
          }
        )
          .addOperation(contract.call(functionName, ...args))
          .setTimeout(30)
          .build()
      );

      if (SorobanRpc.Api.isSimulationError(result)) {
        throw new Error(`Simulation failed: ${result.error}`);
      }

      return result.result;

    } catch (error) {
      console.error('Contract method call error:', error);
      throw new Error(`Contract method call failed: ${error.message}`);
    }
  }

  /**
   * Validate Stellar address format
   */
  validateAddress(address) {
    try {
      // Basic validation for Stellar public keys
      if (typeof address !== 'string') return false;
      if (!address.startsWith('G')) return false;
      if (address.length !== 56) return false;
      if (!/^[GABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz234567]+$/.test(address)) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate contract ID format
   */
  validateContractId(contractId) {
    try {
      if (typeof contractId !== 'string') return false;
      if (!contractId.startsWith('C')) return false;
      if (contractId.length !== 63) return false;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccount(accountId) {
    try {
      const account = await this.server.loadAccount(accountId);
      return {
        accountId: account.accountId(),
        sequence: account.sequenceNumber(),
        balances: account.balances(),
        flags: account.flags(),
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error('Account not found');
      }
      throw new Error(`Failed to load account: ${error.message}`);
    }
  }

  /**
   * Get SEP-41 token metadata (name, symbol, decimals) with 1-hour in-memory cache
   */
  async getTokenMetadata(contractId) {
    if (!this._metadataCache) this._metadataCache = new Map();

    const cached = this._metadataCache.get(contractId);
    if (cached && Date.now() - cached.ts < 3600_000) {
      return cached.data;
    }

    const [name, symbol, decimals] = await Promise.all([
      this.callContractMethod({ contractId, functionName: 'name', args: [] }),
      this.callContractMethod({ contractId, functionName: 'symbol', args: [] }),
      this.callContractMethod({ contractId, functionName: 'decimals', args: [] }),
    ]);

    const data = { name, symbol, decimals };
    this._metadataCache.set(contractId, { data, ts: Date.now() });
    return data;
  }

  /**
   * Get token balance for an account
   */
  async getTokenBalance(tokenContractId, accountId) {
    try {
      const result = await this.callContractMethod({
        contractId: tokenContractId,
        functionName: 'balance',
        args: [new this.rpc.Address(accountId)],
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }
}

module.exports = new StellarService();
