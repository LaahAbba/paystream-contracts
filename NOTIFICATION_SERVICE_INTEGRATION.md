# Notification Service Integration Guide

## Overview

This guide shows how to integrate with the pause notification feature to send alerts to employees when their payment streams are paused or resumed.

## Event Monitoring

### Event Structure

The contract emits two types of events for pause/resume operations:

#### Pause Event
```
Topic: ("paused", <stream_id>)
Data: (<employer_address>, <employee_address>, <paused_at_timestamp>)
```

#### Resume Event
```
Topic: ("resumed", <stream_id>)
Data: (<employer_address>, <employee_address>, <resumed_at_timestamp>)
```

### JavaScript/TypeScript Example

```typescript
import { SorobanRpc } from '@stellar/stellar-sdk';

// Initialize Soroban RPC client
const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');

// Contract address
const contractAddress = 'YOUR_CONTRACT_ADDRESS';

// Monitor events
async function monitorPauseEvents() {
  // Get latest ledger
  const latestLedger = await server.getLatestLedger();
  
  // Get events from the contract
  const events = await server.getEvents({
    startLedger: latestLedger.sequence - 100, // Look back 100 ledgers
    filters: [
      {
        type: 'contract',
        contractIds: [contractAddress],
        topics: [['paused'], ['resumed']]
      }
    ]
  });

  for (const event of events.events) {
    const topic = event.topic[0]; // 'paused' or 'resumed'
    const streamId = event.topic[1];
    const [employer, employee, timestamp] = event.value;

    if (topic === 'paused') {
      await sendPauseNotification(employee, streamId, timestamp);
    } else if (topic === 'resumed') {
      await sendResumeNotification(employee, streamId, timestamp);
    }
  }
}

async function sendPauseNotification(employeeAddress, streamId, timestamp) {
  console.log(`Sending pause notification to ${employeeAddress}`);
  
  // Your notification logic here:
  // - Email notification
  // - Push notification
  // - SMS alert
  // - In-app notification
  
  const message = {
    to: employeeAddress,
    subject: 'Payment Stream Paused',
    body: `Your payment stream #${streamId} has been paused at ${new Date(timestamp * 1000).toISOString()}.`
  };
  
  // Send notification via your preferred service
  // await notificationService.send(message);
}

async function sendResumeNotification(employeeAddress, streamId, timestamp) {
  console.log(`Sending resume notification to ${employeeAddress}`);
  
  const message = {
    to: employeeAddress,
    subject: 'Payment Stream Resumed',
    body: `Your payment stream #${streamId} has been resumed at ${new Date(timestamp * 1000).toISOString()}.`
  };
  
  // await notificationService.send(message);
}

// Run monitoring every 30 seconds
setInterval(monitorPauseEvents, 30000);
```

### Python Example

```python
from stellar_sdk import SorobanServer
from datetime import datetime
import time

# Initialize Soroban server
server = SorobanServer("https://soroban-testnet.stellar.org")

# Contract address
CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS"

def monitor_pause_events():
    """Monitor pause and resume events from the contract."""
    
    # Get latest ledger
    latest_ledger = server.get_latest_ledger()
    start_ledger = latest_ledger.sequence - 100  # Look back 100 ledgers
    
    # Get events
    events = server.get_events(
        start_ledger=start_ledger,
        filters=[{
            "type": "contract",
            "contractIds": [CONTRACT_ADDRESS],
            "topics": [["paused"], ["resumed"]]
        }]
    )
    
    for event in events.events:
        topic = event.topic[0]  # 'paused' or 'resumed'
        stream_id = event.topic[1]
        employer, employee, timestamp = event.value
        
        if topic == "paused":
            send_pause_notification(employee, stream_id, timestamp)
        elif topic == "resumed":
            send_resume_notification(employee, stream_id, timestamp)

def send_pause_notification(employee_address, stream_id, timestamp):
    """Send notification when stream is paused."""
    print(f"Sending pause notification to {employee_address}")
    
    dt = datetime.fromtimestamp(timestamp)
    message = {
        "to": employee_address,
        "subject": "Payment Stream Paused",
        "body": f"Your payment stream #{stream_id} has been paused at {dt.isoformat()}."
    }
    
    # Send notification via your preferred service
    # notification_service.send(message)

def send_resume_notification(employee_address, stream_id, timestamp):
    """Send notification when stream is resumed."""
    print(f"Sending resume notification to {employee_address}")
    
    dt = datetime.fromtimestamp(timestamp)
    message = {
        "to": employee_address,
        "subject": "Payment Stream Resumed",
        "body": f"Your payment stream #{stream_id} has been resumed at {dt.isoformat()}."
    }
    
    # notification_service.send(message)

# Run monitoring loop
while True:
    try:
        monitor_pause_events()
    except Exception as e:
        print(f"Error monitoring events: {e}")
    
    time.sleep(30)  # Check every 30 seconds
```

## Querying Pause History

### JavaScript/TypeScript Example

```typescript
import { Contract, SorobanRpc } from '@stellar/stellar-sdk';

async function getPauseHistory(streamId: number) {
  const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
  const contract = new Contract(contractAddress);
  
  // Call pause_history function
  const result = await contract.call('pause_history', streamId);
  
  // Parse results
  const history = result.map(event => ({
    streamId: event.stream_id,
    timestamp: event.timestamp,
    isPause: event.is_pause,
    type: event.is_pause ? 'PAUSED' : 'RESUMED',
    date: new Date(event.timestamp * 1000)
  }));
  
  return history;
}

// Usage
const streamId = 1;
const history = await getPauseHistory(streamId);

