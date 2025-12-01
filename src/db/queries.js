// src/db/queries.js
import { query } from './pool.js';

// ============= ATTEMPTS =============

export async function getAttempt(attemptId) {
  // attempts.id is now UUID in the new schema
  const result = await query(
    'SELECT * FROM attempts WHERE id = $1',
    [attemptId],
  );
  return result.rows[0];
}

/**
 * NOTE: This helper still reflects the old verification schema.
 * If you want to use it with the new schema, either:
 *  - delete it, or
 *  - adapt it to write into the new zk_* and verification_metadata columns.
 */
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
      verificationData.attestation?.signature || null,
    ],
  );
  return result.rows[0];
}

// ============= GAME COMMITMENTS (new schema) =============

/**
 * Fetch commitment row for a given (contest_id, game_config_id).
 *
 * New table shape:
 *   id UUID PK,
 *   contest_id UUID,
 *   game_config_id UUID,
 *   commitment_hash VARCHAR(66),
 *   answer_plaintext TEXT,
 *   salt_full VARCHAR(66),
 *   salt_hint VARCHAR(66),
 *   storacha_cid VARCHAR(100),
 *   storacha_url TEXT,
 *   proof_hash VARCHAR(66),
 *   anchor_tx_hash VARCHAR(66),
 *   ...
 */
export async function getCommitment(contestId, gameConfigId) {
  const result = await query(
    `
    SELECT *
    FROM game_commitments
    WHERE contest_id = $1
      AND game_config_id = $2
    `,
    [contestId, gameConfigId],
  );
  return result.rows[0];
}

// ============= CONTEST PARTICIPANTS (wallet lookup) =============

/**
 * Fetch participant to get the wallet_address for anchoring on-chain.
 */
export async function getParticipant(participantId) {
  const result = await query(
    `
    SELECT *
    FROM contest_participants
    WHERE id = $1
    `,
    [participantId],
  );
  return result.rows[0];
}

// ============= CONTEST GAME CONFIGS (canonical game_id lookup) =============

/**
 * Fetch game config to get canonical game_id (used by AI + contract).
 */
export async function getGameConfig(gameConfigId) {
  const result = await query(
    `
    SELECT *
    FROM contest_game_configs
    WHERE id = $1
    `,
    [gameConfigId],
  );
  return result.rows[0];
}

// ============= VERIFICATION LOGS (old) =============

/**
 * NOTE:
 *   The new schema you shared does NOT have verification_logs.
 *   If you still want an audit trail table, either:
 *     - add verification_logs back to the SQL, or
 *     - delete this helper and all usages.
 */
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
      data.errorMessage || null,
    ],
  );
  return result.rows[0];
}
