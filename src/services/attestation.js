// // src/services/attestation.js

// import crypto from 'crypto';
// import { hashString } from '../utils/crypto.js';

// /**
//  * Attestation Service
//  * Generates cryptographic proofs for verification
//  * 
//  * In production, this would use TEE (Trusted Execution Environment)
//  * For hackathon, we use digital signatures
//  */

// class AttestationService {
//   constructor() {
//     // Generate or load oracle keypair
//     // In production, this would be stored securely
//     this.generateKeypair();
//   }

//   generateKeypair() {
//     // For demo: generate RSA keypair
//     // In production: use TEE or HSM-stored keys
//     const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
//       modulusLength: 2048,
//       publicKeyEncoding: {
//         type: 'spki',
//         format: 'pem'
//       },
//       privateKeyEncoding: {
//         type: 'pkcs8',
//         format: 'pem'
//       }
//     });

//     this.publicKey = publicKey;
//     this.privateKey = privateKey;
    
//     console.log('🔑 Attestation keypair generated');
//   }

//   /**
//    * Generate attestation for a verification
//    */
//   async generateAttestation(data) {
//     try {
//       const attestationData = {
//         version: '1.0',
//         timestamp: new Date().toISOString(),
//         validator: 'independent_oracle',
//         data: {
//           attemptId: data.attemptId,
//           player: data.player,
//           contestId: data.contestId,
//           gameId: data.gameId,
//           promptHash: data.promptHash,
//           responseHash: data.responseHash,
//           isCorrect: data.isCorrect,
//           validationMethod: 'independent_regex_extraction'
//         }
//       };

//       // Create canonical JSON string
//       const canonical = this.canonicalJSON(attestationData);
      
//       // Hash the data
//       const dataHash = hashString(canonical);
      
//       // Sign the hash
//       const signature = this.sign(dataHash);

//       console.log('✅ Attestation generated');

//       return {
//         attestationData,
//         dataHash,
//         signature,
//         publicKey: this.getPublicKeyFingerprint()
//       };
//     } catch (error) {
//       console.error('❌ Attestation generation failed:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Sign data with private key
//    */
//   sign(data) {
//     const sign = crypto.createSign('RSA-SHA256');
//     sign.update(data);
//     const signature = sign.sign(this.privateKey, 'hex');
//     return signature;
//   }

//   /**
//    * Verify signature (public method anyone can use)
//    */
//   verify(data, signature) {
//     try {
//       const verify = crypto.createVerify('RSA-SHA256');
//       verify.update(data);
//       return verify.verify(this.publicKey, signature, 'hex');
//     } catch (error) {
//       return false;
//     }
//   }

//   /**
//    * Create canonical JSON (deterministic ordering)
//    */
//   canonicalJSON(obj) {
//     return JSON.stringify(obj, Object.keys(obj).sort());
//   }

//   /**
//    * Get public key for verification
//    */
//   getPublicKey() {
//     return this.publicKey;
//   }

//   /**
//    * Get public key fingerprint (short identifier)
//    */
//   getPublicKeyFingerprint() {
//     const hash = crypto.createHash('sha256');
//     hash.update(this.publicKey);
//     return hash.digest('hex').substring(0, 16);
//   }

//   /**
//    * Export attestation in standard format
//    */
//   exportAttestation(attestation) {
//     return {
//       data: attestation.attestationData,
//       hash: attestation.dataHash,
//       signature: attestation.signature,
//       publicKeyFingerprint: attestation.publicKey,
//       verificationUrl: `/verify-attestation/${attestation.signature}`
//     };
//   }
// }

// export const attestationService = new AttestationService();