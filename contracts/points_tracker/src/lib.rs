#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Points(Address),
    Players,
    Admin,
}

#[contract]
pub struct PointsTracker;

#[contractimpl]
impl PointsTracker {
    /// Called once at deploy time.
    /// Sets the admin (the account authorized to record results).
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        let empty: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&DataKey::Players, &empty);
    }

    /// Admin-only: register both duelists in the players list before `record_result`
    /// (same effect as the internal `ensure_registered` helper).
    pub fn register_players(env: Env, player_a: Address, player_b: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        assert!(player_a != player_b, "players must differ");

        Self::ensure_registered(&env, &player_a);
        Self::ensure_registered(&env, &player_b);
    }

    /// Record the result of a completed duel.
    /// Only callable by the admin address set at initialize.
    /// winner gets +30 points.
    /// loser loses 15 points, floor at 0 (never negative).
    /// If winner == loser (should never happen) panic.
    pub fn record_result(env: Env, winner: Address, loser: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        assert!(winner != loser, "winner and loser must differ");

        Self::ensure_registered(&env, &winner);
        Self::ensure_registered(&env, &loser);

        let winner_pts: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Points(winner.clone()))
            .unwrap_or(0u64);
        env.storage().instance().set(
            &DataKey::Points(winner.clone()),
            &(winner_pts + 30u64),
        );

        let loser_pts: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Points(loser.clone()))
            .unwrap_or(0u64);
        let new_loser_pts = if loser_pts >= 15 { loser_pts - 15 } else { 0 };
        env.storage().instance().set(
            &DataKey::Points(loser.clone()),
            &new_loser_pts,
        );
    }

    /// Returns the points for a single player address.
    /// Returns 0 if the address has never played.
    pub fn get_points(env: Env, player: Address) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::Points(player))
            .unwrap_or(0u64)
    }

    /// Returns all players and their points as a map.
    pub fn get_leaderboard(env: Env) -> Map<Address, u64> {
        let players: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Players)
            .unwrap_or_else(|| Vec::new(&env));

        let mut result: Map<Address, u64> = Map::new(&env);
        let len = players.len();
        let mut i = 0u32;
        while i < len {
            let player = players.get(i).unwrap();
            let pts: u64 = env
                .storage()
                .instance()
                .get(&DataKey::Points(player.clone()))
                .unwrap_or(0u64);
            result.set(player, pts);
            i += 1;
        }
        result
    }

    /// Returns the admin address (for client-side verification).
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    fn ensure_registered(env: &Env, player: &Address) {
        let mut players: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Players)
            .unwrap_or_else(|| Vec::new(env));

        let len = players.len();
        let mut i = 0u32;
        let mut already_in = false;
        while i < len {
            if players.get(i).unwrap() == *player {
                already_in = true;
                break;
            }
            i += 1;
        }
        if !already_in {
            players.push_back(player.clone());
            env.storage().instance().set(&DataKey::Players, &players);
        }
    }
}
