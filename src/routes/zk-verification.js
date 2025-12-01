// src/routes/zk-verification.js
import express from 'express';
import { zkProver } from '../services/zk-prover.js';
import { storachaService } from '../services/storacha.js';
import {
  getAttempt,
  getCommitment,
  getParticipant,
  getGameConfig,
} from '../db/queries.js';
import { blockchainService } from '../services/blockchain.js';
import { query } from '../db/pool.js';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { config } from '../config/index.js';

const router = express.Router();
const EXPLORER_BASE_URL =
  process.env.EXPLORER_BASE_URL || 'https://sepolia.etherscan.io/tx/';

/**
 * Convert UUID string to bytes32 hex (0x-prefixed).
 */
function uuidToBytes32(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID hex length: ${hex.length}`);
  }
  return '0x' + hex.padStart(64, '0');
}

/**
 * Log chain context before sending transactions.
 */
async function logChainContext(label) {
  const network = await blockchainService.provider.getNetwork();
  console.log(`[Chain] ${label}`);
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   Contract: ${blockchainService.contract.target}`);
  console.log(`   Signer: ${blockchainService.wallet.address}`);
  console.log(`   Network: ${network.name} (${network.chainId})`);
  return network;
}

async function logReceipt(tx, label) {
  const receipt = await tx.wait();
  console.log(`[Chain] ${label} receipt`, {
    hash: receipt.hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed?.toString(),
    from: receipt.from,
    to: receipt.to,
    cumulativeGasUsed: receipt.cumulativeGasUsed?.toString(),
    logs: receipt.logs?.length,
  });
  return receipt;
}

/**
 * POST /create-commitment
 * Generate ZK proof that answer exists (Contest Creation)
 *
 * Body:
 *  - answer        (string)   required
 *  - contestId     (uuid)     required
 *  - gameConfigId  (uuid)     required  ← maps to contest_game_configs.id
 *  - gameId        (int)      optional  ← canonical gameId, used on-chain / for logging
 *  - difficulty    (string)   optional  ← for metadata only (schema stores it on game_config)
 */
