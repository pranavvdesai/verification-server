fn main(
    matches: pub bool,
    secret_answer: [Field; 8],
    salt: Field,
    user_answer: [Field; 8],
) -> pub [Field; 2] {
    let mut secret_input: [Field; 9] = [0; 9];
    for i in 0..8 {
        secret_input[i] = secret_answer[i];
    }
    secret_input[8] = salt;

    let commitment_hash = std::hash::pedersen_hash(secret_input);

    let user_answer_hash = std::hash::pedersen_hash(user_answer);

    let mut actual_match = true;
    for i in 0..8 {
        if secret_answer[i] != user_answer[i] {
            actual_match = false;
        }
    }

    assert(actual_match == matches);

    [commitment_hash, user_answer_hash]
}
