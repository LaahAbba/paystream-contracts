use soroban_sdk::{Env, Address, BytesN, symbol_short};
use crate::types::StreamStatus;

pub fn stream_created(env: &Env, id: u64, employer: &Address, employee: &Address, rate: i128) {
    env.events().publish(
        (symbol_short!("created"), id),
        (employer.clone(), employee.clone(), rate),
    );
}

pub fn withdrawn(env: &Env, id: u64, employee: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("withdraw"), id),
        (employee.clone(), amount),
    );
}

pub fn stream_status_changed(env: &Env, id: u64, status: &StreamStatus) {
    env.events().publish(
        (symbol_short!("status"), id),
        status.clone(),
    );
}

pub fn topped_up(env: &Env, id: u64, employer: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("topup"), id),
        (employer.clone(), amount),
    );
}

pub fn global_paused(env: &Env, paused: bool) {
    env.events().publish(
        (symbol_short!("glb_pause"),),
        paused,
    );
}

pub fn upgrade_scheduled(env: &Env, new_wasm_hash: &BytesN<32>, scheduled_at: u64) {
    env.events().publish(
        (symbol_short!("upg_sched"),),
        (new_wasm_hash.clone(), scheduled_at),
    );
}

pub fn upgrade_executed(env: &Env, new_wasm_hash: &BytesN<32>) {
    env.events().publish(
        (symbol_short!("upg_exec"),),
        new_wasm_hash.clone(),
    );
}
