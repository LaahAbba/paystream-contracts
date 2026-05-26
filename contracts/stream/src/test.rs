#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

fn setup() -> (Env, StreamContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(StreamContract, ());
    let client = StreamContractClient::new(&env, &id);
    (env, client)
}

fn setup_token(env: &Env, admin: &Address) -> Address {
    let token_id = env.register(paystream_token::TokenContract, ());
    let token = paystream_token::TokenContractClient::new(env, &token_id);
    token.initialize(admin, &1_000_000_000);
    token_id
}

// ---------------------------------------------------------------------------
// Existing tests
// ---------------------------------------------------------------------------

#[test]
fn test_create_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &100);
    let id = client.create_stream(&employer, &employee, &token_id, &3600, &1, &0);
    assert_eq!(id, 1);
    assert_eq!(client.stream_count(), 1);

    let s = client.get_stream(&id);
    assert_eq!(s.status, StreamStatus::Active);
    assert_eq!(s.deposit, 3600);
    assert_eq!(s.rate_per_second, 1);
    assert_eq!(s.withdrawn, 0);
    // Guard must start unlocked
    assert!(!s.locked);
}

#[test]
fn test_claimable_increases_with_time() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 100);
    assert_eq!(client.claimable(&id), 1000);
}

#[test]
fn test_withdraw() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 200);
    let withdrawn = client.withdraw(&employee, &id);
    assert_eq!(withdrawn, 2000);

    let s = client.get_stream(&id);
    assert_eq!(s.withdrawn, 2000);
    assert_eq!(s.status, StreamStatus::Active);
    // Guard must be released after a successful withdraw
    assert!(!s.locked);
}

#[test]
fn test_stream_exhausted_when_fully_withdrawn() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &100);
    let id = client.create_stream(&employer, &employee, &token_id, &500, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 100);
    let withdrawn = client.withdraw(&employee, &id);
    assert_eq!(withdrawn, 500);
    assert_eq!(client.get_stream(&id).status, StreamStatus::Exhausted);
}

#[test]
fn test_pause_and_resume() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.pause_stream(&employer, &id);

    // Time passes while paused — should not accrue
    env.ledger().with_mut(|l| l.timestamp += 100);
    client.resume_stream(&employer, &id);

    // 50s after resume
    env.ledger().with_mut(|l| l.timestamp += 50);
    assert_eq!(client.claimable(&id), 1500); // 100s pre-pause + 50s post-resume = 150s active
}

#[test]
fn test_cancel_stream_refunds_employer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.cancel_stream(&employer, &id);

    let s = client.get_stream(&id);
    assert_eq!(s.status, StreamStatus::Cancelled);
    assert_eq!(s.withdrawn, 1000); // 100s * 10
}

#[test]
fn test_stop_time_caps_claimable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let now = env.ledger().timestamp();
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &(now + 50));

    env.ledger().with_mut(|l| l.timestamp += 200);
    assert_eq!(client.claimable(&id), 500); // capped at 50s * 10
}

/// Issue #15: paused 100s must not count toward claimable
#[test]
fn test_pause_excludes_paused_time() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    // 50s active → pause → 100s paused → resume → 50s active
    env.ledger().with_mut(|l| l.timestamp += 50);
    client.pause_stream(&employer, &id);
    env.ledger().with_mut(|l| l.timestamp += 100); // paused — must not count
    client.resume_stream(&employer, &id);
    env.ledger().with_mut(|l| l.timestamp += 50);

    // Only 50 + 50 = 100s of active time counted
    assert_eq!(client.claimable(&id), 1000);
}

/// Issue #15: multiple pause/resume cycles all exclude paused time
#[test]
fn test_multiple_pause_resume_cycles() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    // cycle 1: 30s active, 200s paused
    env.ledger().with_mut(|l| l.timestamp += 30);
    client.pause_stream(&employer, &id);
    env.ledger().with_mut(|l| l.timestamp += 200);
    client.resume_stream(&employer, &id);

    // cycle 2: 20s active, 300s paused
    env.ledger().with_mut(|l| l.timestamp += 20);
    client.pause_stream(&employer, &id);
    env.ledger().with_mut(|l| l.timestamp += 300);
    client.resume_stream(&employer, &id);

    // 40s active after last resume
    env.ledger().with_mut(|l| l.timestamp += 40);

    // Only 30 + 20 + 40 = 90s of active time → 900 tokens
    assert_eq!(client.claimable(&id), 900);
}

/// Issue #15: withdraw during pause returns 0 new accrual
#[test]
#[should_panic(expected = "stream not active")]
fn test_withdraw_during_pause_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    env.ledger().with_mut(|l| l.timestamp += 50);
    client.pause_stream(&employer, &id);
    env.ledger().with_mut(|l| l.timestamp += 100);
    // withdraw while paused must fail
    client.withdraw(&employee, &id);
}

#[test]
#[should_panic(expected = "stream not active")]
fn test_cannot_withdraw_from_cancelled_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
    client.cancel_stream(&employer, &id);

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.withdraw(&employee, &id);
}

// ---------------------------------------------------------------------------
// Issue #1 – Reentrancy guard
// ---------------------------------------------------------------------------

