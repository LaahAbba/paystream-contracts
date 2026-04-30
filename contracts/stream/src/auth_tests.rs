// SPDX-License-Identifier: Apache-2.0

//! Authorization tests for the stream contract.
//!
//! This module contains negative tests for every authorization check in the contract.
//! Each test verifies that unauthorized callers are properly rejected.
//! Tests use distinct addresses to avoid false passes.
//!
//! ## Coverage Summary (38 tests)
//!
//! ### Admin Authorization (9 tests)
//! - propose_admin, accept_admin
//! - pause_contract, unpause_contract
//! - set_min_deposit, set_protocol_fee, set_max_streams_per_employer
//! - upgrade, migrate
//!
//! ### Employer Authorization (17 tests)
//! - top_up (2 tests: unauthorized + employee cannot)
//! - pause_stream (2 tests: unauthorized + employee cannot)
//! - resume_stream (2 tests: unauthorized + employee cannot)
//! - cancel_stream (2 tests: unauthorized + employee cannot)
//! - propose_employer_transfer (2 tests: unauthorized + employee cannot)
//! - accept_employer_transfer (3 tests: unauthorized + old employer + employee)
//! - update_rate (2 tests: unauthorized + employee cannot)
//! - create_streams_batch (1 test: unauthorized)
//! - withdraw (2 tests: non-employee + employer cannot)
//!
//! ### Post-Transfer Authorization (5 tests)
//! - Old employer cannot: pause, cancel, top_up, update_rate, propose_transfer
//!
//! ### Cross-Stream Authorization (2 tests)
//! - Employer cannot control other stream
//! - Employee cannot withdraw from other stream
//!
//! ### Admin Nonce Authorization (4 tests)
//! - Wrong nonce: set_min_deposit, pause_contract, upgrade
//! - Replayed nonce: set_protocol_fee
//!
//! ### Note on mock_all_auths()
//! These tests use `mock_all_auths()` which bypasses Soroban's auth framework.
//! The tests verify that the contract's internal authorization logic (assert_eq checks)
//! correctly rejects unauthorized callers. On-chain, the `require_auth()` calls
//! provide an additional layer of protection.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env,
};

use crate::{StreamContract, StreamContractClient};
use crate::types::StreamStatus;

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

// ===========================================================================
// Admin Authorization Tests
// ===========================================================================

/// Non-admin cannot call propose_admin.
#[test]
#[should_panic(expected = "not the admin")]
fn test_propose_admin_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to propose a new admin
    client.propose_admin(&attacker, &new_admin);
}

/// Non-pending-admin cannot accept admin transfer.
#[test]
#[should_panic(expected = "not the pending admin")]
fn test_accept_admin_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let pending_admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    client.propose_admin(&admin, &pending_admin);
    
    // Attacker (not the pending admin) tries to accept
    client.accept_admin(&attacker);
}

/// Non-admin cannot pause the contract.
#[test]
#[should_panic(expected = "not the admin")]
fn test_pause_contract_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to pause
    client.pause_contract(&attacker, &0);
}

/// Non-admin cannot unpause the contract.
#[test]
#[should_panic(expected = "not the admin")]
fn test_unpause_contract_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    client.pause_contract(&admin, &0);
    
    // Attacker tries to unpause
    client.unpause_contract(&attacker, &1);
}

/// Non-admin cannot set min_deposit.
#[test]
#[should_panic(expected = "not the admin")]
fn test_set_min_deposit_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to set min_deposit
    client.set_min_deposit(&attacker, &0, &1000);
}

/// Non-admin cannot set protocol fee.
#[test]
#[should_panic(expected = "not the admin")]
fn test_set_protocol_fee_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to set protocol fee
    client.set_protocol_fee(&attacker, &0, &50, &fee_recipient);
}

/// Non-admin cannot set max_streams_per_employer.
#[test]
#[should_panic(expected = "not the admin")]
fn test_set_max_streams_per_employer_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to set max streams limit
    client.set_max_streams_per_employer(&attacker, &0, &100);
}

/// Non-admin cannot upgrade the contract.
#[test]
#[should_panic(expected = "not the admin")]
fn test_upgrade_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Create a dummy wasm hash
    let fake_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    
    // Attacker tries to upgrade (will fail because attacker is not admin)
    client.upgrade(&attacker, &fake_hash, &0);
}

/// Non-admin cannot call migrate.
#[test]
#[should_panic(expected = "not the admin")]
fn test_migrate_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Attacker tries to migrate
    client.migrate(&attacker);
}

// ===========================================================================
// Employer Authorization Tests
// ===========================================================================

/// Non-employer cannot withdraw from a stream (only employee can).
#[test]
#[should_panic(expected = "not the employee")]
fn test_withdraw_unauthorized_not_employee() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    env.ledger().with_mut(|l| l.timestamp += 100);
    
    // Attacker tries to withdraw
    client.withdraw(&attacker, &id);
}

