// SPDX-License-Identifier: Apache-2.0

// ---------------------------------------------------------------------------
// Storage layout (#272)
//
// Instance storage keys (live with the contract instance, no TTL management):
//   Config              ContractConfig  — packed scalar config (min_deposit, fee_bps,
//                                         max_streams, admin_nonce, paused).
//                                         Replaces 5 individual keys; reduces instance
//                                         reads per hot-path call from ≥3 to 1.
//   Admin               Address         — current admin
//   PendingAdmin        Address         — proposed admin (two-step transfer)
//   FeeRecipient        Address         — protocol fee recipient
//   PendingEmployer(id) Address         — proposed new employer per stream
//   StreamCount         u64             — monotonic stream ID counter
//   ProposalCount       u64             — monotonic proposal ID counter
//   AllowedTokens       Vec<Address>    — token allowlist (#292)
//
// Persistent storage keys (explicit TTL management, TTL_THRESHOLD / TTL_EXTEND_TO):
//   Stream(id)          Stream          — full stream state
//   EmployerStreams(addr) Vec<u64>      — stream IDs per employer
//   EmployeeStreams(addr) Vec<u64>      — stream IDs per employee
//   PauseHistory(id)    Vec<PauseEvent> — pause/resume history per stream
//   Proposal(id)        Proposal        — governance proposal
//   Voted(id, addr)     bool            — vote record
// ---------------------------------------------------------------------------

use soroban_sdk::{Env, Address, Vec};
use crate::types::{
    ContractConfig, DataKey, PauseEvent, Proposal, ProposalStatus, Stream, StreamStatus,
    ERR_OVERFLOW, ERR_BAD_NONCE,
};

pub const DEFAULT_MIN_DEPOSIT: i128 = 10_000;
/// Default max active streams per employer.
pub const DEFAULT_STREAM_LIMIT: u32 = 1000;
/// Upgrade timelock: 48 hours in seconds.
pub const UPGRADE_TIMELOCK_SECS: u64 = 48 * 60 * 60;

const TTL_THRESHOLD: u32 = 6_307_200;
const TTL_EXTEND_TO: u32 = 12_614_400;

// ---------------------------------------------------------------------------
// Packed config helpers (#272)
// ---------------------------------------------------------------------------

/// Load the packed config, returning defaults if not yet set.
pub fn load_config(env: &Env) -> ContractConfig {
    env.storage().instance().get(&DataKey::Config).unwrap_or_else(ContractConfig::default)
}

/// Persist the packed config.
pub fn save_config(env: &Env, cfg: &ContractConfig) {
    env.storage().instance().set(&DataKey::Config, cfg);
}

// ---------------------------------------------------------------------------
// Stream storage
// ---------------------------------------------------------------------------

pub fn save_stream(env: &Env, stream: &Stream) {
    let key = DataKey::Stream(stream.id);
    env.storage().persistent().set(&key, stream);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn load_stream(env: &Env, id: u64) -> Option<Stream> {
    let key = DataKey::Stream(id);
    let stream: Option<Stream> = env.storage().persistent().get(&key);
    if stream.is_some() {
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    stream
}

pub fn next_id(env: &Env) -> u64 {
    let count: u64 = env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0);
    let next = count.checked_add(1).expect("stream count overflow");
    env.storage().instance().set(&DataKey::StreamCount, &next);
    next
}

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

#[allow(dead_code)]
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).expect("admin not set")
}

pub fn set_pending_admin(env: &Env, pending: &Address) {
    env.storage().instance().set(&DataKey::PendingAdmin, pending);
}

pub fn get_pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingAdmin)
}

pub fn clear_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
}

// ---------------------------------------------------------------------------
// Config field accessors — each reads/writes the single packed Config entry.
// One instance-storage read serves all callers in the same invocation because
// Soroban caches instance storage within a transaction.
// ---------------------------------------------------------------------------

pub fn get_min_deposit(env: &Env) -> i128 {
    load_config(env).min_deposit
}

pub fn set_min_deposit(env: &Env, amount: i128) {
    let mut cfg = load_config(env);
    cfg.min_deposit = amount;
    save_config(env, &cfg);
}

