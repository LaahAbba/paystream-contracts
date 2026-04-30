// SPDX-License-Identifier: Apache-2.0

use crate::{TokenContract, TokenContractClient, MAX_SUPPLY};
use soroban_sdk::{Address, Env};

fn setup() -> (Env, TokenContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(TokenContract, ());
    let client = TokenContractClient::new(&env, &id);
    (env, client)
}

// ── initialize ────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_sets_supply_and_admin_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin, &1_000_000);
    assert_eq!(client.total_supply(), 1_000_000);
    assert_eq!(client.balance(&admin), 1_000_000);
}

#[test]
fn test_initialize_zero_supply() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin, &0);
    assert_eq!(client.total_supply(), 0);
    assert_eq!(client.balance(&admin), 0);
}

#[test]
#[should_panic(expected = "supply cap exceeded")]
fn test_initialize_beyond_cap_fails() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin, &(MAX_SUPPLY + 1));
}

// ── transfer ──────────────────────────────────────────────────────────────────

#[test]
fn test_transfer_moves_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &400);
    assert_eq!(client.balance(&admin), 600);
    assert_eq!(client.balance(&user), 400);
    // total supply unchanged
    assert_eq!(client.total_supply(), 1_000);
}

#[test]
fn test_transfer_full_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &500);
    client.transfer(&admin, &user, &500);
    assert_eq!(client.balance(&admin), 0);
    assert_eq!(client.balance(&user), 500);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_overdraft_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &100);
    client.transfer(&admin, &user, &101);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_transfer_zero_amount_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &100);
    client.transfer(&admin, &user, &0);
}

// ── approve / transfer_from ───────────────────────────────────────────────────

#[test]
fn test_approve_and_transfer_from() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &300);
    client.transfer_from(&spender, &user, &recipient, &200);
    assert_eq!(client.balance(&user), 300);
    assert_eq!(client.balance(&recipient), 200);
    // total supply unchanged
    assert_eq!(client.total_supply(), 1_000);
}

#[test]
fn test_approve_overwrites_previous_allowance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &300);
    // reduce allowance
    client.approve(&user, &spender, &100);
    client.transfer_from(&spender, &user, &recipient, &100);
    assert_eq!(client.balance(&user), 400);
}

#[test]
fn test_approve_revoke_sets_zero() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &300);
    client.approve(&user, &spender, &0);
    // any transfer_from should now fail
    let result = std::panic::catch_unwind(|| {
        client.transfer_from(&spender, &user, &recipient, &1);
    });
    assert!(result.is_err());
}

#[test]
#[should_panic(expected = "allowance exceeded")]
fn test_transfer_from_exceeds_allowance_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &100);
    client.transfer_from(&spender, &user, &recipient, &101);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_from_insufficient_balance_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.initialize(&admin, &50);
    client.transfer(&admin, &user, &50);
    // allowance is large but balance is only 50
    client.approve(&user, &spender, &1_000);
    client.transfer_from(&spender, &user, &recipient, &100);
}

// ── mint ──────────────────────────────────────────────────────────────────────

#[test]
fn test_mint_increases_supply_and_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.mint(&admin, &user, &500);
    assert_eq!(client.total_supply(), 1_500);
    assert_eq!(client.balance(&user), 500);
}

#[test]
fn test_mint_to_cap_succeeds() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &0);
    client.mint(&admin, &user, &MAX_SUPPLY);
    assert_eq!(client.total_supply(), MAX_SUPPLY);
    assert_eq!(client.balance(&user), MAX_SUPPLY);
}

#[test]
#[should_panic(expected = "supply cap exceeded")]
fn test_mint_beyond_cap_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &0);
    client.mint(&admin, &user, &MAX_SUPPLY);
    client.mint(&admin, &user, &1);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_mint_zero_amount_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &0);
    client.mint(&admin, &user, &0);
}

#[test]
#[should_panic(expected = "not admin")]
fn test_mint_non_admin_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1_000);
    // attacker passes their own address as admin — should fail "not admin"
    client.mint(&attacker, &user, &100);
}

// ── burn ──────────────────────────────────────────────────────────────────────

#[test]
fn test_burn_reduces_supply_and_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.burn(&user, &200);
    assert_eq!(client.balance(&user), 300);
    assert_eq!(client.total_supply(), 800);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_burn_insufficient_balance_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &100);
    client.transfer(&admin, &user, &50);
    client.burn(&user, &200);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_burn_zero_amount_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &100);
    client.transfer(&admin, &user, &50);
    client.burn(&user, &0);
}

// ── burn_from ─────────────────────────────────────────────────────────────────

#[test]
fn test_burn_from_reduces_supply_and_balance() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &300);
    client.burn_from(&spender, &user, &200);
    assert_eq!(client.balance(&user), 300);
    assert_eq!(client.total_supply(), 800);
}

#[test]
#[should_panic(expected = "allowance exceeded")]
fn test_burn_from_exceeds_allowance_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &100);
    client.burn_from(&spender, &user, &200);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_burn_from_zero_amount_panics() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let spender = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &user, &500);
    client.approve(&user, &spender, &300);
    client.burn_from(&spender, &user, &0);
}

// ── balance invariants ────────────────────────────────────────────────────────

#[test]
fn test_balance_invariant_transfer() {
    // sum of all balances == total_supply after transfers
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.initialize(&admin, &1_000);
    client.transfer(&admin, &a, &300);
    client.transfer(&admin, &b, &200);
    let total = client.balance(&admin) + client.balance(&a) + client.balance(&b);
    assert_eq!(total, client.total_supply());
}

#[test]
fn test_balance_invariant_mint_burn() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &500);
    client.mint(&admin, &user, &300);
    client.burn(&user, &100);
    let total = client.balance(&admin) + client.balance(&user);
    assert_eq!(total, client.total_supply());
    assert_eq!(client.total_supply(), 700);
}

#[test]
fn test_unknown_address_balance_is_zero() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.initialize(&admin, &1_000);
    assert_eq!(client.balance(&stranger), 0);
}
