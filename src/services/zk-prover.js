

import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { readFileSync } from 'fs';
import { join } from 'path';

class ZKProverService {
  constructor() {
    this.answerExistenceCircuit = null;   
    this.answerComparisonCircuit = null;  
    this.existenceBackend = null;         
    this.comparisonBackend = null;        
  }

  async initialize() {
    try {
      console.log('🔐 Initializing ZK circuits...');

      
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

      
      this.answerExistenceCircuit = new Noir(existenceCircuit);
      this.answerComparisonCircuit = new Noir(comparisonCircuit);

      
      this.existenceBackend = new UltraHonkBackend(existenceCircuit.bytecode);
      this.comparisonBackend = new UltraHonkBackend(comparisonCircuit.bytecode);

      console.log('✅ ZK circuits initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ZK circuits:', error.message);
      console.error('   Make sure you ran: nargo compile in both circuit directories');
      throw error;
    }
  }

    async proveAnswerExists(answer, salt) {
    console.log('🔐 Generating answer existence proof...');

    const startTime = Date.now();

    
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
      
      const { witness, returnValue } = await this.answerExistenceCircuit.execute(inputs);

      
      const commitmentHash = returnValue;

      
      const proof = await this.existenceBackend.generateProof(witness);

      const duration = Date.now() - startTime;
      console.log(`✅ Existence proof generated in ${duration}ms`);
      console.log('🔏 Commitment hash (Noir output):', commitmentHash);

      return {
        
        proof,
        
        proofHex: this.proofToHex(proof.proof),
        
        commitmentHash,
        
        publicInputs: [commitmentHash],
        provingTime: duration,
      };
    } catch (error) {
      console.error('❌ Existence proof generation failed:', error.message);
      throw error;
    }
  }

    async proveAnswerComparison(userAnswer, secretAnswer, salt) {
    console.log('🔐 Generating answer comparison proof...');

    const startTime = Date.now();

    
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

    stringToField(str) {
    if (typeof str !== 'string') {
      str = String(str);
    }

    
    const FIELD_MODULUS = BigInt(
      '21888242871839275222246405745257275088548364400416034343698204186575808495617'
    );

    if (str.startsWith('0x') || str.startsWith('0X')) {
      let v = BigInt(str);
      
      v = v % FIELD_MODULUS;
      return v.toString();
    }

    
    return str;
  }

    arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

    proofToHex(proofBytes) {
    if (!proofBytes) {
      throw new Error('Missing proof bytes on proof object');
    }
    if (Buffer.isBuffer(proofBytes)) {
      return '0x' + proofBytes.toString('hex');
    }
    
    return '0x' + Buffer.from(proofBytes).toString('hex');
  }
}

export const zkProver = new ZKProverService();
