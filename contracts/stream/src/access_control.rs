// SPDX-License-Identifier: Apache-2.0

//! # Access Control Module
//!
//! Centralized authorization and permission checks for the stream contract.
//! All role-based access control is managed through this module to ensure
//! consistent security enforcement across the codebase.
//!
//! ## Roles
//!
//! ### Admin
//! The contract administrator with system-wide privileges:
//! - Initialize the contract
//! - Transfer admin role (two-step process)
//! - Pause/unpause the entire contract
//! - Set protocol parameters (min deposit, fees, limits)
//! - Upgrade contract WASM
//! - Execute migrations
//!
//! ### Employer
//! The party that creates and funds salary streams:
//! - Create individual or batch streams
//! - Top up stream deposits
//! - Pause/resume their own streams
//! - Cancel their own streams
//! - Update rate for their own streams
//! - Transfer stream ownership (two-step process)
//!
//! ### Employee
//! The beneficiary of a salary stream:
//! - Withdraw earned funds from their streams
//! - View their stream details
//!
//! ### Proposer/Voter
//! Any address can participate in governance:
//! - Create governance proposals
//! - Vote on active proposals
//!
//! ## Security Features
//!
//! - **Nonce-based replay protection**: Admin operations require sequential nonces
//! - **Two-step transfers**: Admin and employer transfers require acceptance
//! - **Stream isolation**: Users can only control their own streams
//! - **Reentrancy protection**: Withdraw operations use locking mechanism

use soroban_sdk::{Address, Env};
use crate::storage::{get_admin, get_pending_admin, get_pending_employer, load_stream};
use crate::types::{Stream, ERR_UNAUTHORIZED_TRANSFER};

// ---------------------------------------------------------------------------
// Error Messages
// ---------------------------------------------------------------------------

pub const ERR_NOT_ADMIN: &str = "not the admin";
pub const ERR_NOT_PENDING_ADMIN: &str = "not the pending admin";
pub const ERR_NOT_EMPLOYER: &str = "not the employer";
pub const ERR_NOT_EMPLOYEE: &str = "not the employee";
pub const ERR_NOT_DELEGATE: &str = "not the delegate";

// ---------------------------------------------------------------------------
// Admin Role Checks
// ---------------------------------------------------------------------------

/// Verify that the caller is the current admin.
///
/// # Panics
/// Panics with "not the admin" if the provided address does not match the stored admin.
///
/// # Example
/// ```ignore
/// require_admin(&env, &caller);
/// // Proceed with admin operation
/// ```
pub fn require_admin(env: &Env, caller: &Address) {
    let admin = get_admin(env);
    assert_eq!(*caller, admin, "{}", ERR_NOT_ADMIN);
}

/// Verify that the caller is the pending admin (for two-step admin transfer).
///
/// # Panics
/// Panics with "not the pending admin" if:
/// - No pending admin is set
/// - The provided address does not match the pending admin
///
/// # Example
/// ```ignore
/// require_pending_admin(&env, &new_admin);
/// // Complete admin transfer
/// ```
pub fn require_pending_admin(env: &Env, caller: &Address) {
    let pending = get_pending_admin(env).expect("no pending admin");
    assert_eq!(*caller, pending, "{}", ERR_NOT_PENDING_ADMIN);
}

// ---------------------------------------------------------------------------
// Employer Role Checks
// ---------------------------------------------------------------------------

/// Verify that the caller is the employer of the specified stream.
///
/// # Panics
/// Panics with "not the employer" if the caller does not match the stream's employer.
///
/// # Example
/// ```ignore
/// let stream = load_stream(&env, stream_id).expect("stream not found");
/// require_employer(&env, &caller, &stream);
/// // Proceed with employer operation
/// ```
pub fn require_employer(caller: &Address, stream: &Stream) {
    assert_eq!(*caller, stream.employer, "{}", ERR_NOT_EMPLOYER);
}

/// Verify that the caller is the employer of the specified stream (by ID).
///
/// Convenience function that loads the stream and checks employer in one call.
///
/// # Panics
/// Panics if:
/// - Stream not found
/// - Caller is not the employer
///
/// # Returns
/// The loaded stream if authorization succeeds.
///
/// # Example
/// ```ignore
/// let stream = require_employer_by_id(&env, &caller, stream_id);
/// // Proceed with employer operation using the loaded stream
/// ```
pub fn require_employer_by_id(env: &Env, caller: &Address, stream_id: u64) -> Stream {
    let stream = load_stream(env, stream_id).expect("stream not found");
    require_employer(caller, &stream);
    stream
}

