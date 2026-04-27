// SPDX-License-Identifier: Apache-2.0

use soroban_sdk::{contracttype, Address};

/// Status of a salary stream.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamStatus {
    Active,
    Paused,
    Cancelled,
    Exhausted,
}

/// A salary stream: employer deposits funds, employee withdraws per-second.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Stream {
    pub id: u64,
    pub employer: Address,
    pub employee: Address,
    pub token: Address,        // SAC token contract address
    pub deposit: i128,         // total deposited amount
    pub withdrawn: i128,       // total already withdrawn
    pub rate_per_second: i128, // tokens streamed per second
    pub start_time: u64,       // ledger timestamp when stream started
    pub stop_time: u64,        // 0 = no end, else hard stop timestamp
    pub last_withdraw_time: u64,
    pub cooldown_period: u64,  // minimum seconds between withdrawals
    pub status: StreamStatus,
    /// Reentrancy guard: true while a withdraw cross-contract call is in flight.
    /// Soroban executes contracts atomically within a single transaction, so
    /// cross-contract callbacks cannot interleave with the current frame.
    /// This flag is kept as a defence-in-depth measure and documents the
    /// analysis: no reentrant path exists in the current call graph because
    /// `token::transfer` is a leaf call that cannot call back into this
    /// contract.  If a future upgrade introduces a callback hook the guard
    /// will catch it.
    pub locked: bool,
}

/// Parameters for a single stream in a batch create call.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StreamParams {
    pub employee: Address,
    pub token: Address,
    pub deposit: i128,
    pub rate_per_second: i128,
    pub stop_time: u64,
}

/// Storage keys.
#[contracttype]
pub enum DataKey {
    Stream(u64),
    StreamCount,
    Admin,
    /// Minimum deposit enforced on create_stream.
    MinDeposit,
    /// Monotonically-increasing nonce for admin operations (replay protection).
    AdminNonce,
    /// Contract-wide pause flag.
    Paused,
    /// Index: employer address → Vec<u64> of stream IDs they own.
    EmployerStreams(Address),
    /// Index: employee address → Vec<u64> of stream IDs paying them.
    EmployeeStreams(Address),
    PendingAdmin,
    /// Protocol fee in basis points.
    FeeBps,
    /// Address that receives collected protocol fees.
    FeeRecipient,
    /// Pending employer for a two-step stream ownership transfer (stream_id → Address).
    PendingEmployer(u64),
    /// Maximum number of streams an employer can create.
    MaxStreamsPerEmployer,
}

/// Contract error codes – panic messages reference these names so callers can
/// match on a stable string.
///
/// | Code | Constant            | Meaning                                      |
/// |------|---------------------|----------------------------------------------|
/// | E001 | ERR_ZERO_RATE       | `rate_per_second` must be > 0                |
/// | E002 | ERR_ZERO_DEPOSIT    | `deposit` must be > 0                        |
/// | E003 | ERR_REENTRANT       | Reentrant withdraw detected                  |
/// | E004 | ERR_OVERFLOW        | Arithmetic overflow in claimable calculation |
/// | E010 | ERR_WITHDRAW_COOLDOWN | Withdraw cooldown not expired               |
pub const ERR_ZERO_RATE: &str = "E001: rate_per_second must be greater than zero";
pub const ERR_ZERO_DEPOSIT: &str = "E002: deposit must be positive";
pub const ERR_REENTRANT: &str = "E003: reentrant withdraw detected";
pub const ERR_OVERFLOW: &str = "E004: arithmetic overflow in claimable calculation";
pub const ERR_WITHDRAW_COOLDOWN: &str = "E010: withdraw cooldown not expired";
pub const ERR_STREAM_CANCELLED: &str = "E005: cannot top up a cancelled stream";
pub const ERR_STREAM_EXHAUSTED: &str = "E006: cannot top up an exhausted stream";
pub const ERR_BELOW_MIN_DEPOSIT: &str = "E007: deposit below minimum";
pub const ERR_INVALID_RATE: &str = "E008: rate_per_second exceeds maximum";
pub const ERR_BAD_NONCE: &str = "E009: invalid admin nonce";
pub const ERR_SAME_PARTY: &str = "E010: employer and employee must differ";
pub const ERR_FEE_TOO_HIGH: &str = "E011: fee_bps exceeds maximum of 100";
pub const ERR_INVALID_TOKEN: &str = "E012: token address is not a valid SEP-41 contract";
pub const ERR_UNAUTHORIZED_TRANSFER: &str = "E013: not the pending employer for this stream";
pub const ERR_DURATION_TOO_LONG: &str = "E014: stream duration exceeds maximum allowed";
pub const ERR_MAX_STREAMS_REACHED: &str = "E015: maximum streams per employer reached";