/// Verify that a stream with `locked = true` (simulating a mid-flight
/// cross-contract callback) is rejected with the E003 error code.
///
/// In production Soroban the host prevents true reentrancy, but this test
/// confirms the guard logic fires correctly if the flag is ever set.
#[test]
#[should_panic(expected = "E003")]
fn test_reentrant_withdraw_rejected() {
    use storage::save_stream;

    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);

    // Manually set the locked flag to simulate a reentrant call mid-flight
    env.as_contract(&client.address, || {
        let mut stream = storage::load_stream(&env, id).unwrap();
        stream.locked = true;
        save_stream(&env, &stream);
    });

    env.ledger().with_mut(|l| l.timestamp += 100);
    // This must panic with E003
    client.withdraw(&employee, &id);
}

// ---------------------------------------------------------------------------
// Issue #2 – Overflow / checked arithmetic
// ---------------------------------------------------------------------------

/// claimable_amount with rate = i128::MAX and elapsed = 2 must panic (overflow)
/// rather than silently wrap to a wrong value.
#[test]
#[should_panic(expected = "E004")]
fn test_claimable_overflow_panics() {
    use storage::claimable_amount;
    use types::{Stream, StreamStatus};

    let env = Env::default();
    let addr = Address::generate(&env);

    let stream = Stream {
        id: 1,
        employer: addr.clone(),
        employee: addr.clone(),
        token: addr.clone(),
        deposit: i128::MAX,
        withdrawn: 0,
        rate_per_second: i128::MAX,
        start_time: 0,
        stop_time: 0,
        last_withdraw_time: 0,
        status: StreamStatus::Active,
        paused_at: 0,
        locked: false,
    };

    // elapsed = 2, rate = i128::MAX → product overflows i128
    claimable_amount(&stream, 2);
}

/// Boundary value: rate = 1, elapsed = u64::MAX – claimable should equal
/// deposit (capped by remaining) without panicking.
#[test]
fn test_claimable_large_elapsed_capped_by_deposit() {
    use storage::claimable_amount;
    use types::{Stream, StreamStatus};

    let env = Env::default();
    let addr = Address::generate(&env);

    let deposit: i128 = 1_000_000;
    let stream = Stream {
        id: 1,
        employer: addr.clone(),
        employee: addr.clone(),
        token: addr.clone(),
        deposit,
        withdrawn: 0,
        rate_per_second: 1,
        start_time: 0,
        stop_time: 0,
        last_withdraw_time: 0,
        status: StreamStatus::Active,
        paused_at: 0,
        locked: false,
    };

    // elapsed = u64::MAX → earned = u64::MAX as i128, but capped to deposit
    let result = claimable_amount(&stream, u64::MAX);
    assert_eq!(result, deposit);
}

// ---------------------------------------------------------------------------
// Issue #3 – Zero-rate validation
// ---------------------------------------------------------------------------

/// Creating a stream with rate_per_second = 0 must panic with E001.
#[test]
#[should_panic(expected = "E001")]
fn test_create_stream_zero_rate_rejected() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    // rate_per_second = 0 → must panic
    client.create_stream(&employer, &employee, &token_id, &10_000, &0, &0);
}

/// Creating a stream with a valid positive rate must still succeed.
#[test]
fn test_create_stream_positive_rate_ok() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &3600, &1, &0);
    assert_eq!(id, 1);
    assert_eq!(client.get_stream(&id).rate_per_second, 1);
}

// ---------------------------------------------------------------------------
// Issue #271 – Emergency global pause
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "E005")]
fn test_create_stream_blocked_when_globally_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.pause_all();
    client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
}

#[test]
#[should_panic(expected = "E005")]
fn test_withdraw_blocked_when_globally_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
    env.ledger().with_mut(|l| l.timestamp += 100);
    client.pause_all();
    client.withdraw(&employee, &id);
}

#[test]
fn test_resume_all_unblocks_operations() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.pause_all();
    assert!(client.is_paused());
    client.resume_all();
    assert!(!client.is_paused());
    // Should succeed after resume
    client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
}

// ---------------------------------------------------------------------------
// Issue #283 – Per-employer stream limit
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "E006")]
fn test_stream_limit_exceeded() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.set_stream_limit(&2); // set limit to 2
    client.create_stream(&employer, &employee, &token_id, &1000, &1, &0);
    client.create_stream(&employer, &employee, &token_id, &1000, &1, &0);
    // Third stream must fail
    client.create_stream(&employer, &employee, &token_id, &1000, &1, &0);
}

#[test]
fn test_cancel_decrements_stream_count() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);

    client.initialize(&admin);
    client.set_stream_limit(&1);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
    client.cancel_stream(&employer, &id);
    // After cancel, slot is freed — should succeed
    client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0);
}

// ---------------------------------------------------------------------------
// Issue #270 – Upgrade mechanism with 48h timelock
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "E008")]
fn test_execute_upgrade_before_timelock_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    client.schedule_upgrade(&hash);
    // Only 1 hour has passed — timelock not elapsed
    env.ledger().with_mut(|l| l.timestamp += 3600);
    client.execute_upgrade();
}

#[test]
#[should_panic(expected = "E007")]
fn test_schedule_upgrade_twice_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    client.schedule_upgrade(&hash);
    client.schedule_upgrade(&hash); // second schedule must fail
}

#[test]
fn test_cancel_upgrade_clears_pending() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    client.schedule_upgrade(&hash);
    assert!(client.pending_upgrade().is_some());
    client.cancel_upgrade();
    assert!(client.pending_upgrade().is_none());
}
