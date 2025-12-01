// src/routes/verification.js

import express from 'express';
import { blockchainService } from '../services/blockchain.js';

const router = express.Router();

// Placeholder verification endpoint; zk flow lives under /api/zk
router.post('/verify', (req, res) => {
  res.status(501).json({
    error: 'Legacy verification endpoint is disabled in this build. Use /api/zk routes.',
  });
});

// Public attestation verification placeholder
router.get('/verify-attestation/:signature', (req, res) => {
  res.status(501).json({
    error: 'Attestation verification not available in this build.',
  });
});

// Health check for blockchain connectivity
router.get('/health', async (req, res) => {
  try {
    const blockchain = await blockchainService.healthCheck();
    res.json({
      status: 'healthy',
      blockchain,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// Basic network info passthrough
router.get('/network-info', async (req, res) => {
  try {
    const info = await blockchainService.getNetworkInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
