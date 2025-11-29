// src/config/contract-abi.js

// Simplified ABI - you'll replace this with your actual contract ABI
export const CONTRACT_ABI = [
  // Get commitment for a game
  {
    "inputs": [
      { "name": "contestId", "type": "uint256" },
      { "name": "gameId", "type": "uint256" },
      { "name": "difficulty", "type": "string" }
    ],
    "name": "getCommitment",
    "outputs": [
      {
        "components": [
          { "name": "commitmentHash", "type": "bytes32" },
          { "name": "saltHint", "type": "bytes32" },
          { "name": "gameId", "type": "uint256" },
          { "name": "revealed", "type": "bool" },
          { "name": "fullSalt", "type": "bytes32" },
          { "name": "answer", "type": "string" }
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Verify an attempt
  {
    "inputs": [
      { "name": "contestId", "type": "uint256" },
      { "name": "player", "type": "address" },
      { "name": "gameId", "type": "uint256" },
      { "name": "ipfsHash", "type": "string" },
      { "name": "attestationSignature", "type": "bytes" },
      { "name": "isCorrect", "type": "bool" }
    ],
    "name": "verifyAttempt",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "player", "type": "address" },
      { "indexed": false, "name": "attemptId", "type": "uint256" },
      { "indexed": false, "name": "correct", "type": "bool" }
    ],
    "name": "AttemptVerified",
    "type": "event"
  }
];