/// Employer cannot withdraw from their own stream (only employee can).
#[test]
#[should_panic(expected = "not the employee")]
fn test_withdraw_unauthorized_employer_cannot_withdraw() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    env.ledger().with_mut(|l| l.timestamp += 100);
    
    // Employer tries to withdraw (only employee can)
    client.withdraw(&employer, &id);
}

/// Non-employer cannot top up a stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_top_up_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Attacker tries to top up
    client.top_up(&attacker, &id, &1000);
}

/// Employee cannot top up a stream (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_top_up_unauthorized_employee_cannot_top_up() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employee tries to top up (only employer can)
    client.top_up(&employee, &id, &1000);
}

/// Non-employer cannot pause a stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_pause_stream_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Attacker tries to pause
    client.pause_stream(&attacker, &id);
}

/// Employee cannot pause a stream (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_pause_stream_unauthorized_employee_cannot_pause() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employee tries to pause (only employer can)
    client.pause_stream(&employee, &id);
}

/// Non-employer cannot resume a stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_resume_stream_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    client.pause_stream(&employer, &id);
    
    // Attacker tries to resume
    client.resume_stream(&attacker, &id);
}

/// Employee cannot resume a stream (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_resume_stream_unauthorized_employee_cannot_resume() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    client.pause_stream(&employer, &id);
    
    // Employee tries to resume (only employer can)
    client.resume_stream(&employee, &id);
}

/// Non-employer cannot cancel a stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_cancel_stream_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Attacker tries to cancel
    client.cancel_stream(&attacker, &id);
}

/// Employee cannot cancel a stream (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_cancel_stream_unauthorized_employee_cannot_cancel() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employee tries to cancel (only employer can)
    client.cancel_stream(&employee, &id);
}

/// Non-employer cannot propose employer transfer.
#[test]
#[should_panic(expected = "not the employer")]
fn test_propose_employer_transfer_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Attacker tries to propose transfer
    client.propose_employer_transfer(&attacker, &id, &new_employer);
}

/// Employee cannot propose employer transfer (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_propose_employer_transfer_unauthorized_employee_cannot_propose() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employee tries to propose transfer (only employer can)
    client.propose_employer_transfer(&employee, &id, &new_employer);
}

/// Non-pending-employer cannot accept employer transfer.
#[test]
#[should_panic(expected = "E013")]
fn test_accept_employer_transfer_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    client.propose_employer_transfer(&employer, &id, &new_employer);
    
    // Attacker (not the pending employer) tries to accept
    client.accept_employer_transfer(&attacker, &id);
}

/// Old employer cannot accept employer transfer (only new employer can).
#[test]
#[should_panic(expected = "E013")]
fn test_accept_employer_transfer_unauthorized_old_employer_cannot_accept() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    client.propose_employer_transfer(&employer, &id, &new_employer);
    
    // Old employer tries to accept (only new employer can)
    client.accept_employer_transfer(&employer, &id);
}

/// Employee cannot accept employer transfer (only new employer can).
#[test]
#[should_panic(expected = "E013")]
fn test_accept_employer_transfer_unauthorized_employee_cannot_accept() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    client.propose_employer_transfer(&employer, &id, &new_employer);
    
    // Employee tries to accept (only new employer can)
    client.accept_employer_transfer(&employee, &id);
}

/// Non-employer cannot update rate.
#[test]
#[should_panic(expected = "not the employer")]
fn test_update_rate_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Attacker tries to update rate
    client.update_rate(&attacker, &id, &20);
}

/// Employee cannot update rate (only employer can).
#[test]
#[should_panic(expected = "not the employer")]
fn test_update_rate_unauthorized_employee_cannot_update() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employee tries to update rate (only employer can)
    client.update_rate(&employee, &id, &20);
}

// ===========================================================================
// Batch Operations Authorization Tests
// ===========================================================================

/// Non-employer cannot create batch streams.
#[test]
#[should_panic]
fn test_create_streams_batch_unauthorized() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_id = setup_token(&env, &employer);
    
    client.initialize(&admin);
    
    let params = soroban_sdk::vec![
        &env,
        crate::types::StreamParams {
            employee: employee.clone(),
            token: token_id.clone(),
            deposit: 10_000,
            rate_per_second: 10,
            stop_time: 0,
            cliff_time: 0,
        }
    ];
    
    // Attacker tries to create batch streams as employer
    client.create_streams_batch(&attacker, &params);
}

// ===========================================================================
// Post-Transfer Authorization Tests
// ===========================================================================

/// After employer transfer, old employer cannot control the stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_old_employer_cannot_pause_after_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let old_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &old_employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&old_employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Transfer employer
    client.propose_employer_transfer(&old_employer, &id, &new_employer);
    client.accept_employer_transfer(&new_employer, &id);
    
    // Old employer tries to pause
    client.pause_stream(&old_employer, &id);
}

/// After employer transfer, old employer cannot cancel the stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_old_employer_cannot_cancel_after_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let old_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &old_employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&old_employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Transfer employer
    client.propose_employer_transfer(&old_employer, &id, &new_employer);
    client.accept_employer_transfer(&new_employer, &id);
    
    // Old employer tries to cancel
    client.cancel_stream(&old_employer, &id);
}

