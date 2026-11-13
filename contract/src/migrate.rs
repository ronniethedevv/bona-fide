//! State migration for the identity-binding upgrade.
//!
//! `Mandate` gained two fields (`account_verified`, `account_tag`). Borsh lays a
//! struct out as its fields in declaration order with no tags, so a mandate
//! written by the previous code is two fields short and the new code cannot
//! deserialize it: every `get_mandate`, `list_mandates` and `submit_verdict`
//! would panic on a contract upgraded in place without this.
//!
//! `update_contract` already chains a call to `migrate` after deploying — but no
//! `migrate` existed, so that call failed while the deploy (a separate receipt)
//! stood. Upgrading was a one-way trip to an unreadable contract. This provides
//! the function that call expects.
//!
//! The migration reads the old state, rewrites every mandate with the two new
//! fields defaulted (not verified, no tag — nothing is retroactively claimed),
//! and leaves agents, verdicts, summaries and the allowlist untouched.
use crate::*;

/// `Mandate` exactly as the deployed v1 contract wrote it: the current struct
/// minus the two trailing fields. Field order is the Borsh layout, so it must
/// stay identical to the old declaration.
#[near(serializers = [borsh])]
pub struct OldMandate {
    pub id: U64,
    pub mm: AccountId,
    pub project: AccountId,
    pub exchange: String,
    pub pair: String,
    pub account_label: String,
    pub max_spread_bps: u32,
    pub depth_band_bps: u32,
    pub min_depth_per_side_quote: U128,
    pub min_uptime_bps: u32,
    pub loan_cap_per_epoch_base: U128,
    pub epoch_secs: u32,
    pub sample_secs: u32,
    pub start_ts: U64,
    pub end_ts: U64,
    pub status: MandateStatus,
    pub terms_hash: String,
}

/// The contract state as v1 wrote it. Identical to `Contract` except for the
/// mandate type, and in the same field order.
#[near(serializers = [borsh])]
pub struct OldContract {
    pub requires_tee: bool,
    pub attestation_expiration_time_ms: u64,
    pub owner_id: AccountId,
    pub approved_measurements: IterableSet<FullMeasurementsHex>,
    pub approved_ppids: IterableSet<Ppid>,
    pub agents: IterableMap<AccountId, Agent>,
    pub whitelisted_agents_for_local: IterableSet<AccountId>,
    pub allowlisted_projects: IterableSet<AccountId>,
    pub mandates: IterableMap<u64, OldMandate>,
    pub verdicts: IterableMap<u128, Verdict>,
    pub mm_summaries: IterableMap<AccountId, MmSummary>,
    pub next_mandate_id: u64,
}

impl OldMandate {
    fn upgrade(self) -> Mandate {
        Mandate {
            id: self.id,
            mm: self.mm,
            project: self.project,
            exchange: self.exchange,
            pair: self.pair,
            account_label: self.account_label,
            max_spread_bps: self.max_spread_bps,
            depth_band_bps: self.depth_band_bps,
            min_depth_per_side_quote: self.min_depth_per_side_quote,
            min_uptime_bps: self.min_uptime_bps,
            loan_cap_per_epoch_base: self.loan_cap_per_epoch_base,
            epoch_secs: self.epoch_secs,
            sample_secs: self.sample_secs,
            start_ts: self.start_ts,
            end_ts: self.end_ts,
            status: self.status,
            terms_hash: self.terms_hash,
            // Nothing is claimed on anyone's behalf: a mandate becomes verified
            // only when an attested agent later calls `attest_account_binding`.
            account_verified: false,
            account_tag: None,
        }
    }
}

#[near]
impl Contract {
    /// Rewrite v1 state in the current layout. Called by `update_contract`
    /// immediately after the new code is deployed; `#[private]` so only the
    /// contract account itself can invoke it.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        // Note: this must run exactly once. `Contract` and `OldContract`
        // differ only in the mandate *element* type, and a map serializes as
        // its prefix, so v1 bytes deserialize happily as either — the version
        // cannot be told apart from inside the contract. Running it twice would
        // re-read already-migrated mandates as `OldMandate` and silently drop
        // the two new fields. `scripts/upgrade-contract.ts` therefore checks
        // whether the live contract already returns `account_verified` and
        // refuses to upgrade a contract that does.
        let mut old: OldContract = env::state_read().expect("No v1 state to migrate");

        // Read every mandate out, then clear the map so the new values can be
        // written under the same storage prefix without colliding with, or
        // leaking storage from, the old serialization.
        let upgraded: Vec<(u64, Mandate)> = old
            .mandates
            .drain()
            .map(|(id, m)| (id, m.upgrade()))
            .collect();
        old.mandates.flush();

        let mut mandates: IterableMap<u64, Mandate> = IterableMap::new(StorageKey::Mandates);
        for (id, mandate) in upgraded {
            mandates.insert(id, mandate);
        }

        log!("migrate: {} mandate(s) upgraded", mandates.len());

        Self {
            requires_tee: old.requires_tee,
            attestation_expiration_time_ms: old.attestation_expiration_time_ms,
            owner_id: old.owner_id,
            approved_measurements: old.approved_measurements,
            approved_ppids: old.approved_ppids,
            agents: old.agents,
            whitelisted_agents_for_local: old.whitelisted_agents_for_local,
            allowlisted_projects: old.allowlisted_projects,
            mandates,
            verdicts: old.verdicts,
            mm_summaries: old.mm_summaries,
            next_mandate_id: old.next_mandate_id,
        }
    }
}
