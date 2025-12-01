// src/services/blockchain.js

import { ethers } from 'ethers';
import { config } from '../config/index.js';
import { CONTRACT_ABI } from '../config/contract-abi.js';

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.initialize();
  }

  initialize() {
    try {
      // Connect to RPC provider
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
      
      console.log(`✅ Connected to RPC: ${config.rpcUrl}`);

      // Create wallet from private key
      this.wallet = new ethers.Wallet(config.oraclePrivateKey, this.provider);
      
      console.log(`✅ Oracle wallet: ${this.wallet.address}`);

      // Load smart contract
      this.contract = new ethers.Contract(
        config.contractAddress,
        CONTRACT_ABI,
        this.wallet
      );
      
      console.log(`✅ Smart contract loaded: ${config.contractAddress}`);

      // Sanity: ensure there is bytecode at the configured address
      this.provider.getCode(config.contractAddress).then((code) => {
        if (!code || code === '0x') {
          console.error('❌ No contract code found at address:', config.contractAddress);
          console.error('   Verify CONTRACT_ADDRESS points to a deployed contract on this network.');
        } else {
          console.log(`✅ Contract code detected (length=${code.length})`);
        }
      }).catch((err) => {
        console.error('❌ Failed to fetch contract code:', err.message);
      });
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get commitment from blockchain
   */
  async getCommitment(contestId, gameId, difficulty) {
    try {
      console.log(`🔍 Fetching commitment: contest=${contestId}, game=${gameId}, difficulty=${difficulty}`);
      
      const commitment = await this.contract.getCommitment(
        contestId,
        gameId,
        difficulty
      );
      
      return {
        commitmentHash: commitment.commitmentHash,
        saltHint: commitment.saltHint,
        gameId: Number(commitment.gameId),
        revealed: commitment.revealed,
        fullSalt: commitment.fullSalt,
        answer: commitment.answer
      };
    } catch (error) {
      console.error('❌ Failed to get commitment:', error.message);
      throw new Error(`Blockchain error: ${error.message}`);
    }
  }

  /**
   * Record verification on blockchain
   */
  async recordVerification(attemptData) {
    try {
      const {
        contestId,
        playerAddress,
        gameId,
        ipfsHash,
        attestationSignature,
        isCorrect
      } = attemptData;

      console.log('📝 Recording verification on blockchain...');
      console.log({
        contestId,
        playerAddress,
        gameId,
        ipfsHash: ipfsHash || 'none',
        isCorrect
      });

      // Estimate gas first
      const gasEstimate = await this.contract.verifyAttempt.estimateGas(
        contestId,
        playerAddress,
        gameId,
        ipfsHash || '',
        attestationSignature || '0x',
        isCorrect
      );

      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);

      // Send transaction
      const tx = await this.contract.verifyAttempt(
        contestId,
        playerAddress,
        gameId,
        ipfsHash || '',
        attestationSignature || '0x',
        isCorrect,
        {
          gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
        }
      );

      console.log(`⏳ Transaction sent: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      console.log(`✅ Transaction confirmed!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'success' : 'failed'
      };
    } catch (error) {
      console.error('❌ Failed to record verification:', error);
      
      // Parse error message for better debugging
      let errorMessage = error.message;
      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
      
      throw new Error(`Blockchain transaction failed: ${errorMessage}`);
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice() {
    const feeData = await this.provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString()
    };
  }

  /**
   * Get network info
   */
  async getNetworkInfo() {
    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();
    
    return {
      chainId: Number(network.chainId),
      name: network.name,
      blockNumber,
      oracleAddress: this.wallet.address
    };
  }

  /**
   * Check if blockchain connection is healthy
   */
  async healthCheck() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const balance = await this.provider.getBalance(this.wallet.address);
      
      return {
        connected: true,
        blockNumber,
        oracleBalance: ethers.formatEther(balance),
        oracleAddress: this.wallet.address
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

export const blockchainService = new BlockchainService();
