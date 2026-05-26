#![no_std]

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, Vec};
use storage::{
    claimable_amount, decrement_employer_stream_count, get_admin, get_employer_stream_count,
    get_employer_streams, get_stream_limit, get_upgrade_pending, increment_employer_stream_count,
    index_employer_stream, is_globally_paused, load_stream, next_id, save_stream,
    set_admin, set_globally_paused, set_stream_limit, set_upgrade_pending, clear_upgrade_pending,
    UPGRADE_TIMELOCK_SECS,
};
use types::{
    DataKey, Stream, StreamStatus, ERR_GLOBAL_PAUSED, ERR_NO_UPGRADE,
    ERR_REENTRANT, ERR_STREAM_LIMIT, ERR_UPGRADE_LOCKED, ERR_UPGRADE_PENDING, ERR_ZERO_DEPOSIT,
    ERR_ZERO_RATE,
};

/// Parameters for a single stream in a batch create call.
#[contracttype]
#[derive(Clone)]
pub struct StreamParams {
    pub employee: Address,
    pub token: Address,
    pub deposit: i128,
    pub rate_per_second: i128,
    pub stop_time: u64,
}

#[contract]
pub struct StreamContract;

#[contractimpl]
impl StreamContract {
    /// Initialise with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        set_admin(&env, &admin);
    }

    // -----------------------------------------------------------------------
    // #271 – Emergency global pause
    // -----------------------------------------------------------------------

    /// Admin pauses all streams globally. Blocks create_stream and withdraw.
    pub fn pause_all(env: Env) {
        let admin = get_admin(&env);
        admin.require_auth();
        set_globally_paused(&env, true);
        events::global_paused(&env, true);
    }

    /// Admin resumes normal operation after a global pause.
    pub fn resume_all(env: Env) {
        let admin = get_admin(&env);
        admin.require_auth();
        set_globally_paused(&env, false);
        events::global_paused(&env, false);
    }

    /// Returns true if the contract is globally paused.
    pub fn is_paused(env: Env) -> bool {
        is_globally_paused(&env)
    }

    // -----------------------------------------------------------------------
    // #283 – Employer stream limit
    // -----------------------------------------------------------------------

    /// Admin sets the maximum number of active streams per employer.
    pub fn set_stream_limit(env: Env, limit: u32) {
        let admin = get_admin(&env);
        admin.require_auth();
        set_stream_limit(&env, limit);
    }

    /// Returns the current per-employer active stream limit.
    pub fn stream_limit(env: Env) -> u32 {
        get_stream_limit(&env)
    }

    // -----------------------------------------------------------------------
    // #270 – Contract upgrade with 48h timelock
    // -----------------------------------------------------------------------

    /// Admin schedules a contract upgrade. Takes effect after 48h via `execute_upgrade`.
    pub fn schedule_upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = get_admin(&env);
        admin.require_auth();
        assert!(get_upgrade_pending(&env).is_none(), "{}", ERR_UPGRADE_PENDING);
        let scheduled_at = env.ledger().timestamp();
        set_upgrade_pending(&env, &new_wasm_hash, scheduled_at);
        events::upgrade_scheduled(&env, &new_wasm_hash, scheduled_at);
    }

    /// Admin executes a previously scheduled upgrade after the 48h timelock.
    pub fn execute_upgrade(env: Env) {
        let admin = get_admin(&env);
        admin.require_auth();
        let (new_wasm_hash, scheduled_at) =
            get_upgrade_pending(&env).expect(ERR_NO_UPGRADE);
        let now = env.ledger().timestamp();
        assert!(
            now >= scheduled_at.saturating_add(UPGRADE_TIMELOCK_SECS),
            "{}",
            ERR_UPGRADE_LOCKED
        );
        clear_upgrade_pending(&env);
        events::upgrade_executed(&env, &new_wasm_hash);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Admin cancels a pending upgrade.
    pub fn cancel_upgrade(env: Env) {
        let admin = get_admin(&env);
        admin.require_auth();
        assert!(get_upgrade_pending(&env).is_some(), "{}", ERR_NO_UPGRADE);
        clear_upgrade_pending(&env);
    }

    /// Returns the pending upgrade (wasm_hash, scheduled_at) or None.
    pub fn pending_upgrade(env: Env) -> Option<(BytesN<32>, u64)> {
        get_upgrade_pending(&env)
    }

    // -----------------------------------------------------------------------
    // Admin helpers
    // -----------------------------------------------------------------------

    pub fn set_min_deposit(env: Env, admin: Address, amount: i128) {
        admin.require_auth();
        assert_eq!(admin, get_admin(&env), "not admin");
        storage::set_min_deposit(&env, amount);
    }

    // -----------------------------------------------------------------------
    // Stream operations
    // -----------------------------------------------------------------------

    /// Employer creates a salary stream and deposits funds into the contract.
    pub fn create_stream(
        env: Env,
        employer: Address,
        employee: Address,
        token_address: Address,
        deposit: i128,
        rate_per_second: i128,
        stop_time: u64,
    ) -> u64 {
        assert!(!is_globally_paused(&env), "{}", ERR_GLOBAL_PAUSED);
        employer.require_auth();
        assert!(deposit > 0, "{}", ERR_ZERO_DEPOSIT);
        assert!(rate_per_second > 0, "{}", ERR_ZERO_RATE);

        // #283: enforce per-employer stream limit
        let count = get_employer_stream_count(&env, &employer);
        assert!(count < get_stream_limit(&env), "{}", ERR_STREAM_LIMIT);

        let now = env.ledger().timestamp();
        if stop_time > 0 {
            assert!(stop_time > now, "stop_time must be in the future");
        }

        let token_client = token::Client::new(&env, &token_address);
        token_client.balance(&employer);
        token_client.transfer(&employer, &env.current_contract_address(), &deposit);

        let id = next_id(&env);
        let stream = Stream {
            id,
            employer: employer.clone(),
            employee: employee.clone(),
            token: token_address,
            deposit,
            withdrawn: 0,
            rate_per_second,
            start_time: now,
            stop_time,
            last_withdraw_time: now,
            status: StreamStatus::Active,
            paused_at: 0,
            locked: false,
        };
        save_stream(&env, &stream);
        index_employer_stream(&env, &employer, id);
        increment_employer_stream_count(&env, &employer);
        events::stream_created(&env, id, &employer, &employee, rate_per_second);
        id
    }

    /// Employer creates multiple salary streams atomically.
    pub fn create_streams_batch(
        env: Env,
        employer: Address,
        params: Vec<StreamParams>,
    ) -> Vec<u64> {
        assert!(!is_globally_paused(&env), "{}", ERR_GLOBAL_PAUSED);
        employer.require_auth();
        assert!(!params.is_empty(), "params must not be empty");

        let now = env.ledger().timestamp();
        let mut ids: Vec<u64> = Vec::new(&env);
        let limit = get_stream_limit(&env);
        let mut count = get_employer_stream_count(&env, &employer);

        for p in params.iter() {
            assert!(p.deposit > 0, "deposit must be positive");
            assert!(p.rate_per_second > 0, "rate must be positive");
            assert!(count < limit, "{}", ERR_STREAM_LIMIT);
            if p.stop_time > 0 {
                assert!(p.stop_time > now, "stop_time must be in the future");
            }

            let token_client = token::Client::new(&env, &p.token);
            token_client.balance(&employer);
            token_client.transfer(&employer, &env.current_contract_address(), &p.deposit);

            let id = next_id(&env);
            let stream = Stream {
                id,
                employer: employer.clone(),
                employee: p.employee.clone(),
                token: p.token.clone(),
                deposit: p.deposit,
                withdrawn: 0,
                rate_per_second: p.rate_per_second,
                start_time: now,
                stop_time: p.stop_time,
                last_withdraw_time: now,
                status: StreamStatus::Active,
                paused_at: 0,
                locked: false,
            };
            save_stream(&env, &stream);
            index_employer_stream(&env, &employer, id);
            count += 1;
            events::stream_created(&env, id, &employer, &p.employee, p.rate_per_second);
            ids.push_back(id);
        }
        // Persist the updated count once after the loop
        env.storage()
            .instance()
            .set(&DataKey::EmployerStreamCount(employer.clone()), &count);
        ids
    }

    /// Employee withdraws all claimable tokens earned so far.
    pub fn withdraw(env: Env, employee: Address, stream_id: u64) -> i128 {
        assert!(!is_globally_paused(&env), "{}", ERR_GLOBAL_PAUSED);
        employee.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert_eq!(stream.employee, employee, "not the employee");
        assert_eq!(stream.status, StreamStatus::Active, "stream not active");

        assert!(!stream.locked, "{}", ERR_REENTRANT);
        stream.locked = true;
        save_stream(&env, &stream);

        let now = env.ledger().timestamp();
        let amount = claimable_amount(&stream, now);
        assert!(amount > 0, "nothing to withdraw");

        stream.withdrawn = stream.withdrawn.checked_add(amount).expect("withdrawn overflow");
        stream.last_withdraw_time = now;
        if stream.withdrawn >= stream.deposit {
            stream.status = StreamStatus::Exhausted;
        }

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &employee, &amount);

        stream.locked = false;
        save_stream(&env, &stream);
        events::withdrawn(&env, stream_id, &employee, amount);
        amount
    }

    /// Employer tops up an active stream with additional funds.
    pub fn top_up(env: Env, employer: Address, stream_id: u64, amount: i128) {
        employer.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert_eq!(stream.employer, employer, "not the employer");
        assert_eq!(stream.status, StreamStatus::Active, "stream not active");
        assert!(amount > 0, "amount must be positive");

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&employer, &env.current_contract_address(), &amount);

        stream.deposit = stream.deposit.checked_add(amount).expect("deposit overflow");
        if stream.status == StreamStatus::Exhausted {
            stream.status = StreamStatus::Active;
        }
        save_stream(&env, &stream);
        events::topped_up(&env, stream_id, &employer, amount);
    }

    /// Employer pauses an active stream.
    pub fn pause_stream(env: Env, employer: Address, stream_id: u64) {
        employer.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert_eq!(stream.employer, employer, "not the employer");
        assert_eq!(stream.status, StreamStatus::Active, "stream not active");
        stream.paused_at = env.ledger().timestamp();
        stream.status = StreamStatus::Paused;
        save_stream(&env, &stream);
        events::stream_status_changed(&env, stream_id, &StreamStatus::Paused);
    }

    /// Employer resumes a paused stream.
    pub fn resume_stream(env: Env, employer: Address, stream_id: u64) {
        employer.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert_eq!(stream.employer, employer, "not the employer");
        assert_eq!(stream.status, StreamStatus::Paused, "stream not paused");
        // Advance last_withdraw_time by the paused duration so paused time is excluded
        let paused_duration = env.ledger().timestamp().saturating_sub(stream.paused_at);
        stream.last_withdraw_time = stream.last_withdraw_time.saturating_add(paused_duration);
        stream.paused_at = 0;
        stream.status = StreamStatus::Active;
        save_stream(&env, &stream);
        events::stream_status_changed(&env, stream_id, &StreamStatus::Active);
    }

    /// Employer cancels a stream and reclaims unstreamed funds.
    pub fn cancel_stream(env: Env, employer: Address, stream_id: u64) {
        employer.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert_eq!(stream.employer, employer, "not the employer");
        assert!(
            stream.status == StreamStatus::Active || stream.status == StreamStatus::Paused,
            "stream already ended"
        );

        let now = env.ledger().timestamp();
        let claimable = claimable_amount(&stream, now);
        let token_client = token::Client::new(&env, &stream.token);

        if claimable > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.employee, &claimable);
            stream.withdrawn = stream.withdrawn.checked_add(claimable).expect("withdrawn overflow");
        }

        let refund = stream.deposit.checked_sub(stream.withdrawn).unwrap_or(0).max(0);
        if refund > 0 {
            token_client.transfer(&env.current_contract_address(), &employer, &refund);
        }

        stream.status = StreamStatus::Cancelled;
        save_stream(&env, &stream);
        decrement_employer_stream_count(&env, &employer);
        events::stream_status_changed(&env, stream_id, &StreamStatus::Cancelled);
    }

    /// Read a stream by ID.
    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        load_stream(&env, stream_id).expect("stream not found")
    }

    /// How many tokens the employee can withdraw right now.
    pub fn claimable(env: Env, stream_id: u64) -> i128 {
        let stream = load_stream(&env, stream_id).expect("stream not found");
        claimable_amount(&stream, env.ledger().timestamp())
    }

    /// Total streams created.
    pub fn stream_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0)
    }

    /// Return all stream IDs owned by `employer`.
    pub fn streams_by_employer(env: Env, employer: Address) -> Vec<u64> {
        get_employer_streams(&env, &employer)
    }
}
