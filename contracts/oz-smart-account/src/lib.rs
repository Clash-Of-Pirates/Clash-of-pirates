#![no_std]
//! Deployable OpenZeppelin Soroban smart account WASM for [`smart-account-kit`].
//!
//! `stellar-accounts` is a library of traits and helpers; Soroban still needs a concrete
//! `#[contract]` type that wires `__constructor`, `__check_auth`, and the `SmartAccount` /
//! `ExecutionEntryPoint` traits — see OpenZeppelin `examples/multisig-smart-account/account`.

pub mod contract;
