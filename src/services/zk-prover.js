// src/services/zk-prover.js

import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { readFileSync } from 'fs';
import { join } from 'path';

class ZKProverService {
  constructor() {
    this.answerExistenceCircuit = null;   // Noir instance
    this.answerComparisonCircuit = null;  // Noir instance
    this.existenceBackend = null;         // UltraHonkBackend
    this.comparisonBackend = null;        // UltraHonkBackend
  }

  async initialize() {
    try {
      console.log('🔐 Initializing ZK circuits...');

      // Load compiled circuits (from `nargo compile`)
      const existencePath = join(
        process.cwd(),
        'circuits/answer_existence/target/answer_existence.json',
      );
      const comparisonPath = join(
        process.cwd(),
        'circuits/answer_comparison/target/answer_comparison.json',
      );

      const existenceCircuit = JSON.parse(readFileSync(existencePath, 'utf8'));
      const comparisonCircuit = JSON.parse(readFileSync(comparisonPath, 'utf8'));

      // Noir program instances
      this.answerExistenceCircuit = new Noir(existenceCircuit);
      this.answerComparisonCircuit = new Noir(comparisonCircuit);

      // UltraHonk backends (take ACIR bytecode)
      this.existenceBackend = new UltraHonkBackend(existenceCircuit.bytecode);
      this.comparisonBackend = new UltraHonkBackend(comparisonCircuit.bytecode);

      console.log('✅ ZK circuits initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ZK circuits:', error.message);
      console.error('   Make sure you ran: nargo compile in both circuit directories');
      throw error;
    }
  }

  /**
   * Contest creation: prove we know (answer, salt) and output commitment_hash.
   *
   * Noir: answer_existence/src/main.nr
   *
   *   fn main(answer: [Field; 8], salt: Field) -> pub Field {
   *       ...
   *       let commitment_hash = std::hash::pedersen_hash(hash_input);
   *       commitment_hash
   *   }
   *
   * JS:
   *   - answer: string, e.g. "OMEGA-742"
   *   - salt:   string/number, e.g. "12345"
   */
  async proveAnswerExists(answer, salt) {
    console.log('🔐 Generating answer existence proof...');

    const startTime = Date.now();

    // Encode answer and salt as Fields
    const answerFields = this.stringToFieldArray(answer, 8);
    const saltField = this.stringToField(salt);

    const inputs = {
      answer: answerFields,
      salt: saltField,
    };

    console.log('📊 Existence circuit inputs:', {
      answer: answerFields,
      salt: saltField,
    });

    try {
      // 1) Execute Noir circuit → witness + public returnValue (commitment_hash)
      const { witness, returnValue } = await this.answerExistenceCircuit.execute(inputs);

      // For `-> pub Field`, returnValue is a single Field (decimal string)
      const commitmentHash = returnValue;

      // 2) Generate proof with UltraHonkBackend
      const proof = await this.existenceBackend.generateProof(witness);

      const duration = Date.now() - startTime;
      console.log(`✅ Existence proof generated in ${duration}ms`);
      console.log('🔏 Commitment hash (Noir output):', commitmentHash);

      return {
        // Raw proof object from bb.js (needed for verifyProof)
        proof,
        // Hex encoding of the proof bytes (for DB / chain / API)
        proofHex: this.proofToHex(proof.proof),
        // Public output from circuit
        commitmentHash,
        // For convenience if you want a "publicInputs" array notion
        publicInputs: [commitmentHash],
        provingTime: duration,
      };
    } catch (error) {
      console.error('❌ Existence proof generation failed:', error.message);
      throw error;
    }
  }

