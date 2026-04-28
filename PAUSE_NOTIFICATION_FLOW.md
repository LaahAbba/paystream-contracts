# Pause Notification Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Soroban Smart Contract                       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    pause_stream()                             │  │
│  │  1. Verify employer authorization                             │  │
│  │  2. Update stream status to Paused                            │  │
│  │  3. Record timestamp in stream.paused_at                      │  │
│  │  4. Store PauseEvent in history                               │  │
│  │  5. Emit stream_paused event                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                Event: stream_paused                           │  │
│  │  Topic: ("paused", stream_id)                                 │  │
│  │  Data: (employer, employee, timestamp)                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Blockchain Event Stream                           │
│  Events are published to the Soroban network and can be queried     │
│  by off-chain services using RPC endpoints                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Notification Service (Off-Chain)                   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Event Monitor (Polling/Streaming)                │  │
│  │  - Queries blockchain for new events                          │  │
│  │  - Filters for "paused" and "resumed" topics                  │  │
│  │  - Extracts employee address from event data                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Notification Dispatcher                          │  │
│  │  - Maps employee address to contact info                      │  │
│  │  - Formats notification message                               │  │
│  │  - Sends via multiple channels:                               │  │
│  │    • Email                                                     │  │
│  │    • Push notification                                        │  │
│  │    • SMS                                                       │  │
│  │    • In-app notification                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Employee                                    │
│  Receives notification: "Your payment stream #123 has been paused"  │
└─────────────────────────────────────────────────────────────────────┘
```

## Sequence Diagram: Pause Flow

```
Employer          Contract              Blockchain         Notification       Employee
   │                 │                      │                Service            │
   │                 │                      │                   │               │
   │ pause_stream()  │                      │                   │               │
   ├────────────────>│                      │                   │               │
   │                 │                      │                   │               │
   │                 │ Verify auth          │                   │               │
   │                 │ Update status        │                   │               │
   │                 │ Store PauseEvent     │                   │               │
   │                 │                      │                   │               │
   │                 │ Emit event           │                   │               │
   │                 ├─────────────────────>│                   │               │
   │                 │                      │                   │               │
   │    Success      │                      │                   │               │
   │<────────────────┤                      │                   │               │
   │                 │                      │                   │               │
   │                 │                      │  Poll events      │               │
   │                 │                      │<──────────────────┤               │
   │                 │                      │                   │               │
   │                 │                      │  Event data       │               │
   │                 │                      ├──────────────────>│               │
   │                 │                      │                   │               │
   │                 │                      │                   │ Process event │
   │                 │                      │                   │ Get employee  │
   │                 │                      │                   │ contact info  │
   │                 │                      │                   │               │
   │                 │                      │                   │ Send alert    │
   │                 │                      │                   ├──────────────>│
   │                 │                      │                   │               │
   │                 │                      │                   │  Notification │
   │                 │                      │                   │  received     │
   │                 │                      │                   │               │
```

## Sequence Diagram: Resume Flow

```
Employer          Contract              Blockchain         Notification       Employee
   │                 │                      │                Service            │
   │                 │                      │                   │               │
   │ resume_stream() │                      │                   │               │
   ├────────────────>│                      │                   │               │
   │                 │                      │                   │               │
   │                 │ Verify auth          │                   │               │
   │                 │ Update status        │                   │               │
   │                 │ Adjust withdraw time │                   │               │
   │                 │ Store PauseEvent     │                   │               │
   │                 │                      │                   │               │
   │                 │ Emit event           │                   │               │
   │                 ├─────────────────────>│                   │               │
   │                 │                      │                   │               │
   │    Success      │                      │                   │               │
   │<────────────────┤                      │                   │               │
   │                 │                      │                   │               │
   │                 │                      │  Poll events      │               │
   │                 │                      │<──────────────────┤               │
   │                 │                      │                   │               │
   │                 │                      │  Event data       │               │
   │                 │                      ├──────────────────>│               │
   │                 │                      │                   │               │
   │                 │                      │                   │ Process event │
   │                 │                      │                   │ Send alert    │
   │                 │                      │                   ├──────────────>│
   │                 │                      │                   │               │
   │                 │                      │                   │  Notification │
   │                 │                      │                   │  received     │
   │                 │                      │                   │               │
