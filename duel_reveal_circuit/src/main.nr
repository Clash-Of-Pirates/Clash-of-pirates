use dep::std::hash::pedersen_hash;

/// Clash Reveal Circuit
/// Proves that revealed moves match the original commitment
/// 
/// This circuit ensures players cannot change their moves after seeing
/// the opponent's commitment (prevents cheating).
///
/// Game Rules:
/// - Attacks: Slash(0), Fireball(1), Lightning(2)
/// - Defenses: Block(0), Dodge(1), Counter(2)
fn main(
    attacks: [Field; 3],           // Private: player's original attack choices
    defenses: [Field; 3],          // Private: player's original defense choices
    commitment: pub Field,         // Public: original commitment hash
    player_address: pub Field,     // Public: player's blockchain address
    session_id: pub Field,         // Public: game session identifier
    revealed_attacks: pub [Field; 3],   // Public: attacks being revealed
    revealed_defenses: pub [Field; 3]   // Public: defenses being revealed
) {
    // 1. Validate revealed attacks are valid enum values [0, 1, 2]
    for i in 0..3 {
        assert(revealed_attacks[i] as u8 <= 2, "Invalid revealed attack");
    }
    
    // 2. Validate revealed defenses are valid enum values [0, 1, 2]
    for i in 0..3 {
        assert(revealed_defenses[i] as u8 <= 2, "Invalid revealed defense");
    }
    
    // 3. Prove revealed moves match the private committed moves
    // This prevents players from changing their strategy after commit
    for i in 0..3 {
        assert(attacks[i] == revealed_attacks[i], "Attack mismatch");
        assert(defenses[i] == revealed_defenses[i], "Defense mismatch");
    }
    
    // 4. Recompute the original commitment hash
    let computed_commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    // 5. Verify computed commitment matches the public commitment
    // This proves the revealed moves are the same ones that were committed
    assert(computed_commitment == commitment, "Commitment mismatch");
}

#[test]
fn test_valid_reveal_all_slash_block() {
    // Player committed to Slash + Block for all turns, now revealing
    let attacks = [0, 0, 0];   // All Slash (private)
    let defenses = [0, 0, 0];  // All Block (private)
    let revealed_attacks = [0, 0, 0];   // Revealed (public)
    let revealed_defenses = [0, 0, 0];  // Revealed (public)
    let player_address = 0x123456789abcdef;
    let session_id = 42;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test]
fn test_valid_reveal_mixed_strategy() {
    // Player committed to varied moves, now revealing honestly
    let attacks = [0, 1, 2];   // Slash, Fireball, Lightning
    let defenses = [2, 0, 1];  // Counter, Block, Dodge
    let revealed_attacks = [0, 1, 2];
    let revealed_defenses = [2, 0, 1];
    let player_address = 0xdeadbeef;
    let session_id = 999;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test]
fn test_valid_reveal_fireball_spam() {
    // Player committed to Fireball spam with varying defenses
    let attacks = [1, 1, 1];   // All Fireball
    let defenses = [0, 1, 2];  // Block, Dodge, Counter
    let revealed_attacks = [1, 1, 1];
    let revealed_defenses = [0, 1, 2];
    let player_address = 0xcafebabe;
    let session_id = 1337;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test]
