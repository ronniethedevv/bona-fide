use crate::*;

/// Lifecycle of an Engagement Mandate.
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum MandateStatus {
    Proposed,
    Active,
    Completed,
    Cancelled,
}

/// The terms a market maker proposes. The `terms_hash` stored on the mandate is
/// `sha256` of the canonical JSON of exactly these fields, in this order.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct MandateTerms {
    pub project: AccountId,
    pub exchange: String,
    pub pair: String,
    /// Human label only — never a key or exchange UID.
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
}

/// A stored Engagement Mandate.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Mandate {
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

/// sha256(canonical JSON of the terms), hex-encoded. Deterministic: serde emits
/// struct fields in declaration order, so the agent can recompute the same hash.
pub fn compute_terms_hash(terms: &MandateTerms) -> String {
    let json = serde_json::to_string(terms).expect("serialize terms");
    hex::encode(env::sha256(json.as_bytes()))
}

#[near]
impl Contract {
    /// Propose a mandate. The caller becomes the market maker; status is `Proposed`.
    pub fn propose_mandate(&mut self, terms: MandateTerms) -> U64 {
        require!(
            terms.start_ts.0 < terms.end_ts.0,
            "start_ts must be before end_ts"
        );
        require!(
            terms.epoch_secs > 0 && terms.sample_secs > 0,
            "epoch/sample secs must be > 0"
        );
        // `u32::is_multiple_of` is only stable from Rust 1.87; the Shade builder
        // image uses 1.86, so keep the manual form.
        #[allow(clippy::manual_is_multiple_of)]
        let whole_multiple = terms.epoch_secs % terms.sample_secs == 0;
        require!(
            whole_multiple,
            "epoch_secs must be a whole multiple of sample_secs"
        );
        require!(
            terms.min_uptime_bps <= 10_000,
            "min_uptime_bps must be <= 10000"
        );
        require!(
            terms.max_spread_bps <= 1_000_000,
            "max_spread_bps out of range"
        );
        require!(
            !terms.exchange.is_empty() && !terms.pair.is_empty(),
            "exchange/pair required"
        );

        let mm = env::predecessor_account_id();
        let id = self.next_mandate_id;
        self.next_mandate_id += 1;
        let terms_hash = compute_terms_hash(&terms);

        let mandate = Mandate {
            id: U64::from(id),
            mm: mm.clone(),
            project: terms.project.clone(),
            exchange: terms.exchange,
            pair: terms.pair,
            account_label: terms.account_label,
            max_spread_bps: terms.max_spread_bps,
            depth_band_bps: terms.depth_band_bps,
            min_depth_per_side_quote: terms.min_depth_per_side_quote,
            min_uptime_bps: terms.min_uptime_bps,
            loan_cap_per_epoch_base: terms.loan_cap_per_epoch_base,
            epoch_secs: terms.epoch_secs,
            sample_secs: terms.sample_secs,
            start_ts: terms.start_ts,
            end_ts: terms.end_ts,
            status: MandateStatus::Proposed,
            terms_hash,
        };

        Event::MandateProposed {
            id: U64::from(id),
            mm: &mm,
            project: &mandate.project,
        }
        .emit();
        self.mandates.insert(id, mandate);
        U64::from(id)
    }

    /// Cancel a mandate. Only the market maker, and only while `Proposed`.
    pub fn cancel_mandate(&mut self, id: U64) {
        let mandate = self.mandates.get_mut(&id.0).expect("Mandate not found");
        require!(
            mandate.mm == env::predecessor_account_id(),
            "Only the market maker can cancel"
        );
        require!(
            mandate.status == MandateStatus::Proposed,
            "Only a proposed mandate can be cancelled"
        );
        mandate.status = MandateStatus::Cancelled;
        Event::MandateCancelled { id }.emit();
    }

    /// Co-sign a mandate. Must be the named project, and allowlisted (I8).
    pub fn cosign_mandate(&mut self, id: U64) {
        let caller = env::predecessor_account_id();
        require!(
            self.allowlisted_projects.contains(&caller),
            "Project is not allowlisted"
        );
        let mm = {
            let mandate = self.mandates.get_mut(&id.0).expect("Mandate not found");
            require!(
                mandate.project == caller,
                "Only the named project can co-sign"
            );
            require!(
                mandate.status == MandateStatus::Proposed,
                "Only a proposed mandate can be co-signed"
            );
            mandate.status = MandateStatus::Active;
            mandate.mm.clone()
        };

        let mut summary = self.mm_summaries.get(&mm).cloned().unwrap_or_default();
        summary.engagements += 1;
        self.mm_summaries.insert(mm, summary);

        Event::MandateCosigned { id }.emit();
    }
}
