// Owner / agent gating, reused from the Shade Agent template
// (NearDeFi/shade-agent-template @ 816b75b, Apache-2.0).
use crate::*;

#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentRemovalReason {
    ManualRemoval,
    ExpiredAttestation,
    InvalidMeasurements,
    InvalidPpid,
    NotWhitelistedForLocal,
}

impl Contract {
    // Require the caller to be the owner
    pub(crate) fn require_owner(&mut self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Caller is not the owner"
        );
    }

    // Panic unless the caller is a currently-valid registered agent (registered,
    // unexpired, approved measurements + PPID, and whitelisted in local mode).
    // Used to gate `submit_verdict` (invariant I5 / pre-sign guard #5).
    pub(crate) fn assert_registered_valid_agent(&self) {
        let account_id = env::predecessor_account_id();
        let agent = self.agents.get(&account_id).expect("Agent not registered");
        let reasons = self.check_invalid_reasons(&account_id, agent);
        require!(reasons.is_empty(), format!("Invalid agent: {:?}", reasons));
    }

    pub(crate) fn check_invalid_reasons(
        &self,
        account_id: &AccountId,
        agent: &Agent,
    ) -> Vec<AgentRemovalReason> {
        let mut reasons = Vec::new();
        if agent.valid_until_ms < block_timestamp_ms() {
            reasons.push(AgentRemovalReason::ExpiredAttestation);
        }
        if !self.approved_measurements.contains(&agent.measurements) {
            reasons.push(AgentRemovalReason::InvalidMeasurements);
        }
        if !self.approved_ppids.contains(&agent.ppid) {
            reasons.push(AgentRemovalReason::InvalidPpid);
        }
        if !self.requires_tee && !self.whitelisted_agents_for_local.contains(account_id) {
            reasons.push(AgentRemovalReason::NotWhitelistedForLocal);
        }
        reasons
    }
}