fn test_valid_reveal_lightning_combo() {
    // Player building Lightning combo with defensive variety
    let attacks = [2, 2, 2];   // All Lightning (combo damage!)
    let defenses = [1, 0, 2];  // Dodge, Block, Counter
    let revealed_attacks = [2, 2, 2];
    let revealed_defenses = [1, 0, 2];
    let player_address = 0x111222333;
    let session_id = 7777;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_cheating_changed_attack() {
    // Player tries to change attack after seeing opponent's commitment
    let attacks = [0, 1, 2];   // Original committed attacks
    let defenses = [1, 2, 0];
    let revealed_attacks = [2, 1, 0];  // CHEATING: Changed attacks!
    let revealed_defenses = [1, 2, 0];
    let player_address = 0x123;
    let session_id = 1;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_cheating_changed_defense() {
    // Player tries to change defense after commit
    let attacks = [1, 2, 0];
    let defenses = [0, 1, 2];  // Original committed defenses
    let revealed_attacks = [1, 2, 0];
    let revealed_defenses = [2, 1, 0];  // CHEATING: Changed defenses!
    let player_address = 0x456;
    let session_id = 2;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_cheating_one_attack_changed() {
    // Player tries to change just one attack (subtle cheat)
    let attacks = [0, 0, 0];   // Original: all Slash
    let defenses = [1, 1, 1];
    let revealed_attacks = [0, 1, 0];  // CHEATING: Changed turn 2 to Fireball!
    let revealed_defenses = [1, 1, 1];
    let player_address = 0x789;
    let session_id = 3;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_revealed_attack_out_of_range() {
    // Player reveals invalid attack value
    let attacks = [0, 1, 2];
    let defenses = [0, 1, 2];
    let revealed_attacks = [0, 5, 2];  // Invalid: 5 is not a valid attack
    let revealed_defenses = [0, 1, 2];
    let player_address = 0xabc;
    let session_id = 4;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_revealed_defense_out_of_range() {
    // Player reveals invalid defense value
    let attacks = [0, 1, 2];
    let defenses = [0, 1, 2];
    let revealed_attacks = [0, 1, 2];
    let revealed_defenses = [0, 3, 2];  // Invalid: 3 is not a valid defense
    let player_address = 0xdef;
    let session_id = 5;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_wrong_commitment() {
    // Commitment doesn't match the revealed moves
    let attacks = [0, 1, 2];
    let defenses = [1, 2, 0];
    let revealed_attacks = [0, 1, 2];
    let revealed_defenses = [1, 2, 0];
    let player_address = 0x321;
    let session_id = 6;
    
    // Wrong commitment (using different data)
    let wrong_commitment = pedersen_hash([
        1, 1, 1,
        0, 0, 0,
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        wrong_commitment,  // Wrong!
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_player_spoofing() {
    // Player tries to reveal with wrong address
    let attacks = [2, 1, 0];
    let defenses = [0, 1, 2];
    let revealed_attacks = [2, 1, 0];
    let revealed_defenses = [0, 1, 2];
    let real_player = 0xaaa;
    let fake_player = 0xbbb;
    let session_id = 7;
    
    // Commitment made with real player
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        real_player,
        session_id
    ]);
    
    // Trying to reveal as fake player
    main(
        attacks, 
        defenses, 
        commitment, 
        fake_player,  // Wrong player!
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test(should_fail)]
fn test_invalid_session_mismatch() {
    // Player tries to reveal for wrong session
    let attacks = [1, 2, 0];
    let defenses = [2, 0, 1];
    let revealed_attacks = [1, 2, 0];
    let revealed_defenses = [2, 0, 1];
    let player_address = 0xccc;
    let session_id_1 = 100;
    let session_id_2 = 200;
    
    // Commitment for session 100
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id_1
    ]);
    
    // Trying to reveal for session 200
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id_2,  // Wrong session!
        revealed_attacks,
        revealed_defenses
    );
}

#[test]
fn test_edge_case_all_max_values() {
    // All moves at maximum valid value
    let attacks = [2, 2, 2];
    let defenses = [2, 2, 2];
    let revealed_attacks = [2, 2, 2];
    let revealed_defenses = [2, 2, 2];
    let player_address = 0xffffffff;
    let session_id = 0xffffffff;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}

#[test]
fn test_edge_case_all_min_values() {
    // All moves at minimum valid value
    let attacks = [0, 0, 0];
    let defenses = [0, 0, 0];
    let revealed_attacks = [0, 0, 0];
    let revealed_defenses = [0, 0, 0];
    let player_address = 0;
    let session_id = 0;
    
    let commitment = pedersen_hash([
        attacks[0], attacks[1], attacks[2],
        defenses[0], defenses[1], defenses[2],
        player_address,
        session_id
    ]);
    
    main(
        attacks, 
        defenses, 
        commitment, 
        player_address, 
        session_id,
        revealed_attacks,
        revealed_defenses
    );
}