// SPDX-License-Identifier: Apache-2.0

use soroban_sdk::Address;
use crate::types::{
    ERR_ZERO_DEPOSIT, ERR_ZERO_RATE, ERR_BELOW_MIN_DEPOSIT, ERR_INVALID_RATE, ERR_SAME_PARTY,
    ERR_DURATION_TOO_LONG, ERR_MAX_STREAMS_REACHED, ERR_STOP_TIME_PAST, ERR_CLIFF_AFTER_STOP,
};

/// Maximum allowed rate_per_second (1 billion tokens/s — prevents overflow in
/// claimable_amount for any realistic elapsed time up to ~292 years).
pub const MAX_RATE_PER_SECOND: i128 = 1_000_000_000_i128;

/// Maximum allowed stream duration: 10 years in seconds (#277).
pub const MAX_STREAM_DURATION: u64 = 10 * 365 * 24 * 60 * 60; // 315_360_000 seconds

/// Validate stream creation parameters.
///
/// # Panics
/// - E002 if `deposit` ≤ 0
/// - E007 if `deposit` < `min_deposit`
/// - E001 if `rate_per_second` ≤ 0
/// - E008 if `rate_per_second` > MAX_RATE_PER_SECOND
/// - if `stop_time` is in the past (when non-zero)
/// - if `cliff_time` > `stop_time` (when both are non-zero)
/// - if `employer` == `employee`
pub fn validate_create_stream(
    deposit: i128,
    min_deposit: i128,
    rate_per_second: i128,
    stop_time: u64,
    cliff_time: u64,
    now: u64,
    employer: &Address,
    employee: &Address,
) {
    assert!(deposit > 0, "{}", ERR_ZERO_DEPOSIT);
    assert!(deposit >= min_deposit, "{}", ERR_BELOW_MIN_DEPOSIT);
    assert!(rate_per_second > 0, "{}", ERR_ZERO_RATE);
    assert!(rate_per_second <= MAX_RATE_PER_SECOND, "{}", ERR_INVALID_RATE);

    // Duration validation
    let effective_duration = (deposit / rate_per_second) as u64;
    assert!(effective_duration <= MAX_STREAM_DURATION, "{}", ERR_DURATION_TOO_LONG);

    if stop_time > 0 {
        assert!(stop_time > now, "{}", ERR_STOP_TIME_PAST);
        let stop_time_duration = stop_time.saturating_sub(now);
        assert!(stop_time_duration <= MAX_STREAM_DURATION, "{}", ERR_DURATION_TOO_LONG);
    }
    
    // Cliff time validation
    if cliff_time > 0 && stop_time > 0 {
        assert!(cliff_time <= stop_time, "{}", ERR_CLIFF_AFTER_STOP);
    }
    
    assert!(employer != employee, "{}", ERR_SAME_PARTY);
}

/// Validate a top-up amount.
pub fn validate_top_up(amount: i128) {
    assert!(amount > 0, "amount must be positive");
}

/// Validate that the employer has not exceeded the maximum number of streams.
pub fn validate_max_streams(current_count: u32, max_limit: u32) {
    assert!(current_count < max_limit, "{}", ERR_MAX_STREAMS_REACHED);
}
