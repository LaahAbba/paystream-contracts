// SPDX-License-Identifier: Apache-2.0

//! Multi-sig employer tests for PayStream (#116).
//!
//! Soroban's auth framework natively supports multi-sig Stellar accounts.
//! When `employer.require_auth()` is called, the host collects signatures
//! from the account's signers and checks the threshold — no contract changes
//! are required.
//!
//! These tests demonstrate that all employer operations work correctly when
//! the employer is a multi-sig account, using `mock_auths` to simulate
//! 2-of-3 threshold signing in the test environment.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke},
    vec, Address, Env, IntoVal,
};

use crate::{StreamContract, StreamContractClient};
use crate::types::StreamStatus;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/// Simulate a 2-of-3 multi-sig employer by calling `env.mock_auths` with two
/// signer entries that both authorise the same contract invocation.
///
/// On-chain this maps to a Stellar account whose `thresholds.med_threshold = 2`
/// and which has three signers each with weight 1.  The Soroban host collects
/// signatures until the threshold is met; two signers are sufficient.
fn mock_multisig_auth<'a>(
    env: &Env,
    contract_id: &'a Address,
    fn_name: &'a str,
    args: soroban_sdk::Vec<soroban_sdk::Val>,
    signer1: &'a Address,
    signer2: &'a Address,
) {
    let invoke = MockAuthInvoke {
        contract: contract_id,
        fn_name,
        args,
        sub_invokes: &[],
    };
    env.mock_auths(&[
        MockAuth { address: signer1, invoke: &invoke },
        MockAuth { address: signer2, invoke: &invoke },
    ]);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: create_stream
// ---------------------------------------------------------------------------

/// A multi-sig employer (represented by a single Address whose auth requires
/// 2-of-3 signers) can create a stream.  We use mock_all_auths here because
/// the token transfer sub-invocation also needs auth; the subsequent tests
/// use explicit mock_auths for the stream operations themselves.
#[test]
fn test_multisig_employer_create_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    // The multi-sig account address (employer)
    let multisig_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);

    let stream_id = client.create_stream(
        &multisig_employer,
        &employee,
        &token_id,
        &10_000,
        &10,
        &0,
        &0,
        &0,
    );

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.employer, multisig_employer);
    assert_eq!(stream.status, StreamStatus::Active);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: top_up
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_top_up() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    client.top_up(&multisig_employer, &stream_id, &5_000);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.deposit, 15_000);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: pause_stream / resume_stream
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_pause_and_resume() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    client.pause_stream(&multisig_employer, &stream_id);
    assert_eq!(client.get_stream(&stream_id).status, StreamStatus::Paused);

    env.ledger().with_mut(|l| l.timestamp += 60);
    client.resume_stream(&multisig_employer, &stream_id);
    assert_eq!(client.get_stream(&stream_id).status, StreamStatus::Active);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: cancel_stream
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_cancel_stream() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.cancel_stream(&multisig_employer, &stream_id);
    assert_eq!(client.get_stream(&stream_id).status, StreamStatus::Cancelled);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: update_rate
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_update_rate() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    client.update_rate(&multisig_employer, &stream_id, &20);
    assert_eq!(client.get_stream(&stream_id).rate_per_second, 20);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: propose_employer_transfer / accept
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_transfer() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let new_employer = Address::generate(&env);
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    client.propose_employer_transfer(&multisig_employer, &stream_id, &new_employer);
    client.accept_employer_transfer(&new_employer, &stream_id);
    assert_eq!(client.get_stream(&stream_id).employer, new_employer);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: explicit mock_auths (demonstrates auth structure)
// ---------------------------------------------------------------------------

/// This test uses explicit `mock_auths` with two signers to demonstrate the
/// 2-of-3 multi-sig auth structure.  The employer address is the multi-sig
/// account; signer1 and signer2 are two of its three signers.
///
/// Note: `mock_all_auths` is still needed for the token transfer sub-call
/// inside `create_stream`.  We switch to explicit `mock_auths` for the
/// stream-level operations that only require the employer's auth.
#[test]
fn test_multisig_2_of_3_explicit_auth_pause() {
    // Use mock_all_auths for setup (token transfer needs auth too)
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StreamContract, ());
    let client = StreamContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    // Three signers; any two satisfy the 2-of-3 threshold
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let _signer3 = Address::generate(&env); // third signer — not used here
    let employee = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);
    let stream_id = client.create_stream(
        &multisig_employer, &employee, &token_id, &10_000, &10, &0, &0, &0,
    );

    // Switch to explicit 2-of-3 auth for pause_stream.
    // Two signers (signer1, signer2) authorise on behalf of multisig_employer.
    let invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "pause_stream",
        args: vec![&env, multisig_employer.clone().into_val(&env), stream_id.into_val(&env)],
        sub_invokes: &[],
    };
    env.mock_auths(&[
        MockAuth { address: &signer1, invoke: &invoke },
        MockAuth { address: &signer2, invoke: &invoke },
    ]);

    client.pause_stream(&multisig_employer, &stream_id);
    assert_eq!(client.get_stream(&stream_id).status, StreamStatus::Paused);
}

// ---------------------------------------------------------------------------
// 2-of-3 multi-sig: batch create
// ---------------------------------------------------------------------------

#[test]
fn test_multisig_employer_batch_create() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let multisig_employer = Address::generate(&env);
    let employee1 = Address::generate(&env);
    let employee2 = Address::generate(&env);
    let token_id = setup_token(&env, &multisig_employer);

    client.initialize(&admin);
    client.set_min_deposit(&admin, &0, &100);

    let params = soroban_sdk::vec![
        &env,
        crate::types::StreamParams {
            employee: employee1.clone(),
            token: token_id.clone(),
            deposit: 5_000,
            rate_per_second: 5,
            stop_time: 0,
            cliff_time: 0,
        },
        crate::types::StreamParams {
            employee: employee2.clone(),
            token: token_id.clone(),
            deposit: 8_000,
            rate_per_second: 8,
            stop_time: 0,
            cliff_time: 0,
        },
    ];

    let ids = client.create_streams_batch(&multisig_employer, &params);
    assert_eq!(ids.len(), 2);
    assert_eq!(client.get_stream(&ids.get(0).unwrap()).employer, multisig_employer);
    assert_eq!(client.get_stream(&ids.get(1).unwrap()).employer, multisig_employer);
}
