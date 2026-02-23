use dep::std::hash::pedersen_hash;

/// Clash Proof Circuit
/// Proves that a player has committed to valid moves without revealing them
/// 
/// Game Rules:
/// - Attacks: Slash(0), Fireball(1), Lightning(2)
/// - Defenses: Block(0), Dodge(1), Counter(2)
/// - Each attack/defense must be 0, 1, or 2
/// - Player commits to 3 turns of moves
fn main(
    attacks: [Field; 3],      // Private: player's attack choices
    defenses: [Field; 3],     // Private: player's defense choices
    player_address: pub Field, // Public: player's blockchain address
    session_id: pub Field,     // Public: game session identifier
    // commitment: pub Field,    // Public: hash commitment to verify
)-> pub Field {
    // 1. Validate attacks are valid enum values [0, 1, 2]
    // Slash = 0, Fireball = 1, Lightning = 2
    for i in 0..3 {
        assert(attacks[i] as u8 <= 2, "Invalid attack value");
    }
    
    // 2. Validate defenses are valid enum values [0, 1, 2]
    // Block = 0, Dodge = 1, Counter = 2
    for i in 0..3 { 
        assert(defenses[i] as u8 <= 2, "Invalid defense value");
    }
    
    // 3. Compute commitment hash
    // Hash combines all moves + player identity + session
    pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]) 
    // 4. Verify computed commitment matches the public commitment
    // assert(computed_commitment == commitment, "Commitment mismatch");
}


#[test]
fn test_valid_all_slash_and_block() {
    let attacks = [0, 0, 0];
    let defenses = [0, 0, 0];
    let player_address = 0x123456789abcdef;
    let session_id = 42;
    
    main(attacks, defenses, player_address, session_id);
}

#[test]
fn test_valid_mixed_strategy() {
    let attacks = [0, 1, 2];
    let defenses = [2, 0, 1];
    let player_address = 0xdeadbeef;
    let session_id = 999;
    
    main(attacks, defenses, player_address, session_id);
}

#[test]
fn test_valid_fireball_spam() {
    let attacks = [1, 1, 1];
    let defenses = [0, 1, 2];
    let player_address = 0xcafebabe;
    let session_id = 1337;
    
    main(attacks, defenses, player_address, session_id);
}

#[test]
fn test_valid_different_sessions_produce_different_commitments() {
    let attacks = [0, 1, 2];
    let defenses = [1, 2, 0];
    let player_address = 0x111111;

    let commitment_1 = main(attacks, defenses, player_address, 100);
    let commitment_2 = main(attacks, defenses, player_address, 200);

    assert(commitment_1 != commitment_2);
}

#[test(should_fail)]
fn test_invalid_attack_out_of_range() {
    let attacks = [0, 3, 1];   // Invalid: 3
    let defenses = [0, 1, 2];
    
    main(attacks, defenses, 0x123, 1);
}

#[test(should_fail)]
fn test_invalid_defense_out_of_range() {
    let attacks = [0, 1, 2];
    let defenses = [0, 5, 1];  // Invalid: 5
    
    main(attacks, defenses, 0x456, 2);
}

#[test]
fn test_commitment_is_deterministic() {
    // Same inputs must always produce same commitment
    let attacks = [1, 2, 0];
    let defenses = [0, 2, 1];
    let player_address = 0xabc;
    let session_id = 77;

    let c1 = main(attacks, defenses, player_address, session_id);
    let c2 = main(attacks, defenses, player_address, session_id);

    assert(c1 == c2);
}

#[test]
fn test_different_players_same_moves_different_commitments() {
    let attacks = [0, 1, 2];
    let defenses = [2, 1, 0];
    let session_id = 10;

    let c1 = main(attacks, defenses, 0xaaa, session_id);
    let c2 = main(attacks, defenses, 0xbbb, session_id);

    assert(c1 != c2);
}

#[test]
fn test_edge_case_all_max_values() {
    let attacks = [2, 2, 2];
    let defenses = [2, 2, 2];
    
    main(attacks, defenses, 0xffffffff, 0xffffffff);
}

#[test]
fn test_edge_case_all_zero_values() {
    let attacks = [0, 0, 0];
    let defenses = [0, 0, 0];
    
    main(attacks, defenses, 0, 0);
}