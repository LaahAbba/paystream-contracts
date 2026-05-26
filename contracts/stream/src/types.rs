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
    pub status: StreamStatus,
    /// Timestamp when the stream was paused; 0 if not paused.
    pub paused_at: u64,
    /// Reentrancy guard.
    pub locked: bool,
}

/// Storage keys.
#[contracttype]
pub enum DataKey {
    Stream(u64),
    StreamCount,
    Admin,
    MinDeposit,
    /// Index: employer address → Vec<u64> of stream IDs they own.
    EmployerStreams(Address),
    /// Global pause flag (bool). When true, create/withdraw are blocked.
    GlobalPaused,
    /// Per-employer active stream count (u32).
    EmployerStreamCount(Address),
    /// Max active streams per employer (u32). Default: 1000.
    EmployerStreamLimit,
    /// Pending upgrade: (new_wasm_hash: BytesN<32>, scheduled_at: u64).
    UpgradePending,
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
/// | E005 | ERR_GLOBAL_PAUSED   | Contract is globally paused                  |
/// | E006 | ERR_STREAM_LIMIT    | Employer has reached active stream limit      |
/// | E007 | ERR_UPGRADE_PENDING | Upgrade already scheduled                    |
/// | E008 | ERR_UPGRADE_LOCKED  | Upgrade timelock has not elapsed              |
/// | E009 | ERR_NO_UPGRADE      | No upgrade is pending                        |
pub const ERR_ZERO_RATE: &str = "E001: rate_per_second must be greater than zero";
pub const ERR_ZERO_DEPOSIT: &str = "E002: deposit must be positive";
pub const ERR_REENTRANT: &str = "E003: reentrant withdraw detected";
pub const ERR_OVERFLOW: &str = "E004: arithmetic overflow in claimable calculation";
pub const ERR_GLOBAL_PAUSED: &str = "E005: contract is globally paused";
pub const ERR_STREAM_LIMIT: &str = "E006: StreamLimitExceeded";
pub const ERR_UPGRADE_PENDING: &str = "E007: upgrade already scheduled";
pub const ERR_UPGRADE_LOCKED: &str = "E008: upgrade timelock has not elapsed (48h required)";
pub const ERR_NO_UPGRADE: &str = "E009: no upgrade is pending";