/// Verify that the caller is the pending employer for a stream transfer.
///
/// # Panics
/// Panics with ERR_UNAUTHORIZED_TRANSFER if:
/// - No pending employer transfer exists for this stream
/// - The caller does not match the pending employer
///
/// # Example
/// ```ignore
/// require_pending_employer(&env, &new_employer, stream_id);
/// // Complete employer transfer
/// ```
pub fn require_pending_employer(env: &Env, caller: &Address, stream_id: u64) {
    let pending = get_pending_employer(env, stream_id)
        .expect("no pending employer transfer");
    assert_eq!(*caller, pending, "{}", ERR_UNAUTHORIZED_TRANSFER);
}

// ---------------------------------------------------------------------------
// Employee Role Checks
// ---------------------------------------------------------------------------

/// Verify that the caller is the employee of the specified stream.
///
/// # Panics
/// Panics with "not the employee" if the caller does not match the stream's employee.
///
/// # Example
/// ```ignore
/// let stream = load_stream(&env, stream_id).expect("stream not found");
/// require_employee(&env, &caller, &stream);
/// // Proceed with employee operation
/// ```
pub fn require_employee(caller: &Address, stream: &Stream) {
    assert_eq!(*caller, stream.employee, "{}", ERR_NOT_EMPLOYEE);
}

/// Verify that the caller is the employee of the specified stream (by ID).
///
/// Convenience function that loads the stream and checks employee in one call.
///
/// # Panics
/// Panics if:
/// - Stream not found
/// - Caller is not the employee
///
/// # Returns
/// The loaded stream if authorization succeeds.
///
/// # Example
/// ```ignore
/// let stream = require_employee_by_id(&env, &caller, stream_id);
/// // Proceed with employee operation using the loaded stream
/// ```
pub fn require_employee_by_id(env: &Env, caller: &Address, stream_id: u64) -> Stream {
    let stream = load_stream(env, stream_id).expect("stream not found");
    require_employee(caller, &stream);
    stream
}

// ---------------------------------------------------------------------------
// Combined Authorization Helpers
// ---------------------------------------------------------------------------

/// Check if an address is authorized to perform admin operations.
///
/// This is a non-panicking version useful for conditional logic.
///
/// # Returns
/// `true` if the address matches the stored admin, `false` otherwise.
pub fn is_admin(env: &Env, address: &Address) -> bool {
    let admin = get_admin(env);
    *address == admin
}

/// Check if an address is the employer of a specific stream.
///
/// This is a non-panicking version useful for conditional logic.
///
/// # Returns
/// `true` if the address matches the stream's employer, `false` otherwise.
pub fn is_employer(address: &Address, stream: &Stream) -> bool {
    *address == stream.employer
}

