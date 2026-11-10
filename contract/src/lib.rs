//! Bona Fide contract — Phase 0 skeleton.
//!
//! This is a compiling placeholder. The real contract is built in Phase 1 by
//! extending the Shade Agent template's agent-contract
//! (NearDeFi/shade-agent-template @ 816b75b), which provides the attestation /
//! measurement-approval / `register_agent` machinery (see docs/context/architecture.md
//! and the Phase 0 research notes). No feature code lives here yet.
//!
//! Planned state (P1): owner, approved_measurements, approved_ppids, agents
//! (extended with an X25519 `enc_pubkey`), allowlisted_projects, mandates, verdicts.

use near_sdk::{AccountId, PanicOnDefault, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn new(owner_id: AccountId) -> Self {
        Self { owner_id }
    }

    /// View: the contract owner.
    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::accounts;

    #[test]
    fn new_sets_owner() {
        let owner = accounts(0);
        let contract = Contract::new(owner.clone());
        assert_eq!(contract.get_owner(), owner);
    }
}
