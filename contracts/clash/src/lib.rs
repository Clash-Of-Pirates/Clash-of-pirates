#![no_std]

//! # Clash Game
//!
//! PvP combat game where both players secretly plan 3 turns of attacks and defenses,
//! commit them with zero-knowledge proofs, then watch an auto-battle resolve.
//! Combat features attack-defense mechanics with combos, crits, and strategic depth.
//!
//! **Game Hub Integration:**
//! All games must be played through the Game Hub contract for points tracking.

use soroban_sdk::{
    Address, Bytes, BytesN, Env, IntoVal, String, Vec, contract, contracterror, 
    contractimpl, contracttype, vec
};

// Import UltraHonk verifier contract
mod ultrahonk_contract {
    soroban_sdk::contractimport!(file = "ultrahonk_soroban_contract.wasm");
}

// Import GameHub contract interface
#[soroban_sdk::contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

// ============================================================================
// Constants
// ============================================================================

pub const ULTRAHONK_CONTRACT_ADDRESS: &str = "CCSORRUPEPDR4KPXLWIF4WCHERHJDOAHRAK6NTFSI2WLPPFTDVTATM74";

/// Each player starts with 100 HP
const STARTING_HP: i32 = 100;

/// Number of turns per battle
const TURNS_PER_BATTLE: u32 = 3;

/// Combo bonus damage for 2 consecutive same attacks
const COMBO_2_BONUS: i32 = 10;

/// Combo bonus damage for 3 consecutive same attacks
const COMBO_3_BONUS: i32 = 25;

