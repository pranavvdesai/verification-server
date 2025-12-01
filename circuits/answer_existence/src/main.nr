// src/main.nr  (answer_existence)

fn main(
    // Private inputs
    answer: [Field; 8],
    salt: Field,
) -> pub Field {
    // Combine answer + salt into single array
    let mut hash_input: [Field; 9] = [0; 9];

    // Copy answer into positions 0..7
    for i in 0..8 {
        hash_input[i] = answer[i];
    }

    // Put salt in last slot
    hash_input[8] = salt;

    // Real Pedersen hash from Noir stdlib
    let commitment_hash = std::hash::pedersen_hash(hash_input);

    // Returning this makes it a *public output*
    commitment_hash
}
