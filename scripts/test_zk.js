import { zkProver } from '../src/services/zk-prover.js';

(async () => {
  try {
    await zkProver.initialize();

    const secretAnswer = 'OMEGA-742';
    const salt = '12345';

    const existence = await zkProver.proveAnswerExists(secretAnswer, salt);

    console.log('\n=== Existence Proof ===');
    console.log('Commitment hash from Noir:', existence.commitmentHash);
    console.log('Proof hex (short):', existence.proofHex.slice(0, 40) + '...');

    const existenceValid = await zkProver.verifyProof(existence.proof, 'existence');
    console.log('Existence proof valid?', existenceValid);

    
    const wrong = await zkProver.proveAnswerComparison('ALPHA-111', secretAnswer, salt);
    console.log('\n=== Comparison (Wrong) ===');
    console.log('Result:', wrong.result);
    console.log('Public inputs:', wrong.publicInputs);
    const wrongValid = await zkProver.verifyProof(wrong.proof, 'comparison');
    console.log('Wrong-answer proof valid?', wrongValid);

    
    const correct = await zkProver.proveAnswerComparison('OMEGA-742', secretAnswer, salt);
    console.log('\n=== Comparison (Correct) ===');
    console.log('Result:', correct.result);
    console.log('Public inputs:', correct.publicInputs);
    const correctValid = await zkProver.verifyProof(correct.proof, 'comparison');
    console.log('Correct-answer proof valid?', correctValid);
  } catch (e) {
    console.error('Test failed:', e);
  }
})();