/// TTL for game storage (30 days in ledgers)
const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    NotPlayer = 2,
    AlreadyCommitted = 3,
    BothPlayersNotCommitted = 4,
    GameAlreadyEnded = 5,
    InvalidProof = 6,
    ProofVerificationFailed = 7,
    InvalidMoveSequence = 8,
}

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Attack {
    Slash = 0,    // 30 damage, stopped by Dodge
    Fireball = 1, // 40 damage, stopped by Counter
    Lightning = 2, // 35 damage, stopped by Block
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Defense {
    Block = 0,   // Stops Lightning 
    Dodge = 1,   // Stops Slash 
    Counter = 2, // Stops Fireball
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Move {
    pub attack: Attack,
    pub defense: Defense,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MoveSequence {
    pub moves: Vec<Move>, // 3 moves total
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlayerCommitment {
    pub proof_id: BytesN<32>,
    pub has_revealed: bool,
    pub moves: MoveSequence,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BattleResult {
    pub player1_hp: i32,
    pub player2_hp: i32,
    pub winner: Address,
    pub turn_results: Vec<TurnResult>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TurnResult {
    pub turn: u32,
    pub player1_damage_dealt: i32,
    pub player2_damage_dealt: i32,
    pub player1_hp_remaining: i32,
    pub player2_hp_remaining: i32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub has_player1_commitment: bool,
    pub player1_commitment: PlayerCommitment,
    pub has_player2_commitment: bool,
    pub player2_commitment: PlayerCommitment,
    pub has_battle_result: bool,
    pub battle_result: BattleResult,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameHubAddress,
    Admin,
    CommitVk,    // VK for commit circuit
    RevealVk,    // VK for reveal circuit
}

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct ClashContract;

#[contractimpl]
impl ClashContract {
    /// Initialize the contract with GameHub address and admin
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, commit_vk: Bytes, reveal_vk: Bytes) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
        env.storage().instance().set(&DataKey::CommitVk, &commit_vk);
        env.storage().instance().set(&DataKey::RevealVk, &reveal_vk);
    }

    /// Start a new game between two players with points
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        // Prevent self-play
        if player1 == player2 {
            panic!("Cannot play against yourself");
        }

        // Require authentication from both players
        player1.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player1_points.into_val(&env),
        ]);
        player2.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player2_points.into_val(&env),
        ]);

        // Get GameHub address
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        // Create GameHub client
        let game_hub = GameHubClient::new(&env, &game_hub_addr);

        // Call Game Hub to start the session and lock points
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

        // Create empty default commitment
        let empty_commitment = PlayerCommitment {
            proof_id: BytesN::from_array(&env, &[0u8; 32]),
            has_revealed: false,
            moves: MoveSequence {
                moves: vec![&env],
            },
        };

        // Create empty battle result
        let empty_result = BattleResult {
            player1_hp: 0,
            player2_hp: 0,
            winner: player1.clone(),
            turn_results: vec![&env],
        };

        // Create game
        let game = Game {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_points,
            player2_points,
            has_player1_commitment: false,
            player1_commitment: empty_commitment.clone(),
            has_player2_commitment: false,
            player2_commitment: empty_commitment,
            has_battle_result: false,
            battle_result: empty_result,
        };

        // Store game in temporary storage with TTL
        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Commit move sequence with ZK proof
    pub fn commit_moves(
        env: Env,
        session_id: u32,
        player: Address,
        proof_blob: Bytes,
    ) -> Result<BytesN<32>, Error> {
        player.require_auth();

        // Get game from storage
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check game hasn't ended
        if game.has_battle_result {
            return Err(Error::GameAlreadyEnded);
        }

        // Get verification key
        // Get COMMIT verification key
        let commit_vk: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::CommitVk)
            .expect("Commit VK not set");

        // Verify ZK proof using UltraHonk verifier
        let ultrahonk_addr = Address::from_string(&String::from_str(&env, ULTRAHONK_CONTRACT_ADDRESS));
        let ultrahonk_client = ultrahonk_contract::Client::new(&env, &ultrahonk_addr);

        let proof_id = ultrahonk_client
            .try_verify_proof(&commit_vk, &proof_blob)
            .map_err(|_| Error::ProofVerificationFailed)?
            .map_err(|_| Error::InvalidProof)?;

        // Store commitment for the appropriate player
        let commitment = PlayerCommitment {
            proof_id: proof_id.clone(),
            has_revealed: false,
            moves: MoveSequence {
                moves: vec![&env],
            },
        };

        if player == game.player1 {
            if game.has_player1_commitment {
                return Err(Error::AlreadyCommitted);
            }
            game.player1_commitment = commitment;
            game.has_player1_commitment = true;
        } else if player == game.player2 {
            if game.has_player2_commitment {
                return Err(Error::AlreadyCommitted);
            }
            game.player2_commitment = commitment;
            game.has_player2_commitment = true;
        } else {
            return Err(Error::NotPlayer);
        }

        // Update game in storage
        env.storage().temporary().set(&key, &game);

        Ok(proof_id)
    }

    /// Reveal moves after both players have committed
    pub fn reveal_moves(
        env: Env,
        session_id: u32,
        player: Address,
        moves: Vec<Move>,
        reveal_proof_blob: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        // Validate moves
        if moves.len() != TURNS_PER_BATTLE {
            return Err(Error::InvalidMoveSequence);
        }

        // Get game from storage
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check both players have committed
        if !game.has_player1_commitment || !game.has_player2_commitment {
            return Err(Error::BothPlayersNotCommitted);
        }

        // Get REVEAL verification key
        let reveal_vk: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::RevealVk)
            .expect("Reveal VK not set");

        // Verify reveal proof
        let ultrahonk_addr = Address::from_string(&String::from_str(&env, ULTRAHONK_CONTRACT_ADDRESS));
        let ultrahonk_client = ultrahonk_contract::Client::new(&env, &ultrahonk_addr);

        ultrahonk_client
            .try_verify_proof(&reveal_vk, &reveal_proof_blob)
            .map_err(|_| Error::ProofVerificationFailed)?
            .map_err(|_| Error::InvalidProof)?;

        // Store revealed moves
        let move_sequence = MoveSequence { moves };

        if player == game.player1 {
            game.player1_commitment.moves = move_sequence;
            game.player1_commitment.has_revealed = true;
        } else if player == game.player2 {
            game.player2_commitment.moves = move_sequence;
            game.player2_commitment.has_revealed = true;
        } else {
            return Err(Error::NotPlayer);
        }

        // Update game
        env.storage().temporary().set(&key, &game);

        Ok(())
    }

    /// Resolve the battle after both players have revealed their moves
    pub fn resolve_battle(env: Env, session_id: u32) -> Result<BattleResult, Error> {
        // Get game from storage
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check if already resolved
        if game.has_battle_result {
            return Ok(game.battle_result.clone());
        }

        // Check both players have revealed moves
        if !game.player1_commitment.has_revealed || !game.player2_commitment.has_revealed {
            return Err(Error::BothPlayersNotCommitted);
        }

        // Simulate battle
        let battle_result = Self::simulate_battle(
            &env,
            &game.player1,
            &game.player2,
            &game.player1_commitment.moves,
            &game.player2_commitment.moves,
        );

        // Store result
        game.battle_result = battle_result.clone();
        game.has_battle_result = true;
        env.storage().temporary().set(&key, &game);

        // Report to GameHub
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        let game_hub = GameHubClient::new(&env, &game_hub_addr);
        let player1_won = battle_result.winner == game.player1;
        game_hub.end_game(&session_id, &player1_won);

        Ok(battle_result)
    }

    /// Get game information
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // Internal Battle Logic
    // ========================================================================

    fn simulate_battle(
        env: &Env,
        player1: &Address,
        player2: &Address,
        p1_moves: &MoveSequence,
        p2_moves: &MoveSequence,
    ) -> BattleResult {
        let mut p1_hp = STARTING_HP;
        let mut p2_hp = STARTING_HP;
        let mut turn_results = Vec::new(env);

        for turn in 0..TURNS_PER_BATTLE {
            let p1_move = &p1_moves.moves.get(turn).unwrap();
            let p2_move = &p2_moves.moves.get(turn).unwrap();

            // Calculate damage with combo bonuses
            let p1_damage = Self::calculate_damage(
                env,
                p1_move.attack,
                p2_move.defense,
                &p1_moves.moves,
                turn,
            );
            let p2_damage = Self::calculate_damage(
                env,
                p2_move.attack,
                p1_move.defense,
                &p2_moves.moves,
                turn,
            );

            // Apply damage
            p1_hp -= p2_damage;
            p2_hp -= p1_damage;

            // Store turn result
            turn_results.push_back(TurnResult {
                turn,
                player1_damage_dealt: p1_damage,
                player2_damage_dealt: p2_damage,
                player1_hp_remaining: p1_hp,
                player2_hp_remaining: p2_hp,
            });

            // Check for knockout
            if p1_hp <= 0 || p2_hp <= 0 {
                break;
            }
        }

        // Determine winner (if equal HP, player1 wins)
        let winner = if p1_hp > p2_hp {
            player1.clone()
        } else if p2_hp > p1_hp {
            player2.clone()
        } else {
            player1.clone()
        };

        BattleResult {
            player1_hp: p1_hp,
            player2_hp: p2_hp,
            winner,
            turn_results,
        }
    }

    fn calculate_damage(
        _env: &Env,
        attack: Attack,
        defense: Defense,
        move_sequence: &Vec<Move>,
        current_turn: u32,
    ) -> i32 {
        // Base damage for each attack type
        let base_damage = match attack {
            Attack::Slash => 30,
            Attack::Fireball => 40,
            Attack::Lightning => 35,
        };

        // Pure RPS: Check if defense STOPS the attack
        let blocked = match (attack, defense) {
            (Attack::Slash, Defense::Dodge) => true,
            (Attack::Fireball, Defense::Counter) => true,
            (Attack::Lightning, Defense::Block) => true,
            _ => false,
        };

        // If blocked, no damage
        if blocked {
            return 0;
        }

        // Calculate combo bonus
        let mut combo_bonus = 0;
        if current_turn >= 1 {
            let prev_attack = move_sequence.get(current_turn - 1).unwrap().attack;
            if prev_attack == attack {
                combo_bonus = COMBO_2_BONUS;
            }
        }
        if current_turn >= 2 {
            let prev2_attack = move_sequence.get(current_turn - 2).unwrap().attack;
            let prev1_attack = move_sequence.get(current_turn - 1).unwrap().attack;
            if prev2_attack == attack && prev1_attack == attack {
                combo_bonus = COMBO_3_BONUS;
            }
        }

        base_damage + combo_bonus
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set")
    }

    pub fn set_hub(env: Env, new_hub: Address) {
        let admin: Address = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &new_hub);
    }

    pub fn set_commit_vk(env: Env, commit_vk: Bytes) {
        let admin: Address = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::CommitVk, &commit_vk);
    }

    pub fn set_reveal_vk(env: Env, reveal_vk: Bytes) {
        let admin: Address = Self::get_admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::RevealVk, &reveal_vk);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = Self::get_admin(env.clone());
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}