#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
    TotalSupply,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAdmin = 3,
    AmountMustBePositive = 4,
}

#[contract]
pub struct ClashTokenContract;

#[contractimpl]
impl ClashTokenContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        Ok(())
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let admin = Self::get_admin(env.clone())?;
        admin.require_auth();
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        let bal_key = DataKey::Balance(to);
        let bal: i128 = env.storage().instance().get(&bal_key).unwrap_or(0);
        env.storage().instance().set(&bal_key, &(bal + amount));

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "CSH")
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Clash Token")
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}
