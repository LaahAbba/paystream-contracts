// SPDX-License-Identifier: Apache-2.0

use soroban_sdk::{Env, Address, symbol_short};
use crate::types::StreamStatus;

pub fn stream_created(env: &Env, id: u64, employer: &Address, employee: &Address, rate: i128) {
    env.events().publish((symbol_short!("created"), id), (employer.clone(), employee.clone(), rate));
}

pub fn withdrawn(env: &Env, id: u64, employee: &Address, amount: i128) {
    env.events().publish((symbol_short!("withdraw"), id), (employee.clone(), amount));
}

pub fn stream_status_changed(env: &Env, id: u64, status: &StreamStatus) {
    env.events().publish((symbol_short!("status"), id), status.clone());
}

/// Emitted when a stream is paused by the employer.
/// Includes employee address for notification purposes.
pub fn stream_paused(env: &Env, id: u64, employer: &Address, employee: &Address, paused_at: u64) {
    env.events().publish((symbol_short!("paused"), id), (employer.clone(), employee.clone(), paused_at));
}

/// Emitted when a stream is resumed by the employer.
pub fn stream_resumed(env: &Env, id: u64, employer: &Address, employee: &Address, resumed_at: u64) {
    env.events().publish((symbol_short!("resumed"), id), (employer.clone(), employee.clone(), resumed_at));
}

pub fn topped_up(env: &Env, id: u64, employer: &Address, amount: i128) {
    env.events().publish((symbol_short!("topup"), id), (employer.clone(), amount));
}

pub fn contract_paused(env: &Env, paused: bool) {
    env.events().publish((symbol_short!("paused"),), paused);
}

pub fn employer_transfer_proposed(env: &Env, id: u64, old_employer: &Address, new_employer: &Address) {
    env.events().publish((symbol_short!("emp_prop"), id), (old_employer.clone(), new_employer.clone()));
}

pub fn employer_transfer_accepted(env: &Env, id: u64, old_employer: &Address, new_employer: &Address) {
    env.events().publish((symbol_short!("emp_acc"), id), (old_employer.clone(), new_employer.clone()));
}

/// Emitted when a stream is within a warning threshold of exhaustion (#121).
pub fn near_exhaustion(env: &Env, id: u64, employer: &Address, threshold_days: u32) {
    env.events().publish((symbol_short!("nearexhst"), id), (employer.clone(), threshold_days));
}

/// Emitted when an employer updates the stream rate (#122).
pub fn rate_changed(env: &Env, id: u64, old_rate: i128, new_rate: i128) {
    env.events().publish((symbol_short!("ratechng"), id), (old_rate, new_rate));
}

/// Emitted when a governance proposal is created (#124).
pub fn proposal_created(env: &Env, id: u64) {
    env.events().publish((symbol_short!("propcreat"), id), id);
}

/// Emitted when a governance proposal is executed (#124).
pub fn proposal_executed(env: &Env, id: u64) {
    env.events().publish((symbol_short!("propexec"), id), id);
}
