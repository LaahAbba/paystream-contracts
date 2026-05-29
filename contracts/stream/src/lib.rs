// SPDX-License-Identifier: Apache-2.0

#![no_std]

mod access_control;
mod events;
mod storage;
mod types;
mod validate;

#[cfg(test)]
mod test;

#[cfg(test)]
mod auth_tests;

#[cfg(test)]
mod multisig_tests;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Vec};
use access_control::{
    require_admin, require_employee, require_employee_by_id, require_employer,
    require_employer_by_id, require_pending_admin, require_pending_employer,
    is_delegate, is_employer,
};
use storage::{
    add_pause_event, apply_proposal, claimable_amount, clear_pending_admin, clear_pending_employer,
    consume_admin_nonce, get_admin, get_admin_nonce, get_employee_streams, get_employer_streams,
    get_fee_bps, get_fee_recipient, get_max_streams_per_employer, get_min_deposit,
    get_pause_history, get_pending_admin, get_pending_employer, has_voted, index_employee_stream,
    index_employer_stream, load_proposal, load_stream, mark_voted, next_id, next_proposal_id,
    save_proposal, save_stream, set_admin, set_fee_bps, set_fee_recipient,
    set_max_streams_per_employer, set_min_deposit, set_pending_admin, set_pending_employer,
    tally_proposal,
    add_allowed_token as storage_add_allowed_token,
    remove_allowed_token as storage_remove_allowed_token,
    get_allowed_tokens as storage_get_allowed_tokens,
    is_token_allowed,
    get_paused_cfg, set_paused_cfg,
};
use types::{
    DataKey, GovParam, PauseEvent, Proposal, ProposalStatus, Stream, StreamParams, StreamStatus,
    ERR_ALREADY_PAUSED, ERR_FEE_TOO_HIGH, ERR_INVALID_TOKEN, ERR_NOT_PAUSED, ERR_OVERFLOW,
    ERR_REENTRANT, ERR_STREAM_CANCELLED, ERR_STREAM_EXHAUSTED, ERR_TOKEN_NOT_ALLOWED,
    ERR_UNAUTHORIZED_TRANSFER, ERR_WITHDRAW_COOLDOWN, ERR_ZERO_DEPOSIT, ERR_ZERO_RATE,
};
use validate::{validate_create_stream, validate_max_streams, validate_top_up, MAX_RATE_PER_SECOND};

/// Warning thresholds in seconds (#121).
const WARN_7_DAYS: u64 = 7 * 24 * 3600;
const WARN_1_DAY: u64 = 24 * 3600;

/// Governance timelock: 2 days in seconds (#124).
const GOV_TIMELOCK: u64 = 2 * 24 * 3600;

/// Emit near_exhaustion warning if remaining funds are below 7-day or 1-day threshold (#121).
fn maybe_warn_exhaustion(env: &Env, stream: &Stream) {
    if stream.status != StreamStatus::Active || stream.rate_per_second == 0 {
        return;
    }
    let remaining = stream.deposit.saturating_sub(stream.withdrawn).max(0);
    let seconds_left = (remaining / stream.rate_per_second) as u64;
    if seconds_left <= WARN_1_DAY {
        events::near_exhaustion(env, stream.id, &stream.employer, 1);
    } else if seconds_left <= WARN_7_DAYS {
        events::near_exhaustion(env, stream.id, &stream.employer, 7);
    }
}

#[contract]
pub struct StreamContract;

