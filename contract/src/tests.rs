use crate::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::{NearToken, testing_env};
use shade_attestation::{
    attestation::create_mock_dstack_attestation, measurements::create_mock_full_measurements_hex,
};

// 0.01 NEAR — comfortably above STORAGE_BYTES_TO_REGISTER * storage_byte_cost.
const DEPOSIT: NearToken = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);
const ENC_PK_HEX: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 32 bytes

fn owner() -> AccountId {
    accounts(0)
}
fn mm() -> AccountId {
    accounts(1)
}
fn project() -> AccountId {
    accounts(2)
}
fn agent() -> AccountId {
    accounts(3)
}

fn ctx(predecessor: AccountId, deposit: Option<NearToken>, ts_ms: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(0))
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .block_timestamp(ts_ms * 1_000_000);
    if let Some(d) = deposit {
        b.attached_deposit(d);
    }
    b
}

fn setup() -> Contract {
    testing_env!(ctx(owner(), None, 0).build());
    let mut c = Contract::new(false, U64::from(100_000), owner());
    c.approve_measurements(create_mock_full_measurements_hex());
    c.approve_ppids(vec![Ppid::default()]);
    c
}

fn register_agent_local(c: &mut Contract, ts_ms: u64) {
    testing_env!(ctx(owner(), None, ts_ms).build());
    c.whitelist_agent_for_local(agent());
    testing_env!(ctx(agent(), Some(DEPOSIT), ts_ms).build());
    c.register_agent(create_mock_dstack_attestation(), ENC_PK_HEX.to_string());
}

fn demo_terms() -> MandateTerms {
    MandateTerms {
        project: project(),
        exchange: "binance".to_string(),
        pair: "TOKEN_USDT".to_string(),
        account_label: "mm-main".to_string(),
        max_spread_bps: 50,
        depth_band_bps: 200,
        min_depth_per_side_quote: U128::from(10_000_000_000),
        min_uptime_bps: 9000,
        loan_cap_per_epoch_base: U128::from(1_000_000),
        epoch_secs: 600,
        sample_secs: 30,
        start_ts: U64::from(1_000),
        end_ts: U64::from(2_800), // 3 epochs of 600s
    }
}

fn propose(c: &mut Contract) -> u64 {
    testing_env!(ctx(mm(), None, 0).build());
    c.propose_mandate(demo_terms()).0
}

fn allowlist_and_cosign(c: &mut Contract, id: u64) {
    testing_env!(ctx(owner(), None, 0).build());
    c.set_project_allowlisted(project(), true);
    testing_env!(ctx(project(), None, 0).build());
    c.cosign_mandate(U64::from(id));
}

fn pass_verdict(terms_hash: String) -> VerdictInput {
    VerdictInput {
        status: VerdictStatus::Pass,
        uptime_bps: 9500,
        median_spread_bps: 20,
        min_bid_depth_quote: U128::from(12_000_000_000),
        min_ask_depth_quote: U128::from(12_000_000_000),
        net_sells_base: U128::from(0),
        withdrawals_base: U128::from(0),
        coverage_bps: 10_000,
        fail_reasons: vec![],
        terms_hash,
        codehash: "deadbeef".to_string(),
        data_source: DataSource::Replay,
    }
}

#[test]
fn new_sets_owner() {
    let c = setup();
    assert_eq!(c.get_contract_info().owner_id, owner());
    assert!(!c.get_contract_info().requires_tee);
}

#[test]
fn register_agent_stores_enc_pubkey() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let view = c.get_agent(agent()).expect("agent registered");
    assert_eq!(view.enc_pubkey, ENC_PK_HEX);
    assert_eq!(c.get_agent_pubkey(agent()).unwrap(), ENC_PK_HEX);
}

#[test]
#[should_panic(expected = "Caller is not the owner")]
fn set_project_allowlisted_owner_only() {
    let mut c = setup();
    testing_env!(ctx(project(), None, 0).build());
    c.set_project_allowlisted(project(), true);
}

#[test]
fn propose_terms_hash_is_deterministic() {
    let mut c = setup();
    let id0 = propose(&mut c);
    let id1 = propose(&mut c);
    assert_ne!(id0, id1);
    let h0 = c.get_mandate(U64::from(id0)).unwrap().terms_hash;
    let h1 = c.get_mandate(U64::from(id1)).unwrap().terms_hash;
    assert_eq!(h0, h1);
    assert_eq!(h0.len(), 64); // sha256 hex
}