pub fn get_admin_nonce(env: &Env) -> u64 {
    load_config(env).admin_nonce
}

pub fn consume_admin_nonce(env: &Env, nonce: u64) {
    let mut cfg = load_config(env);
    assert!(nonce == cfg.admin_nonce, "{}", ERR_BAD_NONCE);
    cfg.admin_nonce += 1;
    save_config(env, &cfg);
}

pub fn get_fee_bps(env: &Env) -> u32 {
    load_config(env).fee_bps
}

pub fn set_fee_bps(env: &Env, bps: u32) {
    let mut cfg = load_config(env);
    cfg.fee_bps = bps;
    save_config(env, &cfg);
}

pub fn get_fee_recipient(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::FeeRecipient)
}

pub fn set_fee_recipient(env: &Env, recipient: &Address) {
    env.storage().instance().set(&DataKey::FeeRecipient, recipient);
}

pub fn get_max_streams_per_employer(env: &Env) -> u32 {
    load_config(env).max_streams
}

pub fn set_max_streams_per_employer(env: &Env, limit: u32) {
    let mut cfg = load_config(env);
    cfg.max_streams = limit;
    save_config(env, &cfg);
}

// ---------------------------------------------------------------------------
// Contract pause (stored in packed config)
// ---------------------------------------------------------------------------

pub fn get_paused_cfg(env: &Env) -> bool {
    load_config(env).paused
}

pub fn set_paused_cfg(env: &Env, paused: bool) {
    let mut cfg = load_config(env);
    cfg.paused = paused;
    save_config(env, &cfg);
}

// ---------------------------------------------------------------------------
// Employer transfer helpers (#69)
// ---------------------------------------------------------------------------

pub fn set_pending_employer(env: &Env, stream_id: u64, pending: &Address) {
    env.storage().instance().set(&DataKey::PendingEmployer(stream_id), pending);
}

pub fn get_pending_employer(env: &Env, stream_id: u64) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingEmployer(stream_id))
}

pub fn clear_pending_employer(env: &Env, stream_id: u64) {
    env.storage().instance().remove(&DataKey::PendingEmployer(stream_id));
}

// ---------------------------------------------------------------------------
// Stream index helpers
// ---------------------------------------------------------------------------

pub fn index_employer_stream(env: &Env, employer: &Address, stream_id: u64) {
    let key = DataKey::EmployerStreams(employer.clone());
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
    ids.push_back(stream_id);
    env.storage().persistent().set(&key, &ids);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn get_employer_streams(env: &Env, employer: &Address) -> Vec<u64> {
    let key = DataKey::EmployerStreams(employer.clone());
    env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env))
}

pub fn index_employee_stream(env: &Env, employee: &Address, stream_id: u64) {
    let key = DataKey::EmployeeStreams(employee.clone());
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
    ids.push_back(stream_id);
    env.storage().persistent().set(&key, &ids);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn get_employee_streams(env: &Env, employee: &Address) -> Vec<u64> {
    let key = DataKey::EmployeeStreams(employee.clone());
    env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env))
}

// ---------------------------------------------------------------------------
// Claimable calculation (#272: early-exit on zero elapsed)
// ---------------------------------------------------------------------------

/// Tokens earned by employee up to `now` that have not yet been withdrawn.
///
/// Returns 0 before `cliff_time` (if set). All arithmetic uses checked or
/// saturating operations to prevent overflow.
///
/// Optimization (#272): returns 0 immediately when elapsed == 0 (common
/// immediately after a withdraw), avoiding a 128-bit multiply.
pub fn claimable_amount(stream: &Stream, now: u64) -> i128 {
    match stream.status {
        StreamStatus::Cancelled | StreamStatus::Exhausted => return 0,
        _ => {}
    }
    // Cliff: nothing claimable before cliff_time (#123).
    if stream.cliff_time > 0 && now < stream.cliff_time {
        return 0;
    }
    let effective_end = if stream.stop_time > 0 && now > stream.stop_time {
        stream.stop_time
    } else {
        now
    };
    let elapsed = effective_end.saturating_sub(stream.last_withdraw_time);
    // Early-exit: no time has passed — avoids 128-bit multiply (#272).
    if elapsed == 0 {
        return 0;
    }
    let earned = (elapsed as i128)
        .checked_mul(stream.rate_per_second)
        .expect(ERR_OVERFLOW);
    let remaining = stream
        .deposit
        .checked_sub(stream.withdrawn)
        .unwrap_or(0)
        .max(0);
    earned.min(remaining).max(0)
}

