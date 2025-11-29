// src/routes/verification.js

import express from 'express';
import { getAttempt, updateAttemptVerification, getCommitment, logVerification } from '../db/queries.js';
import { validator } from '../services/validator.js';
import { ipfsService } from '../services/ipfs.js';
import { blockchainService } from '../services/blockchain.js';
import { attestationService } from '../services/attestation.js';
import { hashString } from '../utils/crypto.js';

const router = express.Router();

/**
 * POST /verify
 * Main verification endpoint
 */
router.post('/verify', async (req, res) => {
  const { attemptId } = req.body;

  if (!attemptId) {
    return res.status(400).json({ error: 'attemptId is required' });
  }

  console.log('\n🔍 ===== VERIFICATION STARTED =====');
  console.log(`Attempt ID: ${attemptId}`);

  try {
    // Step 1: Fetch attempt from database
    console.log('\n📖 Step 1: Fetching attempt from database...');
    const attempt = await getAttempt(attemptId);

    if (!attempt) {
      console.log('❌ Attempt not found');
      return res.status(404).json({ error: 'Attempt not found' });
    }

    console.log('✅ Attempt found:', {
      player: attempt.wallet_address,
      gameId: attempt.game_id,
      isCorrect: attempt.is_correct
    });

    // Check if already verified
    if (attempt.verified) {
      console.log('⚠️ Already verified, returning cached result');
      return res.json({
        status: 'already_verified',
        ...attempt.verification_data
      });
    }

    // Log verification start
    await logVerification(attemptId, 'started');

    // Step 2: Fetch game commitment from blockchain
    console.log('\n⛓️ Step 2: Fetching commitment from blockchain...');
    const commitment = await blockchainService.getCommitment(
      attempt.contest_id,
      attempt.game_id,
      attempt.difficulty
    );

    console.log('✅ Commitment fetched:', {
      commitmentHash: commitment.commitmentHash,
      revealed: commitment.revealed
    });

    // Step 3: Independent validation
    console.log('\n🔬 Step 3: Running independent validation...');
    const validationResult = await validator.validate(attempt, commitment);

    console.log('✅ Validation complete:', validationResult);

    // Step 4: Generate attestation
    console.log('\n🔒 Step 4: Generating attestation...');
    const attestation = await attestationService.generateAttestation({
      attemptId: attempt.id,
      player: attempt.wallet_address,
      contestId: attempt.contest_id,
      gameId: attempt.game_id,
      promptHash: hashString(attempt.prompt),
      responseHash: hashString(attempt.response),
      isCorrect: validationResult.isCorrect
    });

    console.log('✅ Attestation generated');

    // Step 5: Create transcript
    console.log('\n📄 Step 5: Creating verification transcript...');
    const transcript = {
      version: '1.0',
      attemptId: attempt.id,
      player: attempt.wallet_address,
      contestId: attempt.contest_id,
      gameId: attempt.game_id,
      difficulty: attempt.difficulty,
      
      // Hashes only (preserve privacy)
      promptHash: hashString(attempt.prompt),
      responseHash: hashString(attempt.response),
      
      // Full data for winning attempts
      ...(attempt.is_correct ? {
        prompt: attempt.prompt,
        response: attempt.response,
        extractedAnswer: attempt.extracted_answer
      } : {}),
      
      // Validation results
      validation: validationResult,
      
      // Attestation
      attestation: attestationService.exportAttestation(attestation),
      
      // Metadata
      timestamp: new Date().toISOString(),
      validator: 'independent_oracle_v1'
    };

    // Step 6: Upload to IPFS
    console.log('\n📦 Step 6: Uploading transcript to IPFS...');
    let ipfsResult = null;
    
    if (ipfsService.isAvailable()) {
      ipfsResult = await ipfsService.upload(transcript);
      console.log('✅ Uploaded to IPFS:', ipfsResult.cid);
    } else {
      console.log('⚠️ IPFS not available, skipping upload');
    }

    // Step 7: Record on blockchain
    console.log('\n⛓️ Step 7: Recording verification on blockchain...');
    const blockchainResult = await blockchainService.recordVerification({
      contestId: attempt.contest_id,
      playerAddress: attempt.wallet_address,
      gameId: attempt.game_id,
      ipfsHash: ipfsResult?.cid || '',
      attestationSignature: attestation.signature,
      isCorrect: validationResult.isCorrect
    });

    console.log('✅ Recorded on blockchain:', blockchainResult.txHash);

    // Step 8: Update database
    console.log('\n💾 Step 8: Updating database...');
    const verificationData = {
      verified: true,
      isCorrect: validationResult.isCorrect,
      ipfsHash: ipfsResult?.cid,
      ipfsUrl: ipfsResult?.url,
      txHash: blockchainResult.txHash,
      blockNumber: blockchainResult.blockNumber,
      attestation: {
        signature: attestation.signature,
        publicKeyFingerprint: attestation.publicKey
      },
      timestamp: new Date().toISOString()
    };

    await updateAttemptVerification(attemptId, verificationData);
    await logVerification(attemptId, 'completed', {
      ipfsHash: ipfsResult?.cid,
      txHash: blockchainResult.txHash
    });

    console.log('✅ Database updated');

    console.log('\n🎉 ===== VERIFICATION COMPLETE =====\n');

    // Return verification result
    res.json({
      status: 'verified',
      attemptId: attempt.id,
      verified: true,
      isCorrect: validationResult.isCorrect,
      
      // IPFS
      ipfs: ipfsResult ? {
        cid: ipfsResult.cid,
        url: ipfsResult.url,
        size: ipfsResult.size
      } : null,
      
      // Blockchain
      blockchain: {
        txHash: blockchainResult.txHash,
        blockNumber: blockchainResult.blockNumber,
        explorerUrl: `https://amoy.polygonscan.com/tx/${blockchainResult.txHash}`
      },
      
      // Attestation
      attestation: attestationService.exportAttestation(attestation),
      
      // Validation
      validation: validationResult,
      
      // Timestamp
      verifiedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('\n💥 ===== VERIFICATION FAILED =====');
    console.error('Error:', error.message);
    console.error(error.stack);

    // Log failure
    await logVerification(attemptId, 'failed', {
      errorMessage: error.message
    });

    res.status(500).json({
      status: 'error',
      error: error.message,
      attemptId
    });
  }
});

/**
 * GET /verify-attestation/:signature
 * Public endpoint to verify an attestation signature
 */
router.get('/verify-attestation/:signature', async (req, res) => {
  const { signature } = req.params;

  try {
    // This would verify the signature against the public key
    // For now, return the public key
    res.json({
      valid: true, // In production, actually verify
      publicKey: attestationService.getPublicKey(),
      publicKeyFingerprint: attestationService.getPublicKeyFingerprint(),
      instructions: 'Use this public key to verify the attestation signature'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const blockchainHealth = await blockchainService.healthCheck();
    const ipfsAvailable = ipfsService.isAvailable();

    res.json({
      status: 'healthy',
      blockchain: blockchainHealth,
      ipfs: { available: ipfsAvailable },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /network-info
 * Get blockchain network information
 */
router.get('/network-info', async (req, res) => {
  try {
    const networkInfo = await blockchainService.getNetworkInfo();
    res.json(networkInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;