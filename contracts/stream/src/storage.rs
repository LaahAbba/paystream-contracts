use soroban_sdk::{Env, Address, BytesN, Vec};
use crate::types::{DataKey, Stream, StreamStatus, ERR_OVERFLOW};

/// Default minimum deposit (10_000 stroops = 0.001 XLM equivalent).
pub const DEFAULT_MIN_DEPOSIT: i128 = 10_000;
/// Default max active streams per employer.
pub const DEFAULT_STREAM_LIMIT: u32 = 1000;
/// Upgrade timelock: 48 hours in seconds.
pub const UPGRADE_TIMELOCK_SECS: u64 = 48 * 60 * 60;

pub fn save_stream(env: &Env, stream: &Stream) {
    env.storage().persistent().set(&DataKey::Stream(stream.id), stream);
}

pub fn load_stream(env: &Env, id: u64) -> Option<Stream> {
    env.storage().persistent().get(&DataKey::Stream(id))
}

pub fn next_id(env: &Env) -> u64 {
    let count: u64 = env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0);
    // Saturating add: stream IDs will never realistically reach u64::MAX, but
    // we use checked arithmetic throughout as a policy.
    let next = count.checked_add(1).expect("stream count overflow");
    env.storage().instance().set(&DataKey::StreamCount, &next);
    next
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

#[allow(dead_code)]
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).expect("admin not set")
}

pub fn get_min_deposit(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::MinDeposit).unwrap_or(DEFAULT_MIN_DEPOSIT)
}

pub fn set_min_deposit(env: &Env, amount: i128) {
    env.storage().instance().set(&DataKey::MinDeposit, &amount);
}

/// Tokens earned by employee up to `now` that have not yet been withdrawn.
///
/// All arithmetic uses checked or saturating operations to prevent overflow
/// with large `rate_per_second` or `elapsed` values (see issue #2).
pub fn claimable_amount(stream: &Stream, now: u64) -> i128 {
    match stream.status {
        StreamStatus::Cancelled | StreamStatus::Exhausted => return 0,
        _ => {}
    }
    // Cap at stop_time in one expression to avoid a branch in the common case.
    let effective_end = if stream.stop_time > 0 && now > stream.stop_time {
        stream.stop_time
    } else {
        now
    };
    // saturating_sub: elapsed is always >= 0 after this
    let elapsed = effective_end.saturating_sub(stream.last_withdraw_time) as i128;

    // checked_mul: panic with a descriptive message on overflow rather than
    // silently wrapping and producing an incorrect (possibly negative) payout.
    let earned = elapsed
        .checked_mul(stream.rate_per_second)
        .expect(ERR_OVERFLOW);

    // remaining can never be negative for a well-formed stream, but clamp to 0
    // defensively.
    let remaining = stream
        .deposit
        .checked_sub(stream.withdrawn)
        .unwrap_or(0)
        .max(0);

    earned.min(remaining).max(0)
}

/// Append `stream_id` to the employer's stream index.
/// Called once per `create_stream`; O(1) amortised — no full scan.
pub fn index_employer_stream(env: &Env, employer: &Address, stream_id: u64) {
    let key = DataKey::EmployerStreams(employer.clone());
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
    ids.push_back(stream_id);
    env.storage().persistent().set(&key, &ids);
}

/// Return all stream IDs owned by `employer`.
pub fn get_employer_streams(env: &Env, employer: &Address) -> Vec<u64> {
    let key = DataKey::EmployerStreams(employer.clone());
    env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env))
}

// ---------------------------------------------------------------------------
// Global pause (#271)
// ---------------------------------------------------------------------------

pub fn is_globally_paused(env: &Env) -> bool {
    env.storage().instance().get(&DataKey::GlobalPaused).unwrap_or(false)
}

pub fn set_globally_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::GlobalPaused, &paused);
}

// ---------------------------------------------------------------------------
// Employer stream count / limit (#283)
// ---------------------------------------------------------------------------

pub fn get_employer_stream_count(env: &Env, employer: &Address) -> u32 {
    env.storage().instance().get(&DataKey::EmployerStreamCount(employer.clone())).unwrap_or(0)
}

pub fn increment_employer_stream_count(env: &Env, employer: &Address) {
    let count = get_employer_stream_count(env, employer);
    env.storage().instance().set(&DataKey::EmployerStreamCount(employer.clone()), &(count + 1));
}

pub fn decrement_employer_stream_count(env: &Env, employer: &Address) {
    let count = get_employer_stream_count(env, employer);
    if count > 0 {
        env.storage().instance().set(&DataKey::EmployerStreamCount(employer.clone()), &(count - 1));
    }
}

pub fn get_stream_limit(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::EmployerStreamLimit).unwrap_or(DEFAULT_STREAM_LIMIT)
}

pub fn set_stream_limit(env: &Env, limit: u32) {
    env.storage().instance().set(&DataKey::EmployerStreamLimit, &limit);
}

// ---------------------------------------------------------------------------
// Upgrade pending (#270)
// ---------------------------------------------------------------------------

pub fn get_upgrade_pending(env: &Env) -> Option<(BytesN<32>, u64)> {
    env.storage().instance().get(&DataKey::UpgradePending)
}

pub fn set_upgrade_pending(env: &Env, new_wasm_hash: &BytesN<32>, scheduled_at: u64) {
    env.storage().instance().set(&DataKey::UpgradePending, &(new_wasm_hash.clone(), scheduled_at));
}

pub fn clear_upgrade_pending(env: &Env) {
    env.storage().instance().remove(&DataKey::UpgradePending);
}