  /**
   * User verification: prove relation between secret_answer, user_answer, and matches flag.
   *
   * Noir: answer_comparison/src/main.nr
   *
   *   fn main(
   *       matches: pub bool,
   *       secret_answer: [Field; 8],
   *       salt: Field,
   *       user_answer: [Field; 8],
   *   ) -> pub [Field; 2] {
   *       let commitment_hash    = pedersen(secret_answer || salt);
   *       let user_answer_hash   = pedersen(user_answer);
   *       assert(actual_match == matches);
   *       [commitment_hash, user_answer_hash]
   *   }
   *
   * JS:
   *   - userAnswer:   what the LLM extracted for this attempt
   *   - secretAnswer: canonical correct answer
   *   - salt:         same salt used at contest creation
   */
  async proveAnswerComparison(userAnswer, secretAnswer, salt) {
    console.log('🔐 Generating answer comparison proof...');

    const startTime = Date.now();

    // Encode to Fields
    const userAnswerFields = this.stringToFieldArray(userAnswer || '', 8);
    const secretAnswerFields = this.stringToFieldArray(secretAnswer, 8);
    const saltField = this.stringToField(salt);

    // Compute matches flag off-chain (string equality)
    const matches = this.arraysEqual(userAnswerFields, secretAnswerFields);

    console.log('📊 Comparison inputs:', {
      userAnswer: userAnswer || '(empty)',
      secretAnswer,
      matches,
    });

    const inputs = {
      matches,
      secret_answer: secretAnswerFields,
      salt: saltField,
      user_answer: userAnswerFields,
    };

    try {
      // 1) Execute Noir circuit → witness + [commitment_hash, user_answer_hash]
      const { witness, returnValue } = await this.answerComparisonCircuit.execute(inputs);

      const [commitmentHash, userAnswerHash] = returnValue;

      // 2) Generate proof with UltraHonkBackend
      const proof = await this.comparisonBackend.generateProof(witness);

      const duration = Date.now() - startTime;
      console.log(
        `✅ Comparison proof generated in ${duration}ms (${matches ? 'MATCH' : 'NO MATCH'})`,
      );

      // For on-chain or off-chain consumers you can still export “publicInputs”
      const publicInputs = [commitmentHash, userAnswerHash, matches ? '1' : '0'];

      return {
        proof,
        proofHex: this.proofToHex(proof.proof),
        publicInputs,
        commitmentHash,
        userAnswerHash,
        provingTime: duration,
        result: matches ? 'correct' : 'incorrect',
      };
    } catch (error) {
      console.error('❌ Comparison proof generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify a proof given the public inputs.
   *
   * UltraHonkBackend API from bb.js:
   *   const isValid = await backend.verifyProof(proof);
   *
   * It already knows the public inputs from the witness / circuit,
   * so we don't need to pass them separately here.
   */
  async verifyProof(proof, circuitType = 'comparison') {
    console.log('🔍 Verifying proof...');

    try {
      const backend =
        circuitType === 'existence' ? this.existenceBackend : this.comparisonBackend;

      const isValid = await backend.verifyProof(proof);

      console.log(isValid ? '✅ Proof valid' : '❌ Proof invalid');
      return isValid;
    } catch (error) {
      console.error('❌ Verification failed:', error.message);
      return false;
    }
  }

  // ========== UTILITIES ==========

  /**
   * Convert a UTF-8 string into an array of Field elements (as decimal strings),
   * padded or truncated to `length`. Each Field is just the ASCII code.
   */
  stringToFieldArray(str, length) {
    const fields = new Array(length).fill('0');
    const bytes = Buffer.from(str, 'utf8');

    for (let i = 0; i < Math.min(bytes.length, length); i++) {
      fields[i] = bytes[i].toString();
    }

    return fields;
  }

  /**
   * Normalize JS values into Noir Field-compatible decimal strings.
   *
   * - If it starts with '0x', treat as hex → BigInt → reduce modulo field → decimal string.
   * - Else, treat as decimal string or pass-through.
   */
  stringToField(str) {
    if (typeof str !== 'string') {
      str = String(str);
    }

    // BN254 modulus used by Noir / UltraHonk
    const FIELD_MODULUS = BigInt(
      '21888242871839275222246405745257275088548364400416034343698204186575808495617'
    );

    if (str.startsWith('0x') || str.startsWith('0X')) {
      let v = BigInt(str);
      // Clamp into field range
      v = v % FIELD_MODULUS;
      return v.toString();
    }

    // Assume already a decimal string; you *could* also mod here if paranoid
    return str;
  }

  /**
   * Compare two arrays of strings element-wise.
   */
  arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  /**
   * Encode a proof from bb.js into a hex string (for DB / chain).
   * bb.js returns an object: { proof: Uint8Array, ... }.
   */
  proofToHex(proofBytes) {
    if (!proofBytes) {
      throw new Error('Missing proof bytes on proof object');
    }
    if (Buffer.isBuffer(proofBytes)) {
      return '0x' + proofBytes.toString('hex');
    }
    // Uint8Array
    return '0x' + Buffer.from(proofBytes).toString('hex');
  }
}

export const zkProver = new ZKProverService();
