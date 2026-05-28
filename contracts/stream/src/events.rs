// SPDX-License-Identifier: Apache-2.0

use soroban_sdk::{Env, Address, symbol_short};

pub fn stream_created(env: &Env, id: u64, employer: &Address, employee: &Address, rate: i128) {
    env.events().publish(
        (symbol_short!("created"), id),
        (employer.clone(), employee.clone(), rate),
    );
}

pub fn stream_transferred(env: &Env, id: u64, previous_employee: &Address, new_employee: &Address) {
    env.events().publish(
        (symbol_short!("transferred"), id),
        (previous_employee.clone(), new_employee.clone()),
    );
}

pub fn withdrawn(env: &Env, id: u64, employee: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("withdraw"), id),
        (employee.clone(), amount),
    );
}

pub fn stream_paused(env: &Env, id: u64) {
    env.events().publish(
        (symbol_short!("paused"), id),
        (),
    );
}

pub fn stream_resumed(env: &Env, id: u64) {
    env.events().publish(
        (symbol_short!("resumed"), id),
        (),
    );
}

pub fn stream_cancelled(env: &Env, id: u64) {
    env.events().publish(
        (symbol_short!("cancelled"), id),
        (),
    );
}

pub fn topped_up(env: &Env, id: u64, employer: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("topup"), id),
        (employer.clone(), amount),
    );
}

pub fn contract_paused(env: &Env, paused: bool) {
    env.events().publish(
        (symbol_short!("paused"),),
        paused,
    );
}
