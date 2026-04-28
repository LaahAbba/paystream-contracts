// SPDX-License-Identifier: Apache-2.0

use soroban_sdk::{Env, Address, Vec};
use crate::types::{DataKey, PauseEvent, Proposal, ProposalStatus, Stream, StreamStatus, ERR_OVERFLOW, ERR_BAD_NONCE};

pub const DEFAULT_MIN_DEPOSIT: i128 = 10_000;

const TTL_THRESHOLD: u32 = 6_307_200;
const TTL_EXTEND_TO: u32 = 12_614_400;

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

pub fn get_min_deposit(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::MinDeposit).unwrap_or(DEFAULT_MIN_DEPOSIT)
}

pub fn set_min_deposit(env: &Env, amount: i128) {
    env.storage().instance().set(&DataKey::MinDeposit, &amount);
}

/// Tokens earned by employee up to `now` that have not yet been withdrawn.
///
/// Returns 0 before `cliff_time` (if set). All arithmetic uses checked or
/// saturating operations to prevent overflow.
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
    let elapsed = effective_end.saturating_sub(stream.last_withdraw_time) as i128;
    let earned = elapsed
        .checked_mul(stream.rate_per_second)
        .expect(ERR_OVERFLOW);
    let remaining = stream
        .deposit
        .checked_sub(stream.withdrawn)
        .unwrap_or(0)
        .max(0);
    earned.min(remaining).max(0)
}

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

pub fn get_admin_nonce(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::AdminNonce).unwrap_or(0u64)
}

pub fn consume_admin_nonce(env: &Env, nonce: u64) {
    let expected = get_admin_nonce(env);
    assert!(nonce == expected, "{}", ERR_BAD_NONCE);
    env.storage().instance().set(&DataKey::AdminNonce, &(expected + 1));
}

pub fn get_fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0u32)
}

pub fn set_fee_bps(env: &Env, bps: u32) {
    env.storage().instance().set(&DataKey::FeeBps, &bps);
}

pub fn get_fee_recipient(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::FeeRecipient)
}

pub fn set_fee_recipient(env: &Env, recipient: &Address) {
    env.storage().instance().set(&DataKey::FeeRecipient, recipient);
}

// Employer transfer helpers (#69)
pub fn set_pending_employer(env: &Env, stream_id: u64, pending: &Address) {
    env.storage().instance().set(&DataKey::PendingEmployer(stream_id), pending);
}

pub fn get_pending_employer(env: &Env, stream_id: u64) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingEmployer(stream_id))
}

pub fn clear_pending_employer(env: &Env, stream_id: u64) {
    env.storage().instance().remove(&DataKey::PendingEmployer(stream_id));
}

pub fn get_max_streams_per_employer(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::MaxStreamsPerEmployer).unwrap_or(100)
}

pub fn set_max_streams_per_employer(env: &Env, limit: u32) {
    env.storage().instance().set(&DataKey::MaxStreamsPerEmployer, &limit);
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
        GovParam::MaxDuration => {
            env.storage().instance().set(&DataKey::MaxStreamsPerEmployer, &(proposal.new_value as u32));
        }
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
