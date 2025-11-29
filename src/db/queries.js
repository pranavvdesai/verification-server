// src/db/queries.js

import { query } from './pool.js';

// ============= ATTEMPTS =============

export async function getAttempt(attemptId) {
  const result = await query(
    `SELECT * FROM attempts WHERE id = $1`,
    [attemptId]
  );
  return result.rows[0];
}

export async function updateAttemptVerification(attemptId, verificationData) {
  const result = await query(
    `UPDATE attempts 
     SET verified = TRUE,
         verification_data = $2,
         ipfs_hash = $3,
         blockchain_tx_hash = $4,
         tee_attestation = $5,
         verified_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      attemptId,
      JSON.stringify(verificationData),
      verificationData.ipfsHash || null,
      verificationData.txHash || null,
      verificationData.attestation?.signature || null
    ]
  );
  return result.rows[0];
}

// ============= GAME COMMITMENTS =============

export async function getCommitment(contestId, gameId, difficulty) {
  const result = await query(
    `SELECT * FROM game_commitments 
     WHERE contest_id = $1 AND game_id = $2 AND difficulty = $3`,
    [contestId, gameId, difficulty]
  );
  return result.rows[0];
}

// ============= VERIFICATION LOGS =============

export async function logVerification(attemptId, status, data = {}) {
  const result = await query(
    `INSERT INTO verification_logs (
      attempt_id, verification_status, ipfs_hash, tx_hash, error_message
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      attemptId,
      status,
      data.ipfsHash || null,
      data.txHash || null,
      data.errorMessage || null
    ]
  );
  return result.rows[0];
}