/// Check if an address is the employee of a specific stream.
///
/// This is a non-panicking version useful for conditional logic.
///
/// # Returns
/// `true` if the address matches the stream's employee, `false` otherwise.
pub fn is_employee(address: &Address, stream: &Stream) -> bool {
    *address == stream.employee
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::{StreamContract};
    use crate::storage::{save_stream, set_admin, set_pending_admin, set_pending_employer};
    use crate::types::{Stream, StreamStatus};

    fn create_test_stream(env: &Env, id: u64, employer: &Address, employee: &Address) -> Stream {
        Stream {
            id,
            employer: employer.clone(),
            employee: employee.clone(),
            token: Address::generate(env),
            deposit: 1000,
            withdrawn: 0,
            rate_per_second: 10,
            start_time: 0,
            stop_time: 100,
            last_withdraw_time: 0,
            cooldown_period: 0,
            status: StreamStatus::Active,
            locked: false,
            cliff_time: 0,
            paused_at: 0,
            delegate: None,
        }
    }

    #[test]
    fn test_require_admin_success() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let admin = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_admin(&env, &admin);
            require_admin(&env, &admin);
        });
    }

    #[test]
    #[should_panic(expected = "not the admin")]
    fn test_require_admin_failure() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_admin(&env, &admin);
            require_admin(&env, &attacker);
        });
    }

    #[test]
    fn test_require_pending_admin_success() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let pending = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_pending_admin(&env, &pending);
            require_pending_admin(&env, &pending);
        });
    }

    #[test]
    #[should_panic(expected = "not the pending admin")]
    fn test_require_pending_admin_failure() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let pending = Address::generate(&env);
        let attacker = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_pending_admin(&env, &pending);
            require_pending_admin(&env, &attacker);
        });
    }

    #[test]
    fn test_require_employer_success() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        require_employer(&employer, &stream);
    }

    #[test]
    #[should_panic(expected = "not the employer")]
    fn test_require_employer_failure() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let attacker = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        require_employer(&attacker, &stream);
    }

    #[test]
    fn test_require_employer_by_id_success() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        env.as_contract(&contract_id, || {
            save_stream(&env, &stream);
            let loaded = require_employer_by_id(&env, &employer, 1);
            assert_eq!(loaded.id, 1);
        });
    }

    #[test]
    #[should_panic(expected = "not the employer")]
    fn test_require_employer_by_id_failure() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let attacker = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        env.as_contract(&contract_id, || {
            save_stream(&env, &stream);
            require_employer_by_id(&env, &attacker, 1);
        });
    }

    #[test]
    fn test_require_employee_success() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        require_employee(&employee, &stream);
    }

    #[test]
    #[should_panic(expected = "not the employee")]
    fn test_require_employee_failure() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let attacker = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        require_employee(&attacker, &stream);
    }

    #[test]
    fn test_require_employee_by_id_success() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        env.as_contract(&contract_id, || {
            save_stream(&env, &stream);
            let loaded = require_employee_by_id(&env, &employee, 1);
            assert_eq!(loaded.id, 1);
        });
    }

    #[test]
    #[should_panic(expected = "not the employee")]
    fn test_require_employee_by_id_failure() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let attacker = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);
        env.as_contract(&contract_id, || {
            save_stream(&env, &stream);
            require_employee_by_id(&env, &attacker, 1);
        });
    }

    #[test]
    fn test_require_pending_employer_success() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let new_employer = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_pending_employer(&env, 1, &new_employer);
            require_pending_employer(&env, &new_employer, 1);
        });
    }

    #[test]
    #[should_panic(expected = "E013")]
    fn test_require_pending_employer_failure() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let new_employer = Address::generate(&env);
        let attacker = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_pending_employer(&env, 1, &new_employer);
            require_pending_employer(&env, &attacker, 1);
        });
    }

    #[test]
    fn test_is_admin() {
        let env = Env::default();
        let contract_id = env.register(StreamContract, ());
        let admin = Address::generate(&env);
        let other = Address::generate(&env);
        env.as_contract(&contract_id, || {
            set_admin(&env, &admin);
            assert!(is_admin(&env, &admin));
            assert!(!is_admin(&env, &other));
        });
    }

    #[test]
    fn test_is_employer() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let other = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);

        assert!(is_employer(&employer, &stream));
        assert!(!is_employer(&employee, &stream));
        assert!(!is_employer(&other, &stream));
    }

    #[test]
    fn test_is_employee() {
        let env = Env::default();
        let employer = Address::generate(&env);
        let employee = Address::generate(&env);
        let other = Address::generate(&env);
        let stream = create_test_stream(&env, 1, &employer, &employee);

        assert!(is_employee(&employee, &stream));
        assert!(!is_employee(&employer, &stream));
        assert!(!is_employee(&other, &stream));
    }
}

// ---------------------------------------------------------------------------
// Delegate Role Checks
// ---------------------------------------------------------------------------

/// Verify that the caller is the delegate of the specified stream.
///
/// # Panics
/// Panics with "not the delegate" if the caller is not the delegate.
pub fn require_delegate(caller: &Address, stream: &Stream) {
    assert!(is_delegate(caller, stream), "{}", ERR_NOT_DELEGATE);
}

/// Check if an address is the delegate of a specific stream.
///
/// This is a non-panicking version useful for conditional logic.
///
/// # Returns
/// `true` if the address matches the stream's delegate, `false` otherwise.
pub fn is_delegate(address: &Address, stream: &Stream) -> bool {
    if let Some(delegate) = &stream.delegate {
        *address == *delegate
    } else {
        false
    }
}
