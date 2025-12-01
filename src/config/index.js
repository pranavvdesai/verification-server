// src/config/index.js

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // Blockchain
  rpcUrl: process.env.RPC_URL,
  chainId: parseInt(process.env.CHAIN_ID || '11155111'),
  contractAddress: process.env.CONTRACT_ADDRESS,
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY,
  
  // Game Server
  gameServerUrl: process.env.GAME_SERVER_URL || 'http://localhost:3000',
};

// Validate required config
const requiredEnvVars = [
  'DATABASE_URL',
  'RPC_URL',
  'CONTRACT_ADDRESS',
  'ORACLE_PRIVATE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

console.log('✅ Configuration loaded');
