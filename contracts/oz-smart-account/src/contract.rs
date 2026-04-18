//! Minimal smart account contract matching `smart-account-kit-bindings` (constructor + upgrade + OZ smart account API).
//!
//! Based on OpenZeppelin `examples/multisig-smart-account/account/src/contract.rs`.

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, BytesN, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, get_context_rule, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer,
    SmartAccount, SmartAccountError, SmartAccountStorageKey,
};
use stellar_contract_utils::upgradeable::{self as upgradeable, Upgradeable};

#[contract]
pub struct OzSmartAccount;

#[contractimpl]
impl OzSmartAccount {
    /// Creates a default context rule with the provided signers and policies.
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "default"),
            None,
            &signers,
            &policies,
        );
    }

    pub fn batch_add_signer(e: &Env, context_rule_id: u32, signers: Vec<Signer>) {
        e.current_contract_address().require_auth();

        smart_account::batch_add_signer(e, context_rule_id, &signers);
    }

    /// `smart-account-kit-bindings` still invokes this during simulation; `stellar-accounts` 0.7
    /// removed it from [`SmartAccount`]. Implemented by scanning stored rules up to [`NextId`].
    pub fn get_context_rules(e: &Env, context_rule_type: ContextRuleType) -> Vec<ContextRule> {
        let next_id = e
            .storage()
            .instance()
            .get(&SmartAccountStorageKey::NextId)
            .unwrap_or(0u32);
        let mut out = Vec::new(e);
        for id in 0u32..next_id {
            let key = SmartAccountStorageKey::ContextRuleData(id);
            if e.storage().persistent().has(&key) {
                let rule = get_context_rule(e, id);
                if rule.context_type == context_rule_type {
                    out.push_back(rule);
                }
            }
        }
        out
    }
}

#[contractimpl]
impl CustomAccountInterface for OzSmartAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for OzSmartAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for OzSmartAccount {}

#[contractimpl]
impl Upgradeable for OzSmartAccount {
    fn upgrade(e: &Env, new_wasm_hash: BytesN<32>, _operator: Address) {
        e.current_contract_address().require_auth();
        upgradeable::upgrade(e, &new_wasm_hash);
    }
}
