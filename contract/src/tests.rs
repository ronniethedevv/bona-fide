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
    c.register_agent(create_mock_dstack_attestation());
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
fn register_then_publish_enc_pubkey() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    // No key published yet.
    assert_eq!(c.get_agent(agent()).expect("registered").enc_pubkey, None);
    assert_eq!(c.get_agent_pubkey(agent()), None);

    // Agent publishes its enclave key.
    testing_env!(ctx(agent(), None, 0).build());
    c.set_enc_pubkey(ENC_PK_HEX.to_string());
    assert_eq!(
        c.get_agent(agent()).unwrap().enc_pubkey.as_deref(),
        Some(ENC_PK_HEX)
    );
    assert_eq!(c.get_agent_pubkey(agent()).unwrap(), ENC_PK_HEX);
}

#[test]
#[should_panic(expected = "Agent not registered")]
fn set_enc_pubkey_requires_registration() {
    let mut c = setup();
    testing_env!(ctx(agent(), None, 0).build());
    c.set_enc_pubkey(ENC_PK_HEX.to_string());
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

fn tag_a() -> String {
    "ab".repeat(32) // 64 hex chars
}
fn tag_b() -> String {
    "cd".repeat(32)
}

#[test]
fn attest_binding_sets_verified() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);

    assert!(!c.get_mandate(U64::from(id)).unwrap().account_verified);
    testing_env!(ctx(agent(), None, 0).build());
    c.attest_account_binding(U64::from(id), tag_a());

    let m = c.get_mandate(U64::from(id)).unwrap();
    assert!(m.account_verified);
    assert_eq!(m.account_tag, Some(tag_a()));
    // Re-attesting the same tag is idempotent.
    testing_env!(ctx(agent(), None, 0).build());
    c.attest_account_binding(U64::from(id), tag_a());
}

#[test]
#[should_panic(expected = "Agent not registered")]
fn attest_binding_rejects_non_agent() {
    let mut c = setup();
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    testing_env!(ctx(mm(), None, 0).build());
    c.attest_account_binding(U64::from(id), tag_a());
}

#[test]
#[should_panic(expected = "account mismatch")]
fn attest_binding_is_immutable_account() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    testing_env!(ctx(agent(), None, 0).build());
    c.attest_account_binding(U64::from(id), tag_a());
    // A different account tag (an account swap) must be rejected.
    testing_env!(ctx(agent(), None, 0).build());
    c.attest_account_binding(U64::from(id), tag_b());
}

#[test]
#[should_panic(expected = "64 hex")]
fn attest_binding_rejects_bad_tag() {
    let mut c = setup();
    register_agent_local(&mut c, 0);
    let id = propose(&mut c);
    allowlist_and_cosign(&mut c, id);
    testing_env!(ctx(agent(), None, 0).build());
    c.attest_account_binding(U64::from(id), "ab".repeat(31)); // 62 chars
}

// --- state migration (v1 → identity binding) -------------------------------
//
// The deployed v1 contract wrote mandates without `account_verified` /
// `account_tag`. Borsh has no field tags, so those bytes are two fields short
// of what the current `Mandate` expects: without `migrate`, an upgraded
// contract panics on every read of its own mandates. These tests build real v1
// state, run the migration, and check the record came through intact.

use crate::migrate::{OldContract, OldMandate};

fn old_mandate(id: u64, status: MandateStatus) -> OldMandate {
    OldMandate {
        id: U64::from(id),
        mm: mm(),
        project: project(),
        exchange: "binance".to_string(),
        pair: "TOKEN_USDT".to_string(),
        account_label: format!("mm-{id}"),
        max_spread_bps: 50,
        depth_band_bps: 200,
        min_depth_per_side_quote: U128::from(10_000_000_000),
        min_uptime_bps: 9_000,
        loan_cap_per_epoch_base: U128::from(1_000_000),
        epoch_secs: 120,
        sample_secs: 30,
        start_ts: U64::from(0),
        end_ts: U64::from(1_200),
        status,
        terms_hash: "a".repeat(64),
    }
}

