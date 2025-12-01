// Answer Comparison Circuit - real pedersen version
// Statement: There exist (secret_answer, salt, user_answer) such that:
//   - commitment_hash = pedersen(secret_answer || salt)
//   - user_answer_hash = pedersen(user_answer)
//   - (secret_answer == user_answer) <-> matches
// and we expose (commitment_hash, user_answer_hash, matches) as public.

fn main(
    // Public inputs
    matches: pub bool,

    // Private inputs
    secret_answer: [Field; 8],
    salt: Field,
    user_answer: [Field; 8],
) -> pub [Field; 2] {
    // 1. Compute commitment hash from secret answer + salt
    let mut secret_input: [Field; 9] = [0; 9];
    for i in 0..8 {
        secret_input[i] = secret_answer[i];
    }
    secret_input[8] = salt;

    let commitment_hash = std::hash::pedersen_hash(secret_input);

    // 2. Compute user answer hash
    let user_answer_hash = std::hash::pedersen_hash(user_answer);

    // 3. Check if answers match (byte-wise equality over 8 slots)
    let mut actual_match = true;
    for i in 0..8 {
        if secret_answer[i] != user_answer[i] {
            actual_match = false;
        }
    }

    // 4. Assert that the claimed `matches` flag is correct
    assert(actual_match == matches);

    // Return [commitment_hash, user_answer_hash] as public outputs
    [commitment_hash, user_answer_hash]
}
