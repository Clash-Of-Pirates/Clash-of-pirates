use dep::std::hash::pedersen_hash;


fn main(
    attacks: [Field; 3],
    defenses: [Field; 3],
    commitment: pub Field,
    player_address: pub Field,
    match_id: pub Field,
    revealed_attacks: pub [Field; 3],
    revealed_defenses: pub [Field; 3]
) {
    // 1. Validate revealed values are in range
    for i in 0..3 {
        assert(revealed_attacks[i] as u8 <= 2);
        assert(revealed_defenses[i] as u8 <= 2);
    }
    
    // 2. Assert revealed matches private
    for i in 0..3 {
        assert(attacks[i] == revealed_attacks[i]);
        assert(defenses[i] == revealed_defenses[i]);
    }
    
    // 3. Recompute commitment
    let computed_commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        match_id
    ]);
    
    // 4. Assert commitment matches
    assert(computed_commitment == commitment);
}