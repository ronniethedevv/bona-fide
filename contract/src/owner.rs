// Owner-only methods. Attestation-related methods are reused from the Shade
// Agent template (NearDeFi/shade-agent-template @ 816b75b, Apache-2.0); the
// project allowlist is BonaFide's.
use crate::*;

#[near]
impl Contract {
    // --- attestation / agents (template) ---

    pub fn update_attestation_expiration_time(&mut self, attestation_expiration_time_ms: U64) {
        self.require_owner();
        self.attestation_expiration_time_ms = attestation_expiration_time_ms.into();
    }

    pub fn update_owner_id(&mut self, owner_id: AccountId) {
        self.require_owner();
        self.owner_id = owner_id;
    }

    /// Approve a set of measurements (the "approved worker code" gate).
    pub fn approve_measurements(&mut self, measurements: FullMeasurementsHex) {
        self.require_owner();
        self.approved_measurements.insert(measurements);
    }

    pub fn remove_measurements(&mut self, measurements: FullMeasurementsHex) {
        self.require_owner();
        require!(
            self.approved_measurements.remove(&measurements),
            "Measurements not in approved list"
        );
    }

    pub fn approve_ppids(&mut self, ppids: Vec<Ppid>) {
        self.require_owner();
        for id in ppids {
            self.approved_ppids.insert(id);
        }
    }

    pub fn remove_ppids(&mut self, ppids: Vec<Ppid>) {
        self.require_owner();
        for id in ppids {
            require!(self.approved_ppids.remove(&id), "PPID not in approved list");
        }
    }

    pub fn remove_agent(&mut self, account_id: AccountId) {
        self.require_owner();
        require!(
            self.agents.remove(&account_id).is_some(),
            "Agent not registered"
        );
        Event::AgentRemoved {
            account_id: &account_id,
            reasons: vec![AgentRemovalReason::ManualRemoval],
        }
        .emit();
    }

    /// Upgrade the contract code. Input: [gas (8 bytes LE u64)] + [wasm bytes].
    pub fn update_contract(&mut self) -> Promise {
        self.require_owner();

        let input = env::input().expect("Error: No input").to_vec();
        require!(
            input.len() >= 8,
            "Input must be at least 8 bytes: first 8 bytes are gas (u64), followed by WASM code"
        );
        let gas_bytes: [u8; 8] = input[0..8].try_into().unwrap();
        let gas_tgas = u64::from_le_bytes(gas_bytes);
        let code = input[8..].to_vec();
        require!(!code.is_empty(), "WASM code cannot be empty");

        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                b"".to_vec(),
                NearToken::from_near(0),
                Gas::from_tgas(gas_tgas),
            )
            .as_return()
    }

    // --- project allowlist (BonaFide, phase-1 trust registry) ---

    /// Allow or disallow a project account to co-sign mandates.
    pub fn set_project_allowlisted(&mut self, account_id: AccountId, allowed: bool) {
        self.require_owner();
        if allowed {
            self.allowlisted_projects.insert(account_id);
        } else {
            self.allowlisted_projects.remove(&account_id);
        }
    }

    // --- local-mode helpers (template) ---

    pub fn whitelist_agent_for_local(&mut self, account_id: AccountId) {
        require!(
            !self.requires_tee,
            "Whitelisting agents is not supported for TEE"
        );
        self.require_owner();
        self.whitelisted_agents_for_local.insert(account_id);
    }

    pub fn remove_agent_from_whitelist_for_local(&mut self, account_id: AccountId) {
        require!(
            !self.requires_tee,
            "Removing agents from the whitelist is not supported for TEE"
        );
        self.require_owner();
        require!(
            self.whitelisted_agents_for_local.remove(&account_id),
            "Agent not in whitelist for local"
        );
    }
}
