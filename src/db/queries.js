
import { query } from './pool.js';



export async function getAttempt(attemptId) {
  
  const result = await query(
    'SELECT * FROM attempts WHERE id = $1',
    [attemptId],
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
      verificationData.attestation?.signature || null,
    ],
  );
  return result.rows[0];
}



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