#[test]
#[should_panic(expected = "Only the market maker can cancel")]
fn cancel_only_by_mm() {
    let mut c = setup();
    let id = propose(&mut c);
    testing_env!(ctx(project(), None, 0).build());
    c.cancel_mandate(U64::from(id));
}

#[test]
#[should_panic(expected = "Project is not allowlisted")]
fn cosign_requires_allowlist() {
    let mut c = setup();
    let id = propose(&mut c);
    testing_env!(ctx(project(), None, 0).build());
    c.cosign_mandate(U64::from(id)); // not allowlisted yet (I8)
}

#[test]
#[should_panic(expected = "Only the named project can co-sign")]
fn cosign_only_named_project() {
    let mut c = setup();
    let id = propose(&mut c);
    testing_env!(ctx(owner(), None, 0).build());
    c.set_project_allowlisted(accounts(4), true);
    testing_env!(ctx(accounts(4), None, 0).build());
    c.cosign_mandate(U64::from(id)); // allowlisted but not the named project (I8)
}

#[test]
fn cosign_activates_and_counts_engagement() {
    let mut c = setup();
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    assert_eq!(
        c.get_mandate(U64::from(id)).unwrap().status,
        MandateStatus::Active
    );
    assert_eq!(c.get_mm_summary(mm()).unwrap().engagements, 1);
}

#[test]
#[should_panic(expected = "Agent not registered")]
fn submit_verdict_rejects_non_agent() {
    let mut c = setup();
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    let th = c.get_mandate(U64::from(id)).unwrap().terms_hash;
    testing_env!(ctx(mm(), None, 0).build()); // mm is not an agent (I5)
    c.submit_verdict(U64::from(id), 0, pass_verdict(th));
}

#[test]
fn submit_verdict_happy_and_no_overwrite() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    let th = c.get_mandate(U64::from(id)).unwrap().terms_hash;

    testing_env!(ctx(agent(), None, 0).build());
    c.submit_verdict(U64::from(id), 0, pass_verdict(th.clone()));

    let verdicts = c.get_verdicts(U64::from(id), 0, 10);
    assert_eq!(verdicts.len(), 1);
    assert_eq!(verdicts[0].epoch, 0);
    assert_eq!(verdicts[0].verdict.status, VerdictStatus::Pass);
    assert_eq!(verdicts[0].verdict.data_source, DataSource::Replay);
    assert_eq!(c.get_mm_summary(mm()).unwrap().pass, 1);

    // I6: a second verdict for the same epoch must be rejected.
    let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        testing_env!(ctx(agent(), None, 0).build());
        c.submit_verdict(U64::from(id), 0, pass_verdict(th));
    }));
    assert!(err.is_err());
}

#[test]
#[should_panic(expected = "terms_hash does not match")]
fn submit_verdict_rejects_terms_hash_mismatch() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    testing_env!(ctx(agent(), None, 0).build());
    c.submit_verdict(U64::from(id), 0, pass_verdict("00".repeat(32)));
}

#[test]
#[should_panic(expected = "Epoch has not closed")]
fn record_missed_rejected_before_grace() {
    let mut c = setup();
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    // epoch 0 closes at 1600s; +300 grace = 1900s. now = 1000s → too early (I7).
    testing_env!(ctx(accounts(5), None, 1_000_000).build());
    c.record_missed(U64::from(id), 0);
}

#[test]
fn record_missed_after_grace_records_miss() {
    let mut c = setup();
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    // now = 1900s ≥ 1600 + 300.
    testing_env!(ctx(accounts(5), None, 1_900_000).build());
    c.record_missed(U64::from(id), 0);

    let verdicts = c.get_verdicts(U64::from(id), 0, 10);
    assert_eq!(verdicts.len(), 1);
    assert_eq!(verdicts[0].verdict.status, VerdictStatus::Missed);
    assert_eq!(c.get_mm_summary(mm()).unwrap().missed, 1);

    // Cannot also submit/record for the same epoch afterwards (I7/I6).
    let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        testing_env!(ctx(accounts(5), None, 2_000_000).build());
        c.record_missed(U64::from(id), 0);
    }));
    assert!(err.is_err());
}