/// Write v1 state with `count` mandates, exactly as the old code would have.
fn write_v1_state(count: u64) {
    let mut mandates: IterableMap<u64, OldMandate> = IterableMap::new(StorageKey::Mandates);
    for id in 0..count {
        mandates.insert(id, old_mandate(id, MandateStatus::Active));
    }
    let mut mm_summaries: IterableMap<AccountId, MmSummary> =
        IterableMap::new(StorageKey::MmSummaries);
    mm_summaries.insert(
        mm(),
        MmSummary {
            engagements: count as u32,
            pass: 2,
            fail: 1,
            missed: 0,
            outage: 0,
            last_verdict_ms: U64::from(42),
        },
    );
    let mut allowlisted_projects: IterableSet<AccountId> =
        IterableSet::new(StorageKey::AllowlistedProjects);
    allowlisted_projects.insert(project());

    let old = OldContract {
        requires_tee: false,
        attestation_expiration_time_ms: 100_000,
        owner_id: owner(),
        approved_measurements: IterableSet::new(StorageKey::ApprovedMeasurements),
        approved_ppids: IterableSet::new(StorageKey::ApprovedPpids),
        agents: IterableMap::new(StorageKey::Agents),
        whitelisted_agents_for_local: IterableSet::new(StorageKey::WhitelistedAgentsForLocal),
        allowlisted_projects,
        mandates,
        verdicts: IterableMap::new(StorageKey::Verdicts),
        mm_summaries,
        next_mandate_id: count,
    };
    env::state_write(&old);
}

#[test]
fn migrate_preserves_mandates_and_defaults_the_new_fields() {
    testing_env!(ctx(owner(), None, 0).build());
    write_v1_state(3);

    let c = Contract::migrate();

    let all = c.list_mandates(None, None);
    assert_eq!(all.len(), 3, "every v1 mandate must survive the migration");
    for (i, m) in all.iter().enumerate() {
        assert_eq!(m.id.0, i as u64);
        assert_eq!(m.mm, mm());
        assert_eq!(m.project, project());
        assert_eq!(m.account_label, format!("mm-{i}"));
        assert_eq!(m.status, MandateStatus::Active);
        assert_eq!(m.terms_hash, "a".repeat(64));
        // Nothing is verified retroactively: a tag can only come from an
        // attested agent calling attest_account_binding after the upgrade.
        assert!(!m.account_verified);
        assert_eq!(m.account_tag, None);
    }
}

#[test]
fn migrate_preserves_the_rest_of_the_record() {
    testing_env!(ctx(owner(), None, 0).build());
    write_v1_state(2);

    let c = Contract::migrate();

    assert_eq!(c.owner_id, owner());
    assert_eq!(c.next_mandate_id, 2, "ids must not be reused after upgrade");
    assert!(!c.requires_tee);
    assert_eq!(c.attestation_expiration_time_ms, 100_000);
    assert!(c.is_project_allowlisted(project()));
    let summary = c.get_mm_summary(mm()).expect("summary survives");
    assert_eq!(summary.pass, 2);
    assert_eq!(summary.fail, 1);
    assert_eq!(summary.last_verdict_ms.0, 42);
}

#[test]
fn migrated_contract_accepts_new_mandates_and_bindings() {
    testing_env!(ctx(owner(), None, 0).build());
    write_v1_state(2);
    let mut c = Contract::migrate();

    // The upgraded contract keeps working: a new mandate gets the next free id,
    // and the identity binding the upgrade was for actually functions.
    c.approve_measurements(create_mock_full_measurements_hex());
    c.approve_ppids(vec![Ppid::default()]);
    register_agent_local(&mut c, 0);

    testing_env!(ctx(mm(), None, 0).build());
    let id = c.propose_mandate(demo_terms());
    assert_eq!(id.0, 2, "new mandate continues from the migrated counter");
    testing_env!(ctx(project(), None, 0).build());
    c.cosign_mandate(id);

    testing_env!(ctx(agent(), None, 0).build());
    let tag = "b".repeat(64);
    c.attest_account_binding(id, tag.clone());

    let m = c.get_mandate(id).expect("mandate");
    assert!(m.account_verified);
    assert_eq!(m.account_tag, Some(tag));
}

#[test]
#[should_panic(expected = "No v1 state to migrate")]
fn migrate_refuses_when_there_is_no_state() {
    testing_env!(ctx(owner(), None, 0).build());
    Contract::migrate();
}
