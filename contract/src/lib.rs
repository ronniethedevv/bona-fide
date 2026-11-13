//! BonaFide contract — mandate registry and append-only verdict record.
//!
//! The agent registration / attestation / measurement-approval machinery is
//! reused from the Shade Agent template (NearDeFi/shade-agent-template @ 816b75b,
//! Apache-2.0) and extended with:
//!   - an X25519 `enc_pubkey` on each agent (for browser → enclave key intake),
//!   - a project allowlist (phase-1 trust registry),
//!   - Engagement Mandates (propose / cancel / co-sign),
//!   - append-only Verdicts (one per (mandate, epoch), never overwritten),
//!   - per-market-maker summaries for the directory.
//!
//! The ETH-oracle Chain-Signatures plumbing from the template is intentionally
//! omitted — it is out of scope for v1.

use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    env::{self, block_timestamp_ms},
    json_types::{U64, U128},
    log, near, require,
    serde::Serialize,
    serde_json,
    store::{IterableMap, IterableSet},
};
use shade_attestation::{
    attestation::{AcceptedDstackAttestation, DstackAttestation},
    measurements::{FullMeasurements, FullMeasurementsHex, create_mock_full_measurements_hex},
    report_data::ReportData,
    tcb_info::HexBytes,
};

pub use internal::events::Event;
pub use internal::helpers::AgentRemovalReason;
pub use mandates::{Mandate, MandateStatus, MandateTerms};
pub use verdicts::{DataSource, Verdict, VerdictInput, VerdictStatus};
pub use views::{AgentValidity, AgentView, ContractInfo, EpochVerdict};

mod internal;
mod mandates;
mod migrate;
mod owner;
mod verdicts;
pub mod views;

pub type Ppid = HexBytes<16>;

/// A registered agent. Extends the template's agent with an X25519 encryption
/// public key, so the browser can seal the MM's exchange key to the enclave.
#[near(serializers = [borsh])]
pub struct Agent {
    pub measurements: FullMeasurementsHex,
    pub ppid: Ppid,
    pub valid_until_ms: u64,
    /// The enclave's X25519 public key, published by the agent after it
    /// registers (via `set_enc_pubkey`). `None` until then.
    pub enc_pubkey: Option<[u8; 32]>,
}

/// Per-market-maker rollup powering the directory and profile screens.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct MmSummary {
    pub engagements: u32,
    pub pass: u32,
    pub fail: u32,
    pub missed: u32,
    pub outage: u32,
    pub last_verdict_ms: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    // --- attestation / agents (from the template) ---
    pub requires_tee: bool,
    pub attestation_expiration_time_ms: u64,
    pub owner_id: AccountId,
    pub approved_measurements: IterableSet<FullMeasurementsHex>,
    pub approved_ppids: IterableSet<Ppid>,
    pub agents: IterableMap<AccountId, Agent>,
    pub whitelisted_agents_for_local: IterableSet<AccountId>,
    // --- BonaFide ---
    pub allowlisted_projects: IterableSet<AccountId>,
    pub mandates: IterableMap<u64, Mandate>,
    /// Keyed by `(mandate_id << 32) | epoch`.
    pub verdicts: IterableMap<u128, Verdict>,
    pub mm_summaries: IterableMap<AccountId, MmSummary>,
    pub next_mandate_id: u64,
}

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    ApprovedMeasurements,
    ApprovedPpids,
    Agents,
    WhitelistedAgentsForLocal,
    AllowlistedProjects,
    Mandates,
    Verdicts,
    MmSummaries,
}

/// Rough storage bytes a new agent adds (measurements + ppid + validity + 32-byte
/// enc_pubkey + map overhead). Agents attach at least this much on first register.
const STORAGE_BYTES_TO_REGISTER: u128 = 600;

