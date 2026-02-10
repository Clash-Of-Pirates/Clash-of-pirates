use dep::std::hash::pedersen_hash;

fn main(
    attacks: [Field; 3],
    defenses: [Field; 3],
    commitment: pub Field,
    player_address: pub Field,
    match_id: pub Field
) {
    // 1. Validate attacks are in range [0, 2]
    for i in 0..3 {
        assert(attacks[i] as u8 <= 2);
    }
    
    // 2. Validate defenses are in range [0, 2]
    for i in 0..3 { 
        assert(defenses[i] as u8 <= 2);
    }
    
    // 3. Compute commitment hash
    // pedersen_hash(attacks[0], attacks[1], attacks[2], 
    //           defenses[0], defenses[1], defenses[2],
    //           player_address, match_id)
    let computed_commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        match_id
    ]);
    
    // 4. Assert computed commitment matches public commitment
    assert(computed_commitment == commitment);
}