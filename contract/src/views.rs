use crate::*;

#[near(serializers = [json])]
pub struct ContractInfo {
    pub requires_tee: bool,
    pub attestation_expiration_time_ms: U64,
    pub owner_id: AccountId,
}

#[near(serializers = [json])]
pub enum AgentValidity {
    Valid,
    Invalid(Vec<AgentRemovalReason>),
}

#[near(serializers = [json])]
pub struct AgentView {
    pub account_id: AccountId,
    pub measurements: FullMeasurementsHex,
    pub ppid: Ppid,
    pub valid_until_ms: U64,
    pub enc_pubkey: Option<String>,
    pub validity: AgentValidity,
}

#[near(serializers = [json])]
pub struct EpochVerdict {
    pub epoch: u32,
    pub verdict: Verdict,
}

#[near(serializers = [json])]
pub struct MmListing {
    pub account_id: AccountId,
    pub summary: MmSummary,
}

impl Contract {
    fn agent_view(&self, account_id: &AccountId, agent: &Agent) -> AgentView {
        let reasons = self.check_invalid_reasons(account_id, agent);
        let validity = if reasons.is_empty() {
            AgentValidity::Valid
        } else {
            AgentValidity::Invalid(reasons)
        };
        AgentView {
            account_id: account_id.clone(),
            measurements: agent.measurements.clone(),
            ppid: agent.ppid.clone(),
            valid_until_ms: U64::from(agent.valid_until_ms),
            enc_pubkey: agent.enc_pubkey.map(hex::encode),
            validity,
        }
    }
}

#[near]
impl Contract {
    // --- contract / agents ---

    pub fn get_contract_info(&self) -> ContractInfo {
        ContractInfo {
            requires_tee: self.requires_tee,
            attestation_expiration_time_ms: U64::from(self.attestation_expiration_time_ms),
            owner_id: self.owner_id.clone(),
        }
    }

    pub fn get_approved_ppids(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Ppid> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.approved_ppids.len()) as usize;
        self.approved_ppids
            .iter()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_approved_measurements(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<FullMeasurementsHex> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.approved_measurements.len()) as usize;
        self.approved_measurements
            .iter()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_agent(&self, account_id: AccountId) -> Option<AgentView> {
        self.agents
            .get(&account_id)
            .map(|agent| self.agent_view(&account_id, agent))
    }

    pub fn get_agents(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<AgentView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.agents.len()) as usize;
        self.agents
            .iter()
            .skip(from)
            .take(limit)
            .map(|(account_id, agent)| self.agent_view(account_id, agent))
            .collect()
    }

    /// The hex X25519 public key the browser seals the MM's exchange key to.
    pub fn get_agent_pubkey(&self, account_id: AccountId) -> Option<String> {
        self.agents
            .get(&account_id)
            .and_then(|a| a.enc_pubkey)
            .map(hex::encode)
    }

    pub fn get_whitelisted_agents_for_local(&self) -> Vec<AccountId> {
        require!(
            !self.requires_tee,
            "Getting whitelisted agents is not supported for TEE"
        );
        self.whitelisted_agents_for_local.iter().cloned().collect()
    }

    pub fn is_project_allowlisted(&self, account_id: AccountId) -> bool {
        self.allowlisted_projects.contains(&account_id)
    }

    // --- mandates / verdicts ---

    pub fn get_mandate(&self, id: U64) -> Option<Mandate> {
        self.mandates.get(&id.0).cloned()
    }

    pub fn list_mandates(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Mandate> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.mandates.len()) as usize;
        self.mandates
            .iter()
            .skip(from)
            .take(limit)
            .map(|(_, m)| m.clone())
            .collect()
    }

    /// Verdicts for a mandate, from `from_epoch`, ordered by epoch, up to `limit`.
    pub fn get_verdicts(&self, id: U64, from_epoch: u32, limit: u32) -> Vec<EpochVerdict> {
        let id = id.0;
        let mut out: Vec<EpochVerdict> = self
            .verdicts
            .iter()
            .filter_map(|(key, verdict)| {
                let mandate_id = (key >> 32) as u64;
                let epoch = (key & 0xffff_ffff) as u32;
                if mandate_id == id && epoch >= from_epoch {
                    Some(EpochVerdict {
                        epoch,
                        verdict: verdict.clone(),
                    })
                } else {
                    None
                }
            })
            .collect();
        out.sort_by_key(|ev| ev.epoch);
        out.truncate(limit as usize);
        out
    }

    pub fn get_mm_summary(&self, account_id: AccountId) -> Option<MmSummary> {
        self.mm_summaries.get(&account_id).cloned()
    }

    pub fn list_mms(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MmListing> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.mm_summaries.len()) as usize;
        self.mm_summaries
            .iter()
            .skip(from)
            .take(limit)
            .map(|(account_id, summary)| MmListing {
                account_id: account_id.clone(),
                summary: summary.clone(),
            })
            .collect()
    }
}