// ---------------------------------------------------------------------------
// Governance helpers (#124)
// ---------------------------------------------------------------------------

pub fn next_proposal_id(env: &Env) -> u64 {
    let count: u64 = env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0);
    let next = count.checked_add(1).expect("proposal count overflow");
    env.storage().instance().set(&DataKey::ProposalCount, &next);
    next
}

pub fn save_proposal(env: &Env, proposal: &Proposal) {
    env.storage().persistent().set(&DataKey::Proposal(proposal.id), proposal);
}

pub fn load_proposal(env: &Env, id: u64) -> Option<Proposal> {
    env.storage().persistent().get(&DataKey::Proposal(id))
}

pub fn has_voted(env: &Env, proposal_id: u64, voter: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Voted(proposal_id, voter.clone()))
        .unwrap_or(false)
}

pub fn mark_voted(env: &Env, proposal_id: u64, voter: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Voted(proposal_id, voter.clone()), &true);
}

pub fn apply_proposal(env: &Env, proposal: &Proposal) {
    use crate::types::GovParam;
    match proposal.param {
        GovParam::MinDeposit => set_min_deposit(env, proposal.new_value as i128),
        GovParam::MaxDuration => set_max_streams_per_employer(env, proposal.new_value as u32),
        GovParam::FeeBps => set_fee_bps(env, proposal.new_value as u32),
    }
}

pub fn tally_proposal(env: &Env, mut proposal: Proposal) -> Proposal {
    if proposal.votes_for > proposal.votes_against {
        proposal.status = ProposalStatus::Passed;
    } else {
        proposal.status = ProposalStatus::Rejected;
    }
    save_proposal(env, &proposal);
    proposal
}

// ---------------------------------------------------------------------------
// Pause history helpers
// ---------------------------------------------------------------------------

pub fn add_pause_event(env: &Env, stream_id: u64, timestamp: u64, is_pause: bool) {
    let key = DataKey::PauseHistory(stream_id);
    let mut history: Vec<PauseEvent> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
    history.push_back(PauseEvent {
        stream_id,
        timestamp,
        is_pause,
    });
    env.storage().persistent().set(&key, &history);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn get_pause_history(env: &Env, stream_id: u64) -> Vec<PauseEvent> {
    let key = DataKey::PauseHistory(stream_id);
    env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env))
}

// ---------------------------------------------------------------------------
// Token allowlist helpers (#292)
// ---------------------------------------------------------------------------

/// Returns true if the allowlist is empty (not yet configured — all tokens pass).
/// Once any token is added, only listed tokens are accepted.
pub fn is_token_allowed(env: &Env, token: &Address) -> bool {
    let list: Vec<Address> = env.storage().instance().get(&DataKey::AllowedTokens).unwrap_or_else(|| Vec::new(env));
    if list.is_empty() {
        return true; // allowlist not configured — open
    }
    list.contains(token)
}

pub fn add_allowed_token(env: &Env, token: &Address) {
    let mut list: Vec<Address> = env.storage().instance().get(&DataKey::AllowedTokens).unwrap_or_else(|| Vec::new(env));
    if !list.contains(token) {
        list.push_back(token.clone());
        env.storage().instance().set(&DataKey::AllowedTokens, &list);
    }
}

pub fn remove_allowed_token(env: &Env, token: &Address) {
    let list: Vec<Address> = env.storage().instance().get(&DataKey::AllowedTokens).unwrap_or_else(|| Vec::new(env));
    let mut new_list: Vec<Address> = Vec::new(env);
    for t in list.iter() {
        if &t != token {
            new_list.push_back(t);
        }
    }
    env.storage().instance().set(&DataKey::AllowedTokens, &new_list);
}

pub fn get_allowed_tokens(env: &Env) -> Vec<Address> {
    env.storage().instance().get(&DataKey::AllowedTokens).unwrap_or_else(|| Vec::new(env))
}