```

## Sequence Diagram: Query Pause History

```
Employee/UI       Contract              Storage
   │                 │                      │
   │                 │                      │
   │ pause_history() │                      │
   ├────────────────>│                      │
   │                 │                      │
   │                 │ Load PauseHistory    │
   │                 ├─────────────────────>│
   │                 │                      │
   │                 │ Vec<PauseEvent>      │
   │                 │<─────────────────────┤
   │                 │                      │
   │ Vec<PauseEvent> │                      │
   │<────────────────┤                      │
   │                 │                      │
   │ Display history │                      │
   │                 │                      │
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Contract State                               │
│                                                                       │
│  Stream {                                                            │
│    id: 123,                                                          │
│    employer: "GABC...",                                              │
│    employee: "GXYZ...",                                              │
│    status: Paused,                                                   │
│    paused_at: 1714320000,                                            │
│    ...                                                               │
│  }                                                                   │
│                                                                       │
│  PauseHistory(123) = [                                               │
│    PauseEvent { stream_id: 123, timestamp: 1714320000, is_pause: true },  │
│    PauseEvent { stream_id: 123, timestamp: 1714323600, is_pause: false }, │
│    PauseEvent { stream_id: 123, timestamp: 1714330800, is_pause: true },  │
│  ]                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ Events emitted
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Blockchain Events                               │
│                                                                       │
│  Event 1: stream_paused(123, "GABC...", "GXYZ...", 1714320000)     │
│  Event 2: stream_resumed(123, "GABC...", "GXYZ...", 1714323600)    │
│  Event 3: stream_paused(123, "GABC...", "GXYZ...", 1714330800)     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ Monitored by
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Notification Service Database                      │
│                                                                       │
│  Employee Contacts:                                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Address: "GXYZ..."                                              │ │
│  │ Email: employee@example.com                                     │ │
│  │ Phone: +1-555-0123                                              │ │
│  │ Push Token: "fcm_token_abc123"                                  │ │
│  │ Preferences: { email: true, push: true, sms: false }           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Notification Log:                                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ { stream_id: 123, type: "pause", sent_at: 1714320005,         │ │
│  │   channels: ["email", "push"], status: "delivered" }           │ │
│  │ { stream_id: 123, type: "resume", sent_at: 1714323605,        │ │
│  │   channels: ["email", "push"], status: "delivered" }           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## State Transitions

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Stream Status States                            │
│                                                                       │
│                                                                       │
│                    ┌──────────┐                                      │
│                    │  Active  │                                      │
│                    └────┬─────┘                                      │
│                         │                                            │
│                         │ pause_stream()                             │
│                         │ • Set status = Paused                      │
│                         │ • Set paused_at = now                      │
│                         │ • Store PauseEvent(is_pause=true)          │
│                         │ • Emit stream_paused event                 │
│                         │                                            │
│                         ▼                                            │
│                    ┌──────────┐                                      │
│                    │  Paused  │                                      │
│                    └────┬─────┘                                      │
│                         │                                            │
│                         │ resume_stream()                            │
│                         │ • Set status = Active                      │
│                         │ • Adjust last_withdraw_time                │
│                         │ • Set paused_at = 0                        │
│                         │ • Store PauseEvent(is_pause=false)         │
│                         │ • Emit stream_resumed event                │
│                         │                                            │
│                         ▼                                            │
│                    ┌──────────┐                                      │
│                    │  Active  │                                      │
│                    └──────────┘                                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Event Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Event Processing Pipeline                         │
│                                                                       │
│  1. Event Detection                                                  │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Poll blockchain every N seconds                          │  │
│     │ • Filter events by contract address                        │  │
│     │ • Filter events by topics: ["paused", "resumed"]           │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  2. Event Parsing                                                    │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Extract stream_id from topic                             │  │
│     │ • Extract employer, employee, timestamp from data          │  │
│     │ • Determine event type (pause vs resume)                   │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  3. Deduplication                                                    │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Check if event already processed                         │  │
│     │ • Use event ID or (stream_id, timestamp) as key            │  │
│     │ • Skip if duplicate                                        │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  4. Employee Lookup                                                  │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Query database for employee contact info                 │  │
│     │ • Get notification preferences                             │  │
│     │ • Handle missing contact info gracefully                   │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  5. Notification Formatting                                          │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Format message based on event type                       │  │
│     │ • Localize message to employee's language                  │  │
│     │ • Include stream details and timestamp                     │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  6. Multi-Channel Delivery                                           │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Send email notification                                  │  │
│     │ • Send push notification                                   │  │
│     │ • Send SMS (if enabled)                                    │  │
│     │ • Update in-app notification center                        │  │
│     └────────────────────────────────────────────────────────────┘  │
│                              │                                        │
│                              ▼                                        │
│  7. Logging & Monitoring                                             │
│     ┌────────────────────────────────────────────────────────────┐  │
│     │ • Log notification sent                                    │  │
│     │ • Track delivery status                                    │  │
│     │ • Monitor for failures                                     │  │
│     │ • Implement retry logic                                    │  │
│     └────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Timeline Example

```
Time (seconds)    Event                           Storage                    Notification
─────────────────────────────────────────────────────────────────────────────────────────
0                 Stream created                  Stream(1) created          -
                  Status: Active

100               Employer pauses stream          PauseEvent added:          Email sent to employee
                  pause_stream(1)                 { id:1, ts:100,            "Stream paused"
                                                    is_pause: true }
                  Status: Paused                  stream_paused event →

200               Employee checks history         Read PauseHistory(1)       -
                  pause_history(1)                Returns: [
                                                    { ts:100, is_pause:true }
                                                  ]

300               Employer resumes stream         PauseEvent added:          Email sent to employee
                  resume_stream(1)                { id:1, ts:300,            "Stream resumed"
                                                    is_pause: false }
                  Status: Active                  stream_resumed event →

400               Employee checks history         Read PauseHistory(1)       -
                  pause_history(1)                Returns: [
                                                    { ts:100, is_pause:true },
                                                    { ts:300, is_pause:false }
                                                  ]
```