/// Pack a mandate id and epoch into a single verdict key.
pub(crate) fn verdict_key(mandate_id: u64, epoch: u32) -> u128 {
    ((mandate_id as u128) << 32) | (epoch as u128)
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn new(
        requires_tee: bool,
        attestation_expiration_time_ms: U64,
        owner_id: AccountId,
    ) -> Self {
        Self {
            requires_tee,
            attestation_expiration_time_ms: attestation_expiration_time_ms.into(),
            owner_id,
            approved_measurements: IterableSet::new(StorageKey::ApprovedMeasurements),
            approved_ppids: IterableSet::new(StorageKey::ApprovedPpids),
            agents: IterableMap::new(StorageKey::Agents),
            whitelisted_agents_for_local: IterableSet::new(StorageKey::WhitelistedAgentsForLocal),
            allowlisted_projects: IterableSet::new(StorageKey::AllowlistedProjects),
            mandates: IterableMap::new(StorageKey::Mandates),
            verdicts: IterableMap::new(StorageKey::Verdicts),
            mm_summaries: IterableMap::new(StorageKey::MmSummaries),
            next_mandate_id: 0,
        }
    }

    /// Register (or re-register) the calling agent. Must be called by the agent
    /// itself. Signature matches the Shade Agent template so `@neardefi/
    /// shade-agent-js`'s `register()` works unchanged; the agent publishes its
    /// encryption key separately via [`set_enc_pubkey`]. A re-registration keeps
    /// any previously published `enc_pubkey`.
    #[payable]
    pub fn register_agent(&mut self, attestation: DstackAttestation) -> bool {
        let predecessor = env::predecessor_account_id();
        let existing_pubkey = self.agents.get(&predecessor).and_then(|a| a.enc_pubkey);

        if existing_pubkey.is_none() && self.agents.get(&predecessor).is_none() {
            let storage_cost = env::storage_byte_cost()
                .checked_mul(STORAGE_BYTES_TO_REGISTER)
                .unwrap();
            require!(
                env::attached_deposit() >= storage_cost,
                &format!(
                    "Attached deposit must be greater than storage cost {:?}",
                    storage_cost.exact_amount_display()
                )
            );
        }

        // Verify the attestation and get the measurements and PPID for the agent.
        let (measurements, ppid, advisory_ids) = self.verify_attestation(attestation);

        let valid_until_ms = block_timestamp_ms() + self.attestation_expiration_time_ms;
        let (advisory_ids_truncated, number_of_advisory_ids) =
            internal::events::summarize_advisory_ids(&advisory_ids);

        Event::AgentRegistered {
            account_id: &predecessor,
            measurements: &measurements,
            ppid: &ppid,
            advisory_ids_truncated,
            number_of_advisory_ids,
            current_time_ms: U64::from(block_timestamp_ms()),
            valid_until_ms: U64::from(valid_until_ms),
        }
        .emit();

        self.agents.insert(
            predecessor,
            Agent {
                measurements,
                ppid,
                valid_until_ms,
                enc_pubkey: existing_pubkey,
            },
        );

        true
    }

    /// Publish (or rotate) the calling agent's X25519 encryption public key, hex
    /// of 32 bytes. Only a currently-valid registered agent may call. The browser
    /// seals the MM's exchange key to this key for intake.
    pub fn set_enc_pubkey(&mut self, enc_pubkey: String) {
        self.assert_registered_valid_agent();
        let decoded = decode_enc_pubkey(&enc_pubkey);
        let account_id = env::predecessor_account_id();
        let agent = self
            .agents
            .get_mut(&account_id)
            .expect("Agent not registered");
        agent.enc_pubkey = Some(decoded);
    }
}

/// Decode a hex X25519 public key into 32 bytes, panicking on malformed input.
fn decode_enc_pubkey(enc_pubkey: &str) -> [u8; 32] {
    let bytes = hex::decode(enc_pubkey).expect("enc_pubkey must be hex");
    require!(bytes.len() == 32, "enc_pubkey must be 32 bytes");
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    out
}

#[cfg(test)]
mod tests;