router.post('/create-commitment', async (req, res) => {
  const { answer, gameId, contestId, gameConfigId, difficulty } = req.body;

  if (!answer || !contestId || !gameConfigId) {
    return res.status(400).json({
      error: 'answer, contestId and gameConfigId are required',
    });
  }

  try {
    console.log('\n🎮 ===== CREATING ZK COMMITMENT =====');
    console.log(
      `Contest: ${contestId}, gameConfigId: ${gameConfigId}, gameId: ${gameId}, difficulty: ${difficulty}`,
    );

    // 1. Generate random salt
    const salt = '0x' + crypto.randomBytes(32).toString('hex');

    // 2. Generate ZK proof
    console.log('\n📐 Generating ZK proof (existence)...');
    const proofResult = await zkProver.proveAnswerExists(answer, salt);

    // 2.1 Verify proof locally
    const existenceValid = await zkProver.verifyProof(
      proofResult.proof,
      'existence',
    );
    if (!existenceValid) {
      throw new Error('Internal ZK verification failed for existence proof');
    }

    console.log(`✅ Proof generated in ${proofResult.provingTime}ms`);

    // 3. Create commitment package (for Storacha)
    const commitmentPackage = {
      version: '1.0',
      type: 'answer_existence',
      contestId,
      proof: proofResult.proofHex,
      publicInputs: {
        commitmentHash: proofResult.commitmentHash,
      },
      metadata: {
        circuit: 'answer_existence',
        backend: 'UltraHonk',
        proverVersion: '1.0.0',
        timestamp: new Date().toISOString(),
      },
    };

    // 4. Upload to Storacha
    console.log('\n📦 Uploading commitment package to Storacha...');
    const storachaResult = await storachaService.uploadJSON(
      commitmentPackage,
      `commitment-${contestId}-gamecfg-${gameConfigId}.json`,
    );

    console.log(`✅ Uploaded: ${storachaResult.url}`);

    // 5. Compute proof hash (for DB + chain)
    const proofHash = ethers.keccak256(proofResult.proofHex);

    const saltHint = crypto
      .createHash('sha256')
      .update(salt)
      .digest('hex');

    // 6. Store in database (game_commitments – new schema)
    await query(
      `
      INSERT INTO game_commitments (
        contest_id,
        game_config_id,
        commitment_hash,
        answer_plaintext,
        salt_full,
        salt_hint,
        storacha_cid,
        storacha_url,
        proof_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (contest_id, game_config_id) DO UPDATE
        SET commitment_hash = EXCLUDED.commitment_hash,
            answer_plaintext = EXCLUDED.answer_plaintext,
            salt_full = EXCLUDED.salt_full,
            salt_hint = EXCLUDED.salt_hint,
            storacha_cid = EXCLUDED.storacha_cid,
            storacha_url = EXCLUDED.storacha_url,
            proof_hash = EXCLUDED.proof_hash
      `,
      [
        contestId,
        gameConfigId,
        proofResult.commitmentHash,
        answer,
        salt,
        saltHint,
        storachaResult.cid,
        storachaResult.url,
        proofHash,
      ],
    );

    // 7. Anchor to blockchain
    console.log('\n⛓️ Anchoring commitment to blockchain...');
    await logChainContext('anchorProof (commitment)');
    // For commitments we pass attemptId = 0 on-chain
    const tx = await blockchainService.contract.anchorProof(
      uuidToBytes32(contestId),
      gameId ?? 0,
      ethers.ZeroAddress,
      0,
      proofHash,
      proofResult.commitmentHash,
      ethers.ZeroHash,
      false,
      storachaResult.cid ?? '',
    );

    console.log('[Chain] anchorProof (commitment) tx response:', {
      hash: tx.hash,
      to: tx.to,
      nonce: tx.nonce,
      chainId: tx.chainId,
    });

    const receipt = await logReceipt(tx, 'anchorProof (commitment)');
    console.log(`✅ Anchored: ${tx.hash} (status=${receipt.status})`);

    // 8. Optionally, store anchor_tx_hash on the commitment row
    await query(
      `
      UPDATE game_commitments
      SET anchor_tx_hash = $1
      WHERE contest_id = $2 AND game_config_id = $3
      `,
      [tx.hash, contestId, gameConfigId],
    );

    res.json({
      success: true,
      commitment: {
        commitmentHash: proofResult.commitmentHash,
        salt,
        storacha: storachaResult,
        proofHash,
      },
      blockchain: {
        txHash: tx.hash,
        explorerUrl: `${EXPLORER_BASE_URL}${tx.hash}`,
      },
      provingTime: proofResult.provingTime,
    });
  } catch (error) {
    console.error('❌ Commitment creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify-response
 * User-initiated verification of ANY response (win or fail)
 *
 * Body:
 *  - attemptId   (uuid, attempts.id)     required
 *  - userAnswer  (string)               optional (falls back to submitted_answer if missing)
 */
router.post('/verify-response', async (req, res) => {
  const { attemptId, userAnswer } = req.body;

  if (!attemptId) {
    return res.status(400).json({ error: 'attemptId required' });
  }

  const attemptIdStr = String(attemptId);

  try {
    console.log('\n🔍 ===== USER VERIFICATION REQUEST =====');
    console.log(`Attempt ID (UUID): ${attemptIdStr}`);

    // 1. Fetch attempt (new schema: attempts with uuid PK)
    const attempt = await getAttempt(attemptIdStr);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    console.log('📖 Found attempt:', {
      id: attempt.id,
      contestId: attempt.contest_id,
      participantId: attempt.participant_id,
      gameConfigId: attempt.game_config_id,
      attemptIndex: attempt.attempt_index,
    });

    // 2. Fetch participant → wallet_address
    const participant = await getParticipant(attempt.participant_id);
    if (!participant) {
      return res.status(404).json({ error: 'Contest participant not found' });
    }

    // 3. Fetch game config → canonical game_id (used on-chain + logging)
    const gameConfig = await getGameConfig(attempt.game_config_id);
    if (!gameConfig) {
      return res.status(404).json({ error: 'Game config not found' });
    }

    // 4. Fetch commitment by (contest_id, game_config_id)
    const commitment = await getCommitment(
      attempt.contest_id,
      attempt.game_config_id,
    );

    if (!commitment) {
      return res.status(404).json({ error: 'Commitment not found' });
    }

    console.log('🔐 Secret answer & salt loaded from DB (game_commitments)');

    const effectiveUserAnswer =
      userAnswer ?? attempt.submitted_answer ?? '';

    // 5. Generate ZK comparison proof
    console.log('\n📐 Generating ZK comparison proof...');

    const proofResult = await zkProver.proveAnswerComparison(
      effectiveUserAnswer,
      commitment.answer_plaintext,
      commitment.salt_full,
    );

    // 5.1 Verify proof internally
    const comparisonValid = await zkProver.verifyProof(
      proofResult.proof,
      'comparison',
    );
    if (!comparisonValid) {
      throw new Error('Internal ZK verification failed for comparison proof');
    }

    console.log(
      `✅ Proof generated: ${proofResult.result.toUpperCase()} (time: ${proofResult.provingTime}ms)`,
    );

    const matches = proofResult.result === 'correct';

    // 6. Create verification package (for Storacha)
    const verificationPackage = {
      version: '1.0',
      type: 'answer_verification',
      attemptId: attemptIdStr,
      contestId: attempt.contest_id,
      playerWallet: participant.wallet_address,
      proof: proofResult.proofHex,
      publicInputs: {
        commitmentHash: proofResult.commitmentHash,
        userAnswerHash: proofResult.userAnswerHash,
        matches,
      },
      result: proofResult.result,
      metadata: {
        circuit: 'answer_comparison',
        backend: 'UltraHonk',
        proverVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        provingTime: proofResult.provingTime,
      },
    };

    // 7. Upload to Storacha
    console.log('\n📦 Uploading verification package to Storacha...');
    const storachaResult = await storachaService.uploadJSON(
      verificationPackage,
      `verification-${attemptIdStr}.json`,
    );
    console.log(`✅ Uploaded: ${storachaResult.url}`);

    // 8. Compute proof hash
    const proofHash = ethers.keccak256(proofResult.proofHex);

    // On-chain attempt ID: use attempt_index (integer per (participant, game_config))
    const onchainAttemptId = attempt.attempt_index;

    // 9. Anchor to blockchain
    console.log('\n⛓️ Anchoring verification to blockchain...');
    await logChainContext('anchorProof (verification)');
    const tx = await blockchainService.contract.anchorProof(
      uuidToBytes32(attempt.contest_id),
      gameConfig.game_id,
      participant.wallet_address,
      onchainAttemptId,
      proofHash,
      proofResult.commitmentHash,
      proofResult.userAnswerHash,
      matches,
      storachaResult.cid ?? '',
    );

    console.log('[Chain] anchorProof (verification) tx response:', {
      hash: tx.hash,
      to: tx.to,
      nonce: tx.nonce,
      chainId: tx.chainId,
    });

    const receipt = await logReceipt(tx, 'anchorProof (verification)');
    console.log(`✅ Anchored: ${tx.hash} (status=${receipt.status})`);

    // 10. Update attempts row with new ZK fields (new schema)
    await query(
      `
      UPDATE attempts
      SET
        verified              = TRUE,
        zk_matches            = $1,
        zk_commitment_hash    = $2,
        zk_user_answer_hash   = $3,
        zk_proof_hash         = $4,
        zk_ipfs_cid           = $5,
        anchor_id             = $6,
        anchor_tx_hash        = $7,
        verification_metadata = $8,
        verified_at           = NOW()
      WHERE id = $9
      `,
      [
        matches,
        proofResult.commitmentHash,
        proofResult.userAnswerHash,
        proofHash,
        storachaResult.cid,
        onchainAttemptId,
        tx.hash,
        JSON.stringify(verificationPackage),
        attemptIdStr,
      ],
    );

    console.log('✅ Attempts table updated with verification result');

    // 11. Return result to client
    res.json({
      verified: true,
      attemptId: attemptIdStr,
      contestId: attempt.contest_id,
      participantId: attempt.participant_id,
      gameConfigId: attempt.game_config_id,
      gameId: gameConfig.game_id,
      result: proofResult.result,
      proof: {
        storacha: {
          cid: storachaResult.cid,
          url: storachaResult.url,
          size: storachaResult.size,
        },
        proofHash,
        blockchain: {
          txHash: tx.hash,
          explorerUrl: `${EXPLORER_BASE_URL}${tx.hash}`,
          anchorId: onchainAttemptId,
        },
      },
      publicInputs: proofResult.publicInputs,
      message: matches
        ? '✅ Your answer is CORRECT! (Cryptographically proven)'
        : '❌ Your answer is INCORRECT (Cryptographically proven)',
      transparency: {
        userAnswerHash: proofResult.userAnswerHash,
        commitmentHash: proofResult.commitmentHash,
        note: 'Full ZK proof stored on Storacha (Web3.Storage-compatible)',
      },
      provingTime: proofResult.provingTime,
    });
  } catch (error) {
    console.error('❌ Verification failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /proof/:cid
 * Retrieve proof from Storacha
 */
router.get('/proof/:cid', async (req, res) => {
  const { cid } = req.params;

  try {
    const proof = await storachaService.retrieveJSON(cid);

    res.json({
      success: true,
      proof,
      storachaUrl: `https://${cid}.ipfs.w3s.link`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