console.log(`Pause history for stream ${streamId}:`);
history.forEach(event => {
  console.log(`- ${event.type} at ${event.date.toISOString()}`);
});
```

### Python Example

```python
from stellar_sdk import SorobanServer, Contract

def get_pause_history(stream_id: int):
    """Get pause/resume history for a stream."""
    server = SorobanServer("https://soroban-testnet.stellar.org")
    contract = Contract(CONTRACT_ADDRESS)
    
    # Call pause_history function
    result = contract.call("pause_history", stream_id)
    
    # Parse results
    history = []
    for event in result:
        history.append({
            "stream_id": event.stream_id,
            "timestamp": event.timestamp,
            "is_pause": event.is_pause,
            "type": "PAUSED" if event.is_pause else "RESUMED",
            "date": datetime.fromtimestamp(event.timestamp)
        })
    
    return history

# Usage
stream_id = 1
history = get_pause_history(stream_id)

print(f"Pause history for stream {stream_id}:")
for event in history:
    print(f"- {event['type']} at {event['date'].isoformat()}")
```

## Employee Dashboard Integration

### Display Pause Status

```typescript
interface StreamWithPauseInfo {
  id: number;
  status: 'Active' | 'Paused' | 'Cancelled' | 'Exhausted';
  pausedAt?: number;
  pauseHistory: PauseEvent[];
  totalPausedDuration: number;
}

async function getStreamWithPauseInfo(streamId: number): Promise<StreamWithPauseInfo> {
  // Get stream details
  const stream = await contract.call('get_stream', streamId);
  
  // Get pause history
  const pauseHistory = await contract.call('pause_history', streamId);
  
  // Calculate total paused duration
  let totalPausedDuration = 0;
  for (let i = 0; i < pauseHistory.length; i += 2) {
    if (i + 1 < pauseHistory.length) {
      const pauseEvent = pauseHistory[i];
      const resumeEvent = pauseHistory[i + 1];
      totalPausedDuration += resumeEvent.timestamp - pauseEvent.timestamp;
    }
  }
  
  return {
    id: stream.id,
    status: stream.status,
    pausedAt: stream.paused_at > 0 ? stream.paused_at : undefined,
    pauseHistory,
    totalPausedDuration
  };
}

// Display in UI
function renderStreamStatus(streamInfo: StreamWithPauseInfo) {
  if (streamInfo.status === 'Paused') {
    const pausedSince = new Date(streamInfo.pausedAt! * 1000);
    return `
      <div class="stream-paused">
        <span class="status-badge paused">⏸ PAUSED</span>
        <p>Paused since: ${pausedSince.toLocaleString()}</p>
        <p>Total paused time: ${formatDuration(streamInfo.totalPausedDuration)}</p>
      </div>
    `;
  }
  
  return `<span class="status-badge active">▶ ACTIVE</span>`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
```

## Notification Templates

### Email Template

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .button { background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏸ Payment Stream Paused</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>Your payment stream <strong>#{{stream_id}}</strong> has been paused by your employer.</p>
      <p><strong>Paused at:</strong> {{paused_at}}</p>
      <p>You will not receive any payments while the stream is paused. You will be notified when the stream is resumed.</p>
      <a href="{{dashboard_url}}" class="button">View Stream Details</a>
    </div>
  </div>
</body>
</html>
```

### Push Notification

```json
{
  "notification": {
    "title": "Payment Stream Paused",
    "body": "Your payment stream #{{stream_id}} has been paused",
    "icon": "/icons/pause.png",
    "badge": "/icons/badge.png",
    "data": {
      "stream_id": "{{stream_id}}",
      "action": "view_stream",
      "url": "/streams/{{stream_id}}"
    }
  }
}
```

## Best Practices

1. **Immediate Notifications**: Send notifications as soon as pause/resume events are detected
2. **Batch Processing**: If monitoring multiple contracts, batch event queries for efficiency
3. **Error Handling**: Implement retry logic for failed notifications
4. **User Preferences**: Allow employees to configure notification preferences (email, SMS, push)
5. **Rate Limiting**: Implement rate limiting to avoid notification spam
6. **Audit Trail**: Log all notifications sent for compliance and debugging
7. **Multi-Channel**: Support multiple notification channels for redundancy
8. **Localization**: Support multiple languages for international employees

## Testing

### Test Notification Flow

```typescript
// Test pause notification
async function testPauseNotification() {
  // 1. Create a test stream
  const streamId = await contract.call('create_stream', ...params);
  
  // 2. Pause the stream
  await contract.call('pause_stream', employer, streamId);
  
  // 3. Wait for event
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 4. Verify notification was sent
  const notifications = await getNotificationLog(employee);
  assert(notifications.some(n => 
    n.type === 'pause' && n.streamId === streamId
  ));
  
  console.log('✓ Pause notification test passed');
}

// Test resume notification
async function testResumeNotification() {
  // Similar to pause test but for resume
  await contract.call('resume_stream', employer, streamId);
  // ... verify resume notification
}
```

## Troubleshooting

### Common Issues

1. **Events not detected**
   - Check contract address is correct
   - Verify event filters are properly configured
   - Ensure sufficient ledger lookback period

2. **Duplicate notifications**
   - Implement deduplication logic using event IDs
   - Track processed events in database

3. **Missing employee contact info**
   - Maintain off-chain mapping of addresses to contact details
   - Implement user registration flow

4. **Delayed notifications**
   - Reduce polling interval
   - Consider using webhooks if available
   - Implement real-time event streaming

## Support

For questions or issues with the notification integration:
- Check the contract documentation
- Review event logs on the blockchain explorer
- Test with small amounts on testnet first
