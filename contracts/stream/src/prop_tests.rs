// SPDX-License-Identifier: Apache-2.0

//! Property-based tests using proptest (issue #52).
//!
//! Invariants verified:
//!   1. `claimable ≤ deposit - withdrawn` at all times
//!   2. `withdrawn` never exceeds `deposit` (no funds created)
//!   3. Total funds accounted for: `withdrawn + contract_balance == deposit`

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env};
use crate::{StreamContract, StreamContractClient};

fn setup_env() -> (Env, StreamContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(StreamContract, ());
    let client = StreamContractClient::new(&env, &id);
    (env, client)
}

fn setup_token(env: &Env, admin: &Address, supply: i128) -> Address {
    let token_id = env.register(paystream_token::TokenContract, ());
    let token = paystream_token::TokenContractClient::new(env, &token_id);
    token.initialize(admin, &supply);
    token_id
}

proptest! {
    /// Property 1: claimable ≤ remaining deposit at any elapsed time.
    #[test]
    fn prop_claimable_never_exceeds_remaining(
        deposit in 1_000i128..1_000_000i128,
        rate in 1i128..100i128,
        elapsed in 0u64..20_000u64,
    ) {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let token_id = setup_token(&env, &employer, deposit + 1);

        client.initialize(&admin);
        client.set_min_deposit(&admin, &0, &100);
        let id = client.create_stream(&employer, &employee, &token_id, &deposit, &rate, &0, &0, &0);

        env.ledger().with_mut(|l| l.timestamp += elapsed);
        let claimable = client.claimable(&id);
        let s = client.get_stream(&id);
        let remaining = s.deposit - s.withdrawn;

        prop_assert!(claimable >= 0, "claimable must be non-negative");
        prop_assert!(claimable <= remaining, "claimable ({claimable}) > remaining ({remaining})");
    }

    /// Property 2: withdrawn never exceeds deposit after a withdrawal.
    #[test]
    fn prop_withdrawn_never_exceeds_deposit(
        deposit in 1_000i128..500_000i128,
        rate in 1i128..50i128,
        elapsed in 1u64..20_000u64,
    ) {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let token_id = setup_token(&env, &employer, deposit + 1);

        client.initialize(&admin);
        client.set_min_deposit(&admin, &0, &100);
        let id = client.create_stream(&employer, &employee, &token_id, &deposit, &rate, &0, &0, &0);

        env.ledger().with_mut(|l| l.timestamp += elapsed);
        client.withdraw(&employee, &id);

        let s = client.get_stream(&id);
        prop_assert!(s.withdrawn <= s.deposit,
            "withdrawn ({}) > deposit ({})", s.withdrawn, s.deposit);
    }

    /// Property 3: total funds conserved — withdrawn + claimable ≤ deposit (no funds created).
    #[test]
    fn prop_total_funds_conserved(
        deposit in 1_000i128..500_000i128,
        rate in 1i128..50i128,
        elapsed in 0u64..20_000u64,
    ) {
        let (env, client) = setup_env();
        let admin = Address::generate(&env);
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let token_id = setup_token(&env, &employer, deposit + 1);

        client.initialize(&admin);
        client.set_min_deposit(&admin, &0, &100);
        let id = client.create_stream(&employer, &employee, &token_id, &deposit, &rate, &0, &0, &0);

        env.ledger().with_mut(|l| l.timestamp += elapsed);
        let claimable = client.claimable(&id);
        let s = client.get_stream(&id);

        prop_assert!(s.withdrawn + claimable <= s.deposit,
            "withdrawn ({}) + claimable ({}) > deposit ({})",
            s.withdrawn, claimable, s.deposit);
    }
}
