// src/utils/crypto.js

import crypto from 'crypto';

/**
 * Hash a string using SHA-256
 */
export function hashString(str) {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
}

/**
 * Hash with 0x prefix (for blockchain compatibility)
 */
export function hashStringWithPrefix(str) {
  return '0x' + hashString(str);
}

/**
 * Generate commitment hash (answer + salt + gameId)
 */
export function generateCommitmentHash(answer, salt, gameId) {
  const combined = answer + salt + gameId.toString();
  return hashStringWithPrefix(combined);
}

/**
 * Verify commitment
 */
export function verifyCommitment(answer, salt, gameId, expectedHash) {
  const computed = generateCommitmentHash(answer, salt, gameId);
  return computed === expectedHash;
}

/**
 * Generate random salt
 */
export function generateSalt() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}