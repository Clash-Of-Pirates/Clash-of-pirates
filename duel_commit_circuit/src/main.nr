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
    commitment: pub Field,    // Public: hash commitment to verify
    player_address: pub Field, // Public: player's blockchain address
    session_id: pub Field     // Public: game session identifier
) {
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
    let computed_commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    // 4. Verify computed commitment matches the public commitment
    assert(computed_commitment == commitment, "Commitment mismatch");
}


#[test]
fn test_valid_all_slash_and_block() {
    // Player chooses Slash + Block for all 3 turns
    let attacks = [0, 0, 0];   // All Slash
    let defenses = [0, 0, 0];  // All Block
    let player_address = 0x123456789abcdef;
    let session_id = 42;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test]
fn test_valid_mixed_strategy() {
    // Player uses different moves each turn
    let attacks = [0, 1, 2];   // Slash, Fireball, Lightning
    let defenses = [2, 0, 1];  // Counter, Block, Dodge
    let player_address = 0xdeadbeef;
    let session_id = 999;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test]
fn test_valid_fireball_spam() {
    // Player commits to Fireball spam with varying defenses
    let attacks = [1, 1, 1];   // All Fireball
    let defenses = [0, 1, 2];  // Block, Dodge, Counter
    let player_address = 0xcafebabe;
    let session_id = 1337;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test]
fn test_valid_different_sessions() {
    // Same player, different session IDs produce different commitments
    let attacks = [0, 1, 2];
    let defenses = [1, 2, 0];
    let player_address = 0x111111;
    let session_id_1 = 100;
    let session_id_2 = 200;
    
    let commitment_1 = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id_1
    ]);
    
    let commitment_2 = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id_2
    ]);
    
    // Verify different sessions produce different commitments
    assert(commitment_1 != commitment_2);
    
    // Both should verify correctly
    main(attacks, defenses, commitment_1, player_address, session_id_1);
    main(attacks, defenses, commitment_2, player_address, session_id_2);
}

#[test(should_fail)]
fn test_invalid_attack_out_of_range() {
    // Attack value 3 is invalid (only 0, 1, 2 allowed)
    let attacks = [0, 3, 1];   // Invalid: 3
    let defenses = [0, 1, 2];
    let player_address = 0x123;
    let session_id = 1;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test(should_fail)]
fn test_invalid_defense_out_of_range() {
    // Defense value 5 is invalid
    let attacks = [0, 1, 2];
    let defenses = [0, 5, 1];  // Invalid: 5
    let player_address = 0x456;
    let session_id = 2;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test(should_fail)]
fn test_invalid_commitment_mismatch() {
    // Commitment doesn't match the actual moves
    let attacks = [0, 1, 2];
    let defenses = [1, 2, 0];
    let player_address = 0x789;
    let session_id = 3;
    
    // Wrong commitment (using different moves)
    let wrong_commitment = pedersen_hash([
        1, 1, 1,  // Different attacks
        0, 0, 0,  // Different defenses
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, wrong_commitment, player_address, session_id);
}

#[test(should_fail)]
fn test_invalid_wrong_player_address() {
    // Player tries to use someone else's commitment
    let attacks = [2, 1, 0];
    let defenses = [0, 1, 2];
    let real_player = 0xaaa;
    let fake_player = 0xbbb;
    let session_id = 4;
    
    // Commitment made with real player address
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        real_player,
        session_id
    ]);
    
    // Trying to verify with fake player address
    main(attacks, defenses, commitment, fake_player, session_id);
}

#[test(should_fail)]
fn test_invalid_wrong_session_id() {
    // Player tries to reuse commitment from different session
    let attacks = [1, 2, 0];
    let defenses = [2, 0, 1];
    let player_address = 0xccc;
    let session_id_1 = 50;
    let session_id_2 = 51;
    
    // Commitment for session 50
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id_1
    ]);
    
    // Trying to use it for session 51
    main(attacks, defenses, commitment, player_address, session_id_2);
}

#[test]
fn test_edge_case_all_max_values() {
    // All moves set to maximum valid value (2)
    let attacks = [2, 2, 2];   // All Lightning
    let defenses = [2, 2, 2];  // All Counter
    let player_address = 0xffffffff;
    let session_id = 0xffffffff;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}

#[test]
fn test_edge_case_all_zero_values() {
    // All moves set to minimum valid value (0)
    let attacks = [0, 0, 0];   // All Slash
    let defenses = [0, 0, 0];  // All Block
    let player_address = 0;
    let session_id = 0;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(attacks, defenses, commitment, player_address, session_id);
}