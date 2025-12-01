fn main(
    answer: [Field; 8],
    salt: Field,
) -> pub Field {
    let mut hash_input: [Field; 9] = [0; 9];
    for i in 0..8 {
        hash_input[i] = answer[i];
    }
    hash_input[8] = salt;
    let commitment_hash = std::hash::pedersen_hash(hash_input);
    commitment_hash
}