#[contractimpl]
impl StreamContract {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        set_admin(&env, &admin);
    }

    pub fn propose_admin(env: Env, current_admin: Address, new_admin: Address) {
        current_admin.require_auth();
        require_admin(&env, &current_admin);
        set_pending_admin(&env, &new_admin);
    }

    pub fn accept_admin(env: Env, new_admin: Address) {
        new_admin.require_auth();
        require_pending_admin(&env, &new_admin);
        set_admin(&env, &new_admin);
        clear_pending_admin(&env);
    }

    pub fn pause_contract(env: Env, admin: Address, nonce: u64) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        set_paused_cfg(&env, true);
        events::contract_paused(&env, true);
    }

    pub fn unpause_contract(env: Env, admin: Address, nonce: u64) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        set_paused_cfg(&env, false);
        events::contract_paused(&env, false);
    }

    pub fn set_min_deposit(env: Env, admin: Address, nonce: u64, amount: i128) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        assert!(amount > 0, "{}", ERR_ZERO_DEPOSIT);
        set_min_deposit(&env, amount);
    }

    pub fn set_protocol_fee(env: Env, admin: Address, nonce: u64, fee_bps: u32, fee_recipient: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        assert!(fee_bps <= 100, "{}", ERR_FEE_TOO_HIGH);
        set_fee_bps(&env, fee_bps);
        set_fee_recipient(&env, &fee_recipient);
    }

    pub fn set_max_streams_per_employer(env: Env, admin: Address, nonce: u64, limit: u32) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        set_max_streams_per_employer(&env, limit);
    }

    // ---------------------------------------------------------------------------
    // Token allowlist (#292)
    // ---------------------------------------------------------------------------

    /// Add a token to the admin-controlled allowlist.
    pub fn add_allowed_token(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        storage_add_allowed_token(&env, &token);
    }

    /// Remove a token from the allowlist.
    pub fn remove_allowed_token(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        storage_remove_allowed_token(&env, &token);
    }

    /// Return the current allowlist. Empty list means allowlist not yet configured (all tokens pass).
    pub fn get_allowed_tokens(env: Env) -> Vec<Address> {
        storage_get_allowed_tokens(&env)
    }

    /// Create a salary stream with an optional cliff period (#123).
    ///
    /// `cliff_time` — ledger timestamp before which nothing is claimable (0 = no cliff).
    ///
    /// # Token approval / transfer security (#65)
    ///
    /// This function calls `token::transfer(employer → contract, deposit)` — it transfers
    /// **exactly** the `deposit` amount and nothing more.  No `approve` call is made by
    /// the contract; the caller must have pre-approved at least `deposit` tokens to this
    /// contract address before invoking `create_stream`.  This design prevents
    /// over-approval: the contract can never pull more than the caller explicitly
    /// authorised for this single transaction.
    pub fn create_stream(
        env: Env,
        employer: Address,
        employee: Address,
        token_address: Address,
        deposit: i128,
        rate_per_second: i128,
        stop_time: u64,
        cooldown_period: u64,
        cliff_time: u64,
    ) -> u64 {
        employer.require_auth();
        assert!(!get_paused_cfg(&env), "contract is paused");

        let current_count = get_employer_streams(&env, &employer).len() as u32;
        let max_limit = get_max_streams_per_employer(&env);
        validate_max_streams(current_count, max_limit);

        let now = env.ledger().timestamp();
        let min_deposit = get_min_deposit(&env);
        validate_create_stream(deposit, min_deposit, rate_per_second, stop_time, cliff_time, now, &employer, &employee);

        let token_client = token::Client::new(&env, &token_address);
        let _ = token_client.try_balance(&employer).expect(ERR_INVALID_TOKEN);
        assert!(is_token_allowed(&env, &token_address), "{}", ERR_TOKEN_NOT_ALLOWED);
        
        let fee_bps = get_fee_bps(&env);
        let (fee_amount, net_deposit) = if fee_bps > 0 {
            if let Some(fee_recipient) = get_fee_recipient(&env) {
                let fee = deposit.checked_mul(fee_bps as i128).expect(ERR_OVERFLOW) / 10_000;
                let net = deposit - fee;
                token_client.transfer(&employer, &env.current_contract_address(), &net);
                token_client.transfer(&employer, &fee_recipient, &fee);
                (fee_bps, net)
            } else {
                token_client.transfer(&employer, &env.current_contract_address(), &deposit);
                (0, deposit)
            }
        } else {
            token_client.transfer(&employer, &env.current_contract_address(), &deposit);
            (0, deposit)
        };

        let id = next_id(&env);
        let stream = Stream {
            id,
            employer: employer.clone(),
            employee: employee.clone(),
            token: token_address,
            deposit: net_deposit,
            withdrawn: 0,
            rate_per_second,
            start_time: now,
            stop_time,
            last_withdraw_time: now,
            cooldown_period,
            status: StreamStatus::Active,
            locked: false,
            cliff_time,
            paused_at: 0,
            delegate: None,
        };
        save_stream(&env, &stream);
        index_employer_stream(&env, &employer, id);
        index_employee_stream(&env, &employee, id);
        events::stream_created(&env, id, &employer, &employee, rate_per_second, fee_amount);
        id
    }

    pub fn create_streams_batch(env: Env, employer: Address, params: Vec<StreamParams>) -> Vec<u64> {
        employer.require_auth();
        assert!(!get_paused_cfg(&env), "contract is paused");
        assert!(!params.is_empty(), "params must not be empty");

        let now = env.ledger().timestamp();
        let min_deposit = get_min_deposit(&env);
        let mut ids: Vec<u64> = Vec::new(&env);

        let current_count = get_employer_streams(&env, &employer).len() as u32;
        let max_limit = get_max_streams_per_employer(&env);
        assert!(current_count + (params.len() as u32) <= max_limit, "{}", types::ERR_MAX_STREAMS_REACHED);
        
        let fee_bps = get_fee_bps(&env);
        let fee_recipient = get_fee_recipient(&env);

        for p in params.iter() {
            validate_create_stream(p.deposit, min_deposit, p.rate_per_second, p.stop_time, p.cliff_time, now, &employer, &p.employee);

            let token_client = token::Client::new(&env, &p.token);
            let _ = token_client.try_balance(&employer).expect(ERR_INVALID_TOKEN);
            assert!(is_token_allowed(&env, &p.token), "{}", ERR_TOKEN_NOT_ALLOWED);
            
            let (stream_fee_bps, net_deposit) = if fee_bps > 0 {
                if let Some(ref recipient) = fee_recipient {
                    let fee = p.deposit.checked_mul(fee_bps as i128).expect(ERR_OVERFLOW) / 10_000;
                    let net = p.deposit - fee;
                    token_client.transfer(&employer, &env.current_contract_address(), &net);
                    token_client.transfer(&employer, recipient, &fee);
                    (fee_bps, net)
                } else {
                    token_client.transfer(&employer, &env.current_contract_address(), &p.deposit);
                    (0, p.deposit)
                }
            } else {
                token_client.transfer(&employer, &env.current_contract_address(), &p.deposit);
                (0, p.deposit)
            };

            let id = next_id(&env);
            let stream = Stream {
                id,
                employer: employer.clone(),
                employee: p.employee.clone(),
                token: p.token.clone(),
                deposit: net_deposit,
                withdrawn: 0,
                rate_per_second: p.rate_per_second,
                start_time: now,
                stop_time: p.stop_time,
                last_withdraw_time: now,
                cooldown_period: 0,
                status: StreamStatus::Active,
                locked: false,
                cliff_time: p.cliff_time,
                paused_at: 0,
                delegate: None,
            };
            save_stream(&env, &stream);
            index_employer_stream(&env, &employer, id);
            index_employee_stream(&env, &p.employee, id);
            events::stream_created(&env, id, &employer, &p.employee, p.rate_per_second, stream_fee_bps);
            ids.push_back(id);
        }
        ids
    }

    pub fn withdraw(env: Env, employee: Address, stream_id: u64) -> i128 {
        employee.require_auth();
        assert!(!get_paused_cfg(&env), "contract is paused");
        let mut stream = require_employee_by_id(&env, &employee, stream_id);
        assert!(
            stream.status == StreamStatus::Active || stream.status == StreamStatus::Exhausted,
            "stream not active"
        );

        let now = env.ledger().timestamp();
        if stream.status == StreamStatus::Active && stream.cooldown_period > 0 {
            let cooldown_expiration = stream.last_withdraw_time.saturating_add(stream.cooldown_period);
            assert!(now >= cooldown_expiration, "{}", ERR_WITHDRAW_COOLDOWN);
        }
        let amount = claimable_amount(&stream, now);
        if amount == 0 {
            return 0;
        }

        assert!(!stream.locked, "{}", ERR_REENTRANT);
        stream.locked = true;
        save_stream(&env, &stream);

        stream.withdrawn = stream.withdrawn.checked_add(amount).expect("withdrawn overflow");
        stream.last_withdraw_time = now;
        if stream.withdrawn >= stream.deposit {
            stream.status = StreamStatus::Exhausted;
        }

        let token_client = token::Client::new(&env, &stream.token);
        let employee_amount = amount;

        token_client.transfer(&env.current_contract_address(), &employee, &employee_amount);
        stream.locked = false;
        save_stream(&env, &stream);
        events::withdrawn(&env, stream_id, &employee, employee_amount);
        maybe_warn_exhaustion(&env, &stream);
        employee_amount
    }

    pub fn top_up(env: Env, caller: Address, stream_id: u64, amount: i128) {
        caller.require_auth();
        validate_top_up(amount);
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert!(is_employer(&caller, &stream) || is_delegate(&caller, &stream), "not authorized");
        assert!(stream.status != StreamStatus::Cancelled, "{}", ERR_STREAM_CANCELLED);
        assert!(stream.status != StreamStatus::Exhausted, "{}", ERR_STREAM_EXHAUSTED);

        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&caller, &env.current_contract_address(), &amount);
        stream.deposit = stream.deposit.checked_add(amount).expect("deposit overflow");
        save_stream(&env, &stream);
        events::topped_up(&env, stream_id, &stream.employer, amount);
    }

    pub fn pause_stream(env: Env, caller: Address, stream_id: u64) {
        caller.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert!(is_employer(&caller, &stream) || is_delegate(&caller, &stream), "not authorized");
        assert!(stream.status != StreamStatus::Paused, "{}", ERR_ALREADY_PAUSED);
        assert_eq!(stream.status, StreamStatus::Active, "stream not active");
        let now = env.ledger().timestamp();
        stream.paused_at = now;
        stream.status = StreamStatus::Paused;
        save_stream(&env, &stream);
        add_pause_event(&env, stream_id, now, true);
        events::stream_paused(&env, stream_id, &stream.employer, &stream.employee, now);
    }

    pub fn resume_stream(env: Env, caller: Address, stream_id: u64) {
        caller.require_auth();
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        assert!(is_employer(&caller, &stream) || is_delegate(&caller, &stream), "not authorized");
        assert!(stream.status != StreamStatus::Active, "{}", ERR_NOT_PAUSED);
        assert_eq!(stream.status, StreamStatus::Paused, "stream not paused");
        let now = env.ledger().timestamp();
        // Advance last_withdraw_time by the paused duration to exclude it while
        // preserving pre-pause accrued earnings.
        let paused_duration = now.saturating_sub(stream.paused_at);
        stream.last_withdraw_time = stream.last_withdraw_time.saturating_add(paused_duration);
        stream.paused_at = 0;
        stream.status = StreamStatus::Active;
        save_stream(&env, &stream);
        add_pause_event(&env, stream_id, now, false);
        events::stream_resumed(&env, stream_id, &stream.employer, &stream.employee, now);
    }

    pub fn cancel_stream(env: Env, employer: Address, stream_id: u64) {
        employer.require_auth();
        let mut stream = require_employer_by_id(&env, &employer, stream_id);
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
        events::stream_cancelled(&env, stream_id, &employer, &stream.employee, refund, claimable);
    }

    /// Set or revoke a delegate for stream management. (#287)
    pub fn set_delegate(env: Env, employer: Address, stream_id: u64, delegate: Option<Address>) {
        employer.require_auth();
        let mut stream = require_employer_by_id(&env, &employer, stream_id);
        stream.delegate = delegate.clone();
        save_stream(&env, &stream);
        events::delegate_set(&env, stream_id, delegate);
    }

    pub fn propose_employer_transfer(env: Env, employer: Address, stream_id: u64, new_employer: Address) {
        employer.require_auth();
        let stream = require_employer_by_id(&env, &employer, stream_id);
        set_pending_employer(&env, stream_id, &new_employer);
        events::employer_transfer_proposed(&env, stream_id, &employer, &new_employer);
    }

    pub fn accept_employer_transfer(env: Env, new_employer: Address, stream_id: u64) {
        new_employer.require_auth();
        require_pending_employer(&env, &new_employer, stream_id);
        let mut stream = load_stream(&env, stream_id).expect("stream not found");
        let old_employer = stream.employer.clone();
        stream.employer = new_employer.clone();
        save_stream(&env, &stream);
        clear_pending_employer(&env, stream_id);
        events::employer_transfer_accepted(&env, stream_id, &old_employer, &new_employer);
    }

    /// Update the rate_per_second of an active stream (#122).
    ///
    /// Crystallises earnings at the old rate before switching to `new_rate`.
    pub fn update_rate(env: Env, employer: Address, stream_id: u64, new_rate: i128) {
        employer.require_auth();
        assert!(new_rate > 0, "{}", ERR_ZERO_RATE);
        assert!(new_rate <= MAX_RATE_PER_SECOND, "{}", types::ERR_INVALID_RATE);

        let mut stream = require_employer_by_id(&env, &employer, stream_id);
        assert_eq!(stream.status, StreamStatus::Active, "stream not active");

        let now = env.ledger().timestamp();
        let accrued = claimable_amount(&stream, now);
        stream.withdrawn = stream.withdrawn.checked_add(accrued).expect("withdrawn overflow");
        stream.last_withdraw_time = now;

        let old_rate = stream.rate_per_second;
        stream.rate_per_second = new_rate;
        save_stream(&env, &stream);
        events::rate_changed(&env, stream_id, old_rate, new_rate);
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        load_stream(&env, stream_id).expect("stream not found")
    }

    pub fn claimable(env: Env, stream_id: u64) -> i128 {
        let stream = load_stream(&env, stream_id).expect("stream not found");
        claimable_amount(&stream, env.ledger().timestamp())
    }

    pub fn claimable_at(env: Env, stream_id: u64, timestamp: u64) -> i128 {
        let stream = load_stream(&env, stream_id).expect("stream not found");
        claimable_amount(&stream, timestamp)
    }

    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>, nonce: u64) {
        admin.require_auth();
        require_admin(&env, &admin);
        consume_admin_nonce(&env, nonce);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn migrate(env: Env, admin: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
    }

    pub fn stream_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0)
    }

    pub fn admin_nonce(env: Env) -> u64 {
        get_admin_nonce(&env)
    }

    pub fn max_streams_per_employer(env: Env) -> u32 {
        get_max_streams_per_employer(&env)
    }

    pub fn streams_by_employer(env: Env, employer: Address) -> Vec<u64> {
        get_employer_streams(&env, &employer)
    }

    pub fn streams_by_employee(env: Env, employee: Address) -> Vec<u64> {
        get_employee_streams(&env, &employee)
    }

    pub fn pause_history(env: Env, stream_id: u64) -> Vec<PauseEvent> {
        get_pause_history(&env, stream_id)
    }

    // ---------------------------------------------------------------------------
    // Governance (#124)
    // ---------------------------------------------------------------------------

    pub fn propose_parameter(env: Env, proposer: Address, param: GovParam, new_value: u64) -> u64 {
        proposer.require_auth();
        let id = next_proposal_id(&env);
        let now = env.ledger().timestamp();
        let proposal = Proposal {
            id,
            param,
            new_value,
            votes_for: 0,
            votes_against: 0,
            status: ProposalStatus::Active,
            executable_after: now + GOV_TIMELOCK,
        };
        save_proposal(&env, &proposal);
        events::proposal_created(&env, id);
        id
    }

    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();
        let mut proposal = load_proposal(&env, proposal_id).expect("proposal not found");
        assert_eq!(proposal.status, ProposalStatus::Active, "proposal not active");
        assert!(!has_voted(&env, proposal_id, &voter), "already voted");
        mark_voted(&env, proposal_id, &voter);
        if support { proposal.votes_for += 1; } else { proposal.votes_against += 1; }
        save_proposal(&env, &proposal);
    }

    pub fn tally(env: Env, proposal_id: u64) {
        let proposal = load_proposal(&env, proposal_id).expect("proposal not found");
        assert_eq!(proposal.status, ProposalStatus::Active, "proposal not active");
        tally_proposal(&env, proposal);
    }

    pub fn execute_proposal(env: Env, proposal_id: u64) {
        let mut proposal = load_proposal(&env, proposal_id).expect("proposal not found");
        assert_eq!(proposal.status, ProposalStatus::Passed, "proposal not passed");
        let now = env.ledger().timestamp();
        assert!(now >= proposal.executable_after, "timelock not elapsed");
        apply_proposal(&env, &proposal);
        proposal.status = ProposalStatus::Executed;
        save_proposal(&env, &proposal);
        events::proposal_executed(&env, proposal_id);
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        load_proposal(&env, proposal_id).expect("proposal not found")
    }
}
