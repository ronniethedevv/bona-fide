use crate::*;

/// Grace period after an epoch closes before a missing verdict can be recorded.
const GRACE_SECS: u64 = 300;

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum VerdictStatus {
    Pass,
    Fail,
    Outage,
    Missed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum DataSource {
    Live,
    Replay,
}

/// The metrics an agent submits for a closed epoch (everything but `submitted_at`,
/// which the contract stamps).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct VerdictInput {
    pub status: VerdictStatus,
    pub uptime_bps: u32,
    pub median_spread_bps: u32,
    pub min_bid_depth_quote: U128,
    pub min_ask_depth_quote: U128,
    pub net_sells_base: U128,
    pub withdrawals_base: U128,
    pub coverage_bps: u32,
    pub fail_reasons: Vec<String>,
    pub terms_hash: String,
    pub codehash: String,
    pub data_source: DataSource,
}

/// A stored, permanent verdict.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Verdict {
    pub status: VerdictStatus,
    pub uptime_bps: u32,
    pub median_spread_bps: u32,
    pub min_bid_depth_quote: U128,
    pub min_ask_depth_quote: U128,
    pub net_sells_base: U128,
    pub withdrawals_base: U128,
    pub coverage_bps: u32,
    pub fail_reasons: Vec<String>,
    pub terms_hash: String,
    pub codehash: String,
    pub data_source: DataSource,
    pub submitted_at: U64,
}

impl Contract {
    /// Total number of epochs a mandate covers.
    fn total_epochs(mandate: &Mandate) -> u64 {
        (mandate.end_ts.0 - mandate.start_ts.0) / (mandate.epoch_secs as u64)
    }

    /// Timestamp (seconds) at which `epoch` closes.
    fn epoch_end_secs(mandate: &Mandate, epoch: u32) -> u64 {
        mandate.start_ts.0 + (epoch as u64 + 1) * (mandate.epoch_secs as u64)
    }

    fn bump_summary(&mut self, mm: AccountId, status: &VerdictStatus, now_ms: u64) {
        let mut summary = self.mm_summaries.get(&mm).cloned().unwrap_or_default();
        match status {
            VerdictStatus::Pass => summary.pass += 1,
            VerdictStatus::Fail => summary.fail += 1,
            VerdictStatus::Outage => summary.outage += 1,
            VerdictStatus::Missed => summary.missed += 1,
        }
        summary.last_verdict_ms = U64::from(now_ms);
        self.mm_summaries.insert(mm, summary);
    }
}

#[near]
impl Contract {
    /// Submit a verdict for a closed epoch. Only a currently-valid registered
    /// agent may call (I5). One verdict per (mandate, epoch); never overwritten (I6).
    pub fn submit_verdict(&mut self, mandate_id: U64, epoch: u32, verdict: VerdictInput) {
        self.assert_registered_valid_agent();

        let key = verdict_key(mandate_id.0, epoch);
        require!(
            self.verdicts.get(&key).is_none(),
            "Verdict already recorded"
        );

        let (mm, terms_hash_matches, epoch_in_range) = {
            let mandate = self.mandates.get(&mandate_id.0).expect("Mandate not found");
            require!(
                mandate.status == MandateStatus::Active,
                "Mandate is not active"
            );
            (
                mandate.mm.clone(),
                verdict.terms_hash == mandate.terms_hash,
                (epoch as u64) < Self::total_epochs(mandate),
            )
        };
        require!(terms_hash_matches, "terms_hash does not match the mandate");
        require!(epoch_in_range, "epoch out of range for this mandate");

        // Sanity bounds (pre-sign guard #3).
        require!(verdict.coverage_bps <= 10_000, "coverage_bps out of range");
        require!(verdict.uptime_bps <= 10_000, "uptime_bps out of range");
        require!(
            verdict.median_spread_bps <= 1_000_000,
            "median_spread_bps out of range"
        );

        let now_ms = block_timestamp_ms();
        let status = verdict.status.clone();
        let stored = Verdict {
            status: verdict.status,
            uptime_bps: verdict.uptime_bps,
            median_spread_bps: verdict.median_spread_bps,
            min_bid_depth_quote: verdict.min_bid_depth_quote,
            min_ask_depth_quote: verdict.min_ask_depth_quote,
            net_sells_base: verdict.net_sells_base,
            withdrawals_base: verdict.withdrawals_base,
            coverage_bps: verdict.coverage_bps,
            fail_reasons: verdict.fail_reasons,
            terms_hash: verdict.terms_hash,
            codehash: verdict.codehash,
            data_source: verdict.data_source,
            submitted_at: U64::from(now_ms),
        };

        self.verdicts.insert(key, stored);
        self.bump_summary(mm, &status, now_ms);
        Event::VerdictRecorded {
            mandate_id,
            epoch,
            status: status_str(&status),
        }
        .emit();
    }

    /// Record a missing verdict once `epoch_end + grace` has passed with no
    /// verdict (I7). Anyone may call.
    pub fn record_missed(&mut self, mandate_id: U64, epoch: u32) {
        let key = verdict_key(mandate_id.0, epoch);
        require!(
            self.verdicts.get(&key).is_none(),
            "Verdict already recorded"
        );

        let (mm, terms_hash, end_secs, in_range) = {
            let mandate = self.mandates.get(&mandate_id.0).expect("Mandate not found");
            require!(
                mandate.status == MandateStatus::Active,
                "Mandate is not active"
            );
            (
                mandate.mm.clone(),
                mandate.terms_hash.clone(),
                Self::epoch_end_secs(mandate, epoch),
                (epoch as u64) < Self::total_epochs(mandate),
            )
        };
        require!(in_range, "epoch out of range for this mandate");

        let now_secs = block_timestamp_ms() / 1000;
        require!(
            now_secs >= end_secs + GRACE_SECS,
            "Epoch has not closed past the grace period yet"
        );

        let now_ms = block_timestamp_ms();
        let stored = Verdict {
            status: VerdictStatus::Missed,
            uptime_bps: 0,
            median_spread_bps: 0,
            min_bid_depth_quote: U128::from(0),
            min_ask_depth_quote: U128::from(0),
            net_sells_base: U128::from(0),
            withdrawals_base: U128::from(0),
            coverage_bps: 0,
            fail_reasons: vec!["MISSED".to_string()],
            terms_hash,
            codehash: String::new(),
            data_source: DataSource::Live,
            submitted_at: U64::from(now_ms),
        };

        self.verdicts.insert(key, stored);
        self.bump_summary(mm, &VerdictStatus::Missed, now_ms);
        Event::VerdictRecorded {
            mandate_id,
            epoch,
            status: "missed",
        }
        .emit();
    }
}

pub(crate) fn status_str(status: &VerdictStatus) -> &'static str {
    match status {
        VerdictStatus::Pass => "pass",
        VerdictStatus::Fail => "fail",
        VerdictStatus::Outage => "outage",
        VerdictStatus::Missed => "missed",
    }
}