/// After employer transfer, old employer cannot top up the stream.
#[test]
#[should_panic(expected = "not the employer")]
fn test_old_employer_cannot_top_up_after_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let old_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &old_employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&old_employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Transfer employer
    client.propose_employer_transfer(&old_employer, &id, &new_employer);
    client.accept_employer_transfer(&new_employer, &id);
    
    // Old employer tries to top up
    client.top_up(&old_employer, &id, &1000);
}

/// After employer transfer, old employer cannot update rate.
#[test]
#[should_panic(expected = "not the employer")]
fn test_old_employer_cannot_update_rate_after_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let old_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let token_id = setup_token(&env, &old_employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&old_employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Transfer employer
    client.propose_employer_transfer(&old_employer, &id, &new_employer);
    client.accept_employer_transfer(&new_employer, &id);
    
    // Old employer tries to update rate
    client.update_rate(&old_employer, &id, &20);
}

/// After employer transfer, old employer cannot propose another transfer.
#[test]
#[should_panic(expected = "not the employer")]
fn test_old_employer_cannot_propose_transfer_after_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let old_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let another_employer = Address::generate(&env);
    let token_id = setup_token(&env, &old_employer);
    
    client.initialize(&admin);
    let id = client.create_stream(&old_employer, &employee, &token_id, &10_000, &10, &0, &0, &0);
    
    // Transfer employer
    client.propose_employer_transfer(&old_employer, &id, &new_employer);
    client.accept_employer_transfer(&new_employer, &id);
    
    // Old employer tries to propose another transfer
    client.propose_employer_transfer(&old_employer, &id, &another_employer);
}

// ===========================================================================
// Cross-Stream Authorization Tests
// ===========================================================================

/// Employer of stream A cannot control stream B.
#[test]
#[should_panic(expected = "not the employer")]
fn test_employer_cannot_control_other_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer_a = Address::generate(&env);
    let employer_b = Address::generate(&env);
    let employee_a = Address::generate(&env);
    let employee_b = Address::generate(&env);
    let token_id = setup_token(&env, &employer_a);
    // Give employer_b tokens too
    let token = paystream_token::TokenContractClient::new(&env, &token_id);
    token.transfer(&employer_a, &employer_b, &20_000);
    
    client.initialize(&admin);
    let stream_a = client.create_stream(&employer_a, &employee_a, &token_id, &10_000, &10, &0, &0, &0);
    let stream_b = client.create_stream(&employer_b, &employee_b, &token_id, &10_000, &10, &0, &0, &0);
    
    // Employer A tries to pause stream B
    client.pause_stream(&employer_a, &stream_b);
}

/// Employee of stream A cannot withdraw from stream B.
#[test]
#[should_panic(expected = "not the employee")]
fn test_employee_cannot_withdraw_from_other_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let employer_a = Address::generate(&env);
    let employer_b = Address::generate(&env);
    let employee_a = Address::generate(&env);
    let employee_b = Address::generate(&env);
    let token_id = setup_token(&env, &employer_a);
    // Give employer_b tokens too
    let token = paystream_token::TokenContractClient::new(&env, &token_id);
    token.transfer(&employer_a, &employer_b, &20_000);
    
    client.initialize(&admin);
    let stream_a = client.create_stream(&employer_a, &employee_a, &token_id, &10_000, &10, &0, &0, &0);
    let stream_b = client.create_stream(&employer_b, &employee_b, &token_id, &10_000, &10, &0, &0, &0);
    
    env.ledger().with_mut(|l| l.timestamp += 100);
    
    // Employee A tries to withdraw from stream B
    client.withdraw(&employee_a, &stream_b);
}

// ===========================================================================
// Admin Nonce Authorization Tests
// ===========================================================================

/// Admin with wrong nonce cannot set min_deposit.
#[test]
#[should_panic(expected = "E009")]
fn test_set_min_deposit_wrong_nonce() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Use wrong nonce (should be 0, using 1)
    client.set_min_deposit(&admin, &1, &1000);
}

/// Admin with replayed nonce cannot set protocol fee.
#[test]
#[should_panic(expected = "E009")]
fn test_set_protocol_fee_replayed_nonce() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Use nonce 0
    client.set_protocol_fee(&admin, &0, &50, &fee_recipient);
    
    // Try to replay nonce 0
    client.set_protocol_fee(&admin, &0, &100, &fee_recipient);
}

/// Admin with wrong nonce cannot pause contract.
#[test]
#[should_panic(expected = "E009")]
fn test_pause_contract_wrong_nonce() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    
    client.initialize(&admin);
    
    // Use wrong nonce (should be 0, using 5)
    client.pause_contract(&admin, &5);
}

/// Admin with wrong nonce cannot upgrade contract.
#[test]
#[should_panic(expected = "E009")]
fn test_upgrade_wrong_nonce() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    
    client.initialize(&admin);
    
    let fake_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
    
    // Use wrong nonce (should be 0, using 10)
    client.upgrade(&admin, &fake_hash, &10);
}
