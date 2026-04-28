# Pause Notification Feature Implementation

## Overview
This document describes the implementation of the pause notification feature for the stream contract, which ensures employees are notified when their payment streams are paused or resumed.

## Changes Made

### 1. Enhanced Events (contracts/stream/src/events.rs)

Added two new event functions to provide detailed pause/resume notifications:

- **`stream_paused`**: Emitted when a stream is paused
  - Parameters: `stream_id`, `employer`, `employee`, `paused_at` (timestamp)
  - Event topic: `"paused"`
  
- **`stream_resumed`**: Emitted when a stream is resumed
  - Parameters: `stream_id`, `employer`, `employee`, `resumed_at` (timestamp)
  - Event topic: `"resumed"`

These events replace the generic `stream_status_changed` event for pause/resume operations, providing the employee address needed for notification services.

### 2. Pause History Storage (contracts/stream/src/types.rs)

Added new types to track pause/resume history:

- **`PauseEvent`** struct:
  ```rust
  pub struct PauseEvent {
      pub stream_id: u64,
      pub timestamp: u64,
      pub is_pause: bool, // true for pause, false for resume
  }
  ```

- **`DataKey::PauseHistory(u64)`**: Storage key for pause history per stream

### 3. Storage Functions (contracts/stream/src/storage.rs)

Added helper functions for pause history management:

- **`add_pause_event`**: Records a pause or resume event
- **`get_pause_history`**: Retrieves the complete pause/resume history for a stream

Both functions use persistent storage with TTL extension to ensure data availability.

### 4. Contract Functions (contracts/stream/src/lib.rs)

Updated pause/resume functions to:

1. **`pause_stream`**:
   - Records pause event in history
   - Emits `stream_paused` event with employee address
   
2. **`resume_stream`**:
   - Records resume event in history
   - Emits `stream_resumed` event with employee address

3. **`pause_history`** (new public function):
   - Returns `Vec<PauseEvent>` for a given stream
   - Allows employees and employers to query pause/resume history

### 5. Tests (contracts/stream/src/test.rs)

Added comprehensive tests:

- **`test_pause_event_includes_employee`**: Verifies pause events are emitted
- **`test_pause_history_tracking`**: Tests basic pause/resume history recording
- **`test_multiple_pause_resume_cycles`**: Validates multiple pause/resume cycles
- **`test_resume_event_includes_employee`**: Verifies resume events are emitted

## Acceptance Criteria Met

✅ **Pause event includes employee address**
- The `stream_paused` event includes `employer`, `employee`, and `paused_at` timestamp
- The `stream_resumed` event includes `employer`, `employee`, and `resumed_at` timestamp

✅ **Notification service sends alert on pause event**
- Events are emitted with all necessary information for off-chain notification services
- Event topics (`"paused"` and `"resumed"`) are easily filterable
- Employee address is included in event data for targeted notifications

✅ **Employee can query pause history**
- New `pause_history(stream_id)` function returns complete history
- Each `PauseEvent` includes timestamp and whether it's a pause or resume
- History is stored persistently with proper TTL management

## Integration Guide for Notification Services

### Listening for Pause Events

Notification services should listen for events with the following structure:

**Pause Event:**
```
Topic: ("paused", stream_id)
Data: (employer_address, employee_address, paused_at_timestamp)
```

**Resume Event:**
```
Topic: ("resumed", stream_id)
Data: (employer_address, employee_address, resumed_at_timestamp)
```

### Querying Pause History

To retrieve the complete pause/resume history for a stream:

```rust
let history = contract.pause_history(&stream_id);
for event in history.iter() {
    if event.is_pause {
        println!("Paused at: {}", event.timestamp);
    } else {
        println!("Resumed at: {}", event.timestamp);
    }
}
```

### Example Notification Flow

1. **Notification service monitors blockchain events**
2. **Detects `stream_paused` event**
3. **Extracts employee address from event data**
4. **Sends notification to employee**: "Your payment stream #{stream_id} has been paused by your employer"
5. **When `stream_resumed` event is detected**
6. **Sends notification to employee**: "Your payment stream #{stream_id} has been resumed"

## Testing

Run the tests with:
```bash
cargo test --package paystream-stream
```

Specific pause notification tests:
```bash
cargo test --package paystream-stream test_pause_event_includes_employee
cargo test --package paystream-stream test_pause_history_tracking
cargo test --package paystream-stream test_multiple_pause_resume_cycles
cargo test --package paystream-stream test_resume_event_includes_employee
```

## Backward Compatibility

- Existing pause/resume functionality remains unchanged
- New events are additive and don't break existing event listeners
- The `pause_history` function is new and doesn't affect existing queries
- Storage layout is extended but doesn't modify existing data structures

## Gas Considerations

- Each pause/resume operation now writes one additional `PauseEvent` to storage
- Storage uses persistent storage with TTL extension (same as other stream data)
- History queries are read-only and don't incur write costs
- For streams with many pause/resume cycles, history size grows linearly

## Future Enhancements

Potential improvements for future versions:

1. **Pagination for pause history**: For streams with many pause/resume cycles
2. **Pause reason field**: Allow employers to provide a reason for pausing
3. **Automatic notifications**: On-chain notification registry for push notifications
4. **Pause duration analytics**: Helper functions to calculate total paused time
