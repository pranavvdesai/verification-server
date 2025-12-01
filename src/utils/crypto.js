

import crypto from 'crypto';

export function hashString(str) {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
}

export function hashStringWithPrefix(str) {
  return '0x' + hashString(str);
}

export function generateCommitmentHash(answer, salt, gameId) {
  const combined = answer + salt + gameId.toString();
  return hashStringWithPrefix(combined);
}

export function verifyCommitment(answer, salt, gameId, expectedHash) {
  const computed = generateCommitmentHash(answer, salt, gameId);
  return computed === expectedHash;
}

export function generateSalt() